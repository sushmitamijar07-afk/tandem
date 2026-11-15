// FROZEN in P1 (docs/SPEC.md). Changed only by the orchestrator.
// ABIs mirror contracts/src/interfaces/*.sol and contracts/src/external/*.sol exactly.
// After P2a merges, `pnpm abi` regenerates the three protocol ABIs from contracts/out and MUST keep
// the PriceGuard + BatchSettler errors merged into INTENT_BOOK_ABI (they bubble up through settle/preview).
import { defineChain, type Address } from "viem";

// ---------------------------------------------------------------- chain

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

export const EXPLORER_URL = "https://explorer.test.mezo.org";
export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;

// ---------------------------------------------------------------- mocks flag

/** Mocked reads for local UI work only. Never on in Vercel production, whatever the env says. */
export const USE_MOCKS: boolean =
  process.env.NEXT_PUBLIC_USE_MOCKS === "1" && process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

// ---------------------------------------------------------------- Mezo addresses (shared §3.1, LIVE set only)

export const MEZO = {
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  /** ERC-20 view of native BTC (same balance as eth_getBalance). */
  btc: "0x7b7C000000000000000000000000000000000000",
  pool: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9",
  router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
  poolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
} as const satisfies Record<string, Address>;

export const TOKEN_DECIMALS = { musd: 18, btc: 18 } as const;

/** Router Route for the one pair (volatile pool, default factory). */
export const routeOf = (from: Address, to: Address) =>
  [{ from, to, stable: false, factory: MEZO.poolFactory }] as const;

// ---------------------------------------------------------------- our contracts

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Fallback when the NEXT_PUBLIC_* env vars are unset. P3 writes the deployed values here. */
export const DEPLOYED = {
  intentBook: "0x91713e27E072Bb058973e802807B66E4BD06ba80" as Address,
  priceGuard: "0x68B5007d9BbDCc01441047454a8A99a0F3e552b6" as Address,
  batchSettler: "0xACE4757a57Cf061A8B8eA09Bc8BEa34B6f284e5c" as Address,
  deployBlock: 16794079n,
};

const envAddr = (v: string | undefined, fallback: Address): Address =>
  v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : fallback;

export const CONTRACTS = {
  intentBook: envAddr(process.env.NEXT_PUBLIC_INTENT_BOOK, DEPLOYED.intentBook),
  priceGuard: envAddr(process.env.NEXT_PUBLIC_PRICE_GUARD, DEPLOYED.priceGuard),
  batchSettler: envAddr(process.env.NEXT_PUBLIC_BATCH_SETTLER, DEPLOYED.batchSettler),
  deployBlock: process.env.NEXT_PUBLIC_DEPLOY_BLOCK
    ? BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK)
    : DEPLOYED.deployBlock,
} as const;

export const isDeployed = (a: Address) => a.toLowerCase() !== ZERO;

// ---------------------------------------------------------------- enums (mirror IBatchTypes.sol)

export const Side = { SellBtc: 0, SellMusd: 1 } as const;
export const IntentStatus = { None: 0, Open: 1, Cancelled: 2, Filled: 3, Refunded: 4 } as const;
export const BatchStatus = { Open: 0, Settled: 1, Expired: 2 } as const;
export const RefundReason = { MinOutNotMet: 0, Expired: 1 } as const;

// ---------------------------------------------------------------- ABIs

/** IntentBook: IIntentBook + Ownable2Step (owner, pendingOwner, transferOwnership, acceptOwnership, renounceOwnership)
 *  + OZ errors it can revert with + PriceGuard/BatchSettler errors that bubble up through settle()/preview(). */
export const INTENT_BOOK_ABI = [
  {
    "type": "error",
    "name": "AmountTooLarge",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadPool",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BatchClosed",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "closedAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BatchFull",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BatchNotClosed",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "closesAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BatchNotOpen",
    "inputs": [
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum BatchStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "BelowMinimum",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minimum",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "Conservation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "IntentNotOpen",
    "inputs": [
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum IntentStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidParam",
    "inputs": [
      {
        "name": "which",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotIntentOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotStarted",
    "inputs": [
      {
        "name": "startTime",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OracleDeviation",
    "inputs": [
      {
        "name": "twap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "oracle",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OracleUnavailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PoolPaused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterOutMismatch",
    "inputs": [
      {
        "name": "expected",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "received",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedUintDowncast",
    "inputs": [
      {
        "name": "bits",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SettleWindowNotOver",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SettleWindowOver",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiredAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SpotTwapDeviation",
    "inputs": [
      {
        "name": "spot",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "twap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SubmitsPaused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooManyOrders",
    "inputs": [
      {
        "name": "n",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ValueMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroMinOut",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroPrice",
    "inputs": []
  },
  {
    "type": "event",
    "name": "BatchExpired",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BatchSettled",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "settler",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "refPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "twapPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "oraclePrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reserveMusd",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reserveBtc",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "feeBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "routedBtc",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "routedIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "routedOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "priceBtcSide",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "priceMusdSide",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "rounds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IntentCancelled",
    "inputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "batchId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IntentFilled",
    "inputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "batchId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "refundIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IntentRefunded",
    "inputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "batchId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum RefundReason"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IntentSubmitted",
    "inputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "batchId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "side",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum Side"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PausedSet",
    "inputs": [
      {
        "name": "paused",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PayoutDeferred",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "batchIntentIds",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "batchTimes",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "openAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "closeAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expireAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "BTC",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancel",
    "inputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimable",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "currentBatchId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DURATION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escrowed",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "expire",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "FACTORY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBatch",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Batch",
        "components": [
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum BatchStatus"
          },
          {
            "name": "count",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "live",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "totalBtcIn",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "totalMusdIn",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "refPrice",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "twapPrice",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "oraclePrice",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "priceBtcSide",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "priceMusdSide",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "routedIn",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "routedOut",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "routedBtc",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getIntent",
    "inputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "it",
        "type": "tuple",
        "internalType": "struct Intent",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "batchId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "side",
            "type": "uint8",
            "internalType": "enum Side"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum IntentStatus"
          },
          {
            "name": "amountIn",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minOut",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "amountOut",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "refundIn",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GUARD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPriceGuard"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "intentCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "intentsOf",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_INTENTS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_BTC_IN",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_MUSD_IN",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MUSD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POOL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "preview",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "c",
        "type": "tuple",
        "internalType": "struct IBatchSettler.Clearing",
        "components": [
          {
            "name": "refPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "routeBtc",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "routeIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "routeOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "priceBtcSide",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "priceMusdSide",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rounds",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fills",
            "type": "tuple[]",
            "internalType": "struct IBatchSettler.Fill[]",
            "components": [
              {
                "name": "id",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "filled",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "amountOut",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "refundIn",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          }
        ]
      },
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct IPriceGuard.Prices",
        "components": [
          {
            "name": "spot",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "twap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oracle",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "spotTwapBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "twapOracleBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserveMusd",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserveBtc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "feeBps",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ROUTER",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setPaused",
    "inputs": [
      {
        "name": "paused_",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settle",
    "inputs": [
      {
        "name": "batchId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "SETTLE_TIMEOUT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SETTLER",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IBatchSettler"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "START",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitSellBtc",
    "inputs": [
      {
        "name": "minMusdOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "submitSellMusd",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minBtcOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "intentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "totalClaimable",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

/** PriceGuard: IPriceGuard (read/checked + immutable getters + errors). */
export const PRICE_GUARD_ABI = [
  {
    "type": "error",
    "name": "BadPool",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidParam",
    "inputs": [
      {
        "name": "which",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "OracleDeviation",
    "inputs": [
      {
        "name": "twap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "oracle",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OracleUnavailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SpotTwapDeviation",
    "inputs": [
      {
        "name": "spot",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "twap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "BTC",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "checked",
    "inputs": [],
    "outputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct IPriceGuard.Prices",
        "components": [
          {
            "name": "spot",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "twap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oracle",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "spotTwapBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "twapOracleBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserveMusd",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserveBtc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "feeBps",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "FACTORY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GRANULARITY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SPOT_TWAP_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MUSD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_BAND_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POOL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PRICE_SOURCE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROBE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "read",
    "inputs": [],
    "outputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct IPriceGuard.Prices",
        "components": [
          {
            "name": "spot",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "twap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oracle",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "spotTwapBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "twapOracleBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserveMusd",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserveBtc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "feeBps",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** BatchSettler: IBatchSettler (clear + immutable getters + errors). */
export const BATCH_SETTLER_ABI = [
  {
    "type": "error",
    "name": "TooManyOrders",
    "inputs": [
      {
        "name": "n",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroPrice",
    "inputs": []
  },
  {
    "type": "function",
    "name": "BTC",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "clear",
    "inputs": [
      {
        "name": "orders",
        "type": "tuple[]",
        "internalType": "struct IBatchSettler.Order[]",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "side",
            "type": "uint8",
            "internalType": "enum Side"
          },
          {
            "name": "amountIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minOut",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "refPrice",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "c",
        "type": "tuple",
        "internalType": "struct IBatchSettler.Clearing",
        "components": [
          {
            "name": "refPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "routeBtc",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "routeIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "routeOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "priceBtcSide",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "priceMusdSide",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rounds",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fills",
            "type": "tuple[]",
            "internalType": "struct IBatchSettler.Fill[]",
            "components": [
              {
                "name": "id",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "filled",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "amountOut",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "refundIn",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_ORDERS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MUSD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POOL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** Mezo MUSD/BTC Pool (minimal, Appendix A). */
export const POOL_ABI = [
  {
    "type": "function",
    "name": "getReserves",
    "inputs": [],
    "outputs": [
      {
        "name": "_reserve0",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_reserve1",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_blockTimestampLast",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quote",
    "inputs": [
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "granularity",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAmountOut",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "token0",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "token1",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "stable",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "metadata",
    "inputs": [],
    "outputs": [
      {
        "name": "dec0",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "dec1",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "r0",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "r1",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "st",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "t0",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "t1",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastObservation",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IMezoPool.Observation",
        "components": [
          {
            "name": "timestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserve0Cumulative",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reserve1Cumulative",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "observationLength",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "observations",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "timestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserve0Cumulative",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserve1Cumulative",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sync",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

/** Mezo Router (minimal, Appendix A). Route = { from, to, stable, factory }. */
export const ROUTER_ABI = [
  {
    "type": "function",
    "name": "swapExactTokensForTokens",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMin",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "routes",
        "type": "tuple[]",
        "internalType": "struct IMezoRouter.Route[]",
        "components": [
          {
            "name": "from",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "to",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "stable",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "factory",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amounts",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAmountsOut",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "routes",
        "type": "tuple[]",
        "internalType": "struct IMezoRouter.Route[]",
        "components": [
          {
            "name": "from",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "to",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "stable",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "factory",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "amounts",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolFor",
    "inputs": [
      {
        "name": "tokenA",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenB",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "stable",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "_factory",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "pool",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** Mezo PoolFactory (minimal, Appendix A). */
export const POOL_FACTORY_ABI = [
  {
    "type": "function",
    "name": "getFee",
    "inputs": [
      {
        "name": "pool",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_stable",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isPaused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** MUSD-system PriceFeed (minimal, Appendix A). Reverts "PriceFeed: Oracle is stale." when > 60 s old. */
export const PRICE_FEED_ABI = [
  {
    "type": "function",
    "name": "fetchPrice",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** ERC-20 (MUSD and the BTC precompile view). */
export const ERC20_ABI = [
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
