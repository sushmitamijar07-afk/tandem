// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Side} from "./interfaces/IBatchTypes.sol";
import {IBatchSettler} from "./interfaces/IBatchSettler.sol";
import {IMezoPool} from "./external/IMezoPool.sol";

/// @title BatchSettler
/// @notice Stateless clearing engine (brief §5.2 + docs/SPEC.md D10-D17). Holds no funds, no owner. The only external
///         call is `pool.getAmountOut`.
contract BatchSettler is IBatchSettler {
    uint256 public constant MAX_ORDERS = 64;

    address public immutable POOL;
    address public immutable MUSD;
    address public immutable BTC;

    constructor(address pool, address musd, address btc) {
        if (pool == address(0) || musd == address(0) || btc == address(0)) revert ZeroAddress();
        POOL = pool;
        MUSD = musd;
        BTC = btc;
    }

    /// @dev Working state of one clearing run, kept in memory to stay under the stack limit.
    struct State {
        bool[] active;
        uint256[] outs;
        uint256[] refunds;
        bool xMusd;
        uint256 routeIn;
        uint256 routeOut;
        bool anyActive;
    }

    /// @inheritdoc IBatchSettler
    function clear(Order[] calldata orders, uint256 refPrice) external view returns (Clearing memory c) {
        uint256 n = orders.length;
        if (n > MAX_ORDERS) revert TooManyOrders(n, MAX_ORDERS);
        if (refPrice == 0) revert ZeroPrice();

        State memory s;
        s.active = new bool[](n);
        s.outs = new uint256[](n);
        s.refunds = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            s.active[i] = true;
        }
        c.refPrice = refPrice;

        while (true) {
            ++c.rounds;
            s.anyActive = _iterate(orders, refPrice, s);
            if (!s.anyActive) break;
            // remove ONE failing order per pass: the one furthest below its minimum (ties: lowest index)
            (bool anyFailed, uint256 worst) = _worstFailure(orders, s);
            if (!anyFailed) break;
            s.active[worst] = false;
        }

        Fill[] memory fills = new Fill[](n);
        for (uint256 i; i < n; ++i) {
            fills[i].id = orders[i].id;
            if (s.active[i]) {
                fills[i].filled = true;
                fills[i].amountOut = s.outs[i];
                fills[i].refundIn = s.refunds[i];
            } else {
                fills[i].refundIn = orders[i].amountIn;
            }
        }
        c.fills = fills;

        if (s.anyActive) {
            c.routeBtc = !s.xMusd;
            c.routeIn = s.routeIn;
            c.routeOut = s.routeOut;
            _prices(orders, s, refPrice, c);
        }
    }

    /// @dev The active order with the largest relative shortfall `(minOut - out) / minOut`, compared by
    ///      cross-multiplication in 512 bits. Ties go to the lowest index.
    function _worstFailure(Order[] calldata orders, State memory s) private pure returns (bool found, uint256 worst) {
        uint256 bestShort;
        uint256 bestMin;
        for (uint256 i; i < orders.length; ++i) {
            if (!s.active[i] || s.outs[i] >= orders[i].minOut) continue;
            uint256 short_ = orders[i].minOut - s.outs[i];
            uint256 m = orders[i].minOut;
            // short_/m > bestShort/bestMin  <=>  short_*bestMin > bestShort*m
            if (!found || _gt(short_, bestMin, bestShort, m)) {
                found = true;
                worst = i;
                bestShort = short_;
                bestMin = m;
            }
        }
    }

    /// @dev a*b > c*d for full 256-bit operands.
    function _gt(uint256 a, uint256 b, uint256 c, uint256 d) private pure returns (bool) {
        (uint256 hi1, uint256 lo1) = _mul512(a, b);
        (uint256 hi2, uint256 lo2) = _mul512(c, d);
        return hi1 > hi2 || (hi1 == hi2 && lo1 > lo2);
    }

    function _mul512(uint256 x, uint256 y) private pure returns (uint256 hi, uint256 lo) {
        assembly ("memory-safe") {
            let mm := mulmod(x, y, not(0))
            lo := mul(x, y)
            hi := sub(sub(mm, lo), lt(mm, lo))
        }
    }

    /// @dev One clearing iteration over the active set. Returns false (and touches nothing) if no order is active.
    function _iterate(Order[] calldata orders, uint256 p, State memory s) internal view returns (bool) {
        (uint256 sb, uint256 sm) = _sums(orders, s);
        if (sb == 0 && sm == 0) return false;

        bool xMusd = sm > Math.mulDiv(sb, p, 1e18);
        s.xMusd = xMusd;

        uint256 sumY = _yOuts(orders, s, p, xMusd);
        uint256 sx = xMusd ? sm : sb;
        uint256 net = sx - sumY;
        uint256 netOut = net > 0 ? IMezoPool(POOL).getAmountOut(net, xMusd ? MUSD : BTC) : 0;
        s.routeIn = netOut > 0 ? net : 0;
        s.routeOut = netOut;

        uint256 avail = (xMusd ? sb : sm) + netOut;
        _xOuts(orders, s, xMusd, sx, avail, netOut > 0 ? 0 : net);
        return true;
    }

    function _sums(Order[] calldata orders, State memory s) private pure returns (uint256 sb, uint256 sm) {
        for (uint256 i; i < orders.length; ++i) {
            if (!s.active[i]) continue;
            if (orders[i].side == Side.SellBtc) sb += orders[i].amountIn;
            else sm += orders[i].amountIn;
        }
    }

    /// @dev Y (deficit) side paid at mid, floor.
    function _yOuts(Order[] calldata orders, State memory s, uint256 p, bool xMusd)
        private
        pure
        returns (uint256 sumY)
    {
        Side ySide = xMusd ? Side.SellBtc : Side.SellMusd;
        for (uint256 j; j < orders.length; ++j) {
            if (!s.active[j] || orders[j].side != ySide) continue;
            uint256 o = xMusd ? Math.mulDiv(orders[j].amountIn, p, 1e18) : Math.mulDiv(orders[j].amountIn, 1e18, p);
            s.outs[j] = o;
            s.refunds[j] = 0;
            sumY += o;
        }
    }

    /// @dev X (excess) side: uniform `in * avail / sx`; `dustNet` is the unroutable net to refund pro rata (else 0).
    function _xOuts(Order[] calldata orders, State memory s, bool xMusd, uint256 sx, uint256 avail, uint256 dustNet)
        private
        pure
    {
        Side xSide = xMusd ? Side.SellMusd : Side.SellBtc;
        for (uint256 i; i < orders.length; ++i) {
            if (!s.active[i] || orders[i].side != xSide) continue;
            s.outs[i] = Math.mulDiv(orders[i].amountIn, avail, sx);
            s.refunds[i] = dustNet > 0 ? Math.mulDiv(orders[i].amountIn, dustNet, sx) : 0;
        }
    }

    /// @dev Informational side prices (D16). Y side = refPrice; X side rounded against the user.
    function _prices(Order[] calldata orders, State memory s, uint256 p, Clearing memory c) internal pure {
        uint256 inBtc;
        uint256 outBtc;
        uint256 inMusd;
        uint256 outMusd;
        bool anyBtc;
        bool anyMusd;
        for (uint256 i; i < orders.length; ++i) {
            if (!s.active[i]) continue;
            uint256 eff = orders[i].amountIn - s.refunds[i];
            if (orders[i].side == Side.SellBtc) {
                anyBtc = true;
                inBtc += eff;
                outBtc += s.outs[i];
            } else {
                anyMusd = true;
                inMusd += eff;
                outMusd += s.outs[i];
            }
        }
        if (s.xMusd) {
            // X = MUSD sellers, Y = BTC sellers (exactly at mid)
            if (anyBtc) c.priceBtcSide = p;
            if (anyMusd && outMusd > 0) c.priceMusdSide = Math.mulDiv(inMusd, 1e18, outMusd, Math.Rounding.Ceil);
        } else {
            if (anyMusd) c.priceMusdSide = p;
            if (anyBtc && inBtc > 0) c.priceBtcSide = Math.mulDiv(outBtc, 1e18, inBtc);
        }
    }
}
