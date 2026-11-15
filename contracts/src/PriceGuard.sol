// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPriceGuard} from "./interfaces/IPriceGuard.sol";
import {IMezoPool} from "./external/IMezoPool.sol";
import {IMezoPoolFactory} from "./external/IMezoPoolFactory.sol";
import {IPriceFeedLike} from "./external/IPriceFeedLike.sol";

/// @title PriceGuard
/// @notice View-only price reader for the Mezo MUSD/BTC pool: spot mid, pool TWAP and the MUSD PriceFeed, with band
///         checks. Holds no funds, has no owner, every parameter is immutable. See docs/SPEC.md D2-D4.
contract PriceGuard is IPriceGuard {
    address public immutable POOL;
    address public immutable FACTORY;
    address public immutable PRICE_SOURCE;
    address public immutable MUSD;
    address public immutable BTC;
    uint256 public immutable GRANULARITY;
    uint256 public constant PROBE = 1e16;
    uint256 public immutable MAX_SPOT_TWAP_BPS;
    uint256 public immutable ORACLE_BAND_BPS;

    constructor(
        address pool,
        address factory,
        address priceSource,
        address musd,
        address btc,
        uint256 granularity,
        uint256 maxSpotTwapBps,
        uint256 oracleBandBps
    ) {
        if (pool == address(0)) revert InvalidParam("pool");
        if (factory == address(0)) revert InvalidParam("factory");
        if (priceSource == address(0)) revert InvalidParam("priceSource");
        if (musd == address(0)) revert InvalidParam("musd");
        if (btc == address(0)) revert InvalidParam("btc");
        if (granularity < 1 || granularity > 8) revert InvalidParam("granularity");
        if (maxSpotTwapBps < 1 || maxSpotTwapBps > 500) revert InvalidParam("maxSpotTwapBps");
        if (oracleBandBps < 1 || oracleBandBps > 3000) revert InvalidParam("oracleBandBps");

        IMezoPool p = IMezoPool(pool);
        if (p.token0() != musd || p.token1() != btc || p.stable()) revert BadPool();
        (uint256 dec0, uint256 dec1,,,,,) = p.metadata();
        if (dec0 != 1e18 || dec1 != 1e18) revert BadPool();

        POOL = pool;
        FACTORY = factory;
        PRICE_SOURCE = priceSource;
        MUSD = musd;
        BTC = btc;
        GRANULARITY = granularity;
        MAX_SPOT_TWAP_BPS = maxSpotTwapBps;
        ORACLE_BAND_BPS = oracleBandBps;
    }

    /// @inheritdoc IPriceGuard
    function read() public view returns (Prices memory p) {
        (uint256 r0, uint256 r1,) = IMezoPool(POOL).getReserves();
        p.reserveMusd = r0;
        p.reserveBtc = r1;
        p.spot = r1 == 0 ? 0 : Math.mulDiv(r0, 1e18, r1);
        p.twap = Math.mulDiv(IMezoPool(POOL).quote(BTC, PROBE, GRANULARITY), 1e18, PROBE);
        try IPriceFeedLike(PRICE_SOURCE).fetchPrice() returns (uint256 o) {
            p.oracle = o;
        } catch {
            p.oracle = 0;
        }
        p.spotTwapBps = (p.spot == 0 || p.twap == 0) ? type(uint256).max : _bps(p.spot, p.twap, p.twap);
        p.twapOracleBps = p.oracle == 0 ? type(uint256).max : _bps(p.twap, p.oracle, p.oracle);
        p.feeBps = IMezoPoolFactory(FACTORY).getFee(POOL, false);
    }

    /// @inheritdoc IPriceGuard
    function checked() external view returns (Prices memory p) {
        p = read();
        if (p.spotTwapBps > MAX_SPOT_TWAP_BPS) {
            revert SpotTwapDeviation(p.spot, p.twap, p.spotTwapBps, MAX_SPOT_TWAP_BPS);
        }
        if (p.oracle == 0) revert OracleUnavailable();
        if (p.twapOracleBps > ORACLE_BAND_BPS) {
            revert OracleDeviation(p.twap, p.oracle, p.twapOracleBps, ORACLE_BAND_BPS);
        }
    }

    /// @dev ceil(|a-b| * 1e4 / denom)
    function _bps(uint256 a, uint256 b, uint256 denom) internal pure returns (uint256) {
        uint256 diff = a > b ? a - b : b - a;
        return Math.mulDiv(diff, 1e4, denom, Math.Rounding.Ceil);
    }
}
