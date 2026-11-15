import type { Abi, Hash, TransactionReceipt } from "viem";
import type { Config } from "wagmi";
import { getAccount, getPublicClient, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { mezoTestnet } from "@/lib/contracts";
import { isSmartAccountConnector } from "@/lib/wagmi";

const CHAIN_ID = mezoTestnet.id;

export interface WriteSpec {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  /** Calls with try/catch inside (settle, expire) need x1.5 instead of x1.25. */
  heavy?: boolean;
}

/** Gas padding for the Mezo RPC's low estimates: max(estimate x 1.25, 60_000). x1.5 for settle/expire. */
export function padGas(estimate: bigint, heavy = false): bigint {
  const padded = (estimate * (heavy ? 150n : 125n)) / 100n;
  return padded > 60_000n ? padded : 60_000n;
}

export async function executeWrite(
  config: Config,
  spec: WriteSpec,
  onHash: (hash: Hash) => void,
): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  const account = getAccount(config);
  const base = {
    address: spec.address,
    abi: spec.abi,
    functionName: spec.functionName,
    args: spec.args,
    ...(spec.value !== undefined ? { value: spec.value } : {}),
    chainId: CHAIN_ID,
  };

  let gas: bigint | undefined;
  if (!isSmartAccountConnector(account.connector)) {
    // A revert here carries the custom error, so it surfaces before the wallet opens.
    const pub = getPublicClient(config, { chainId: CHAIN_ID });
    if (pub) {
      const { chainId: _c, ...call } = base;
      void _c;
      const estimate = await pub.estimateContractGas({ ...call, account: account.address } as never);
      gas = padGas(estimate as bigint, spec.heavy);
    }
  }
  const hash = await writeContract(config, { ...base, ...(gas ? { gas } : {}) } as never);
  onHash(hash);
  const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID });
  if (receipt.status !== "success") throw Object.assign(new Error("Transaction reverted"), { hash });
  return { hash, receipt };
}
