import type { Config } from "wagmi";
import type { SwitchChainMutateAsync } from "wagmi/query";
import { sepolia } from "wagmi/chains";
import { creditcoinTestnet } from "@/lib/wagmi";

/** Switch wallet to Creditcoin immediately before a Creditcoin tx (never trust stale hook chainId). */
export async function ensureCreditcoinChain(switchChainAsync: SwitchChainMutateAsync<Config>) {
  await switchChainAsync({ chainId: creditcoinTestnet.id });
}

/** Switch wallet to Sepolia immediately before a Sepolia tx. */
export async function ensureSepoliaChain(switchChainAsync: SwitchChainMutateAsync<Config>) {
  await switchChainAsync({ chainId: sepolia.id });
}

/**
 * True when the wallet refused a request because it is on a different chain.
 *
 * viem phrases this as "the current chain of the wallet ... does not match the target chain",
 * which is distinct from a transaction that was sent and reverted.
 */
export function isChainMismatch(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes("does not match the target chain") ||
    message.includes("current chain of the wallet")
  );
}

/**
 * Switch the wallet to `chainId`, run a write, and retry the write once if the wallet reported
 * the previous chain.
 *
 * ── Why the retry exists ────────────────────────────────────────────────────
 * `switchChainAsync` can resolve before the connector exposes the new chain, so the write that
 * follows it is refused with a chain mismatch even though the user approved the switch a moment
 * earlier. A real participant hit this at the repay step: the app told them to switch to
 * Creditcoin while they were being asked to pay on Sepolia, which is the wrong direction and
 * reads as the app being broken. Re-switching after a short pause and retrying once removes the
 * race instead of asking the user to guess which network is wanted.
 *
 * This is why callers must not gate the switch on a cached `chainId` from `useAccount`: a stale
 * value skips the switch entirely, and the write is then refused before the retry can help.
 */
export async function runOnChain<T>(
  switchChainAsync: SwitchChainMutateAsync<Config>,
  chainId: number,
  action: () => Promise<T>,
): Promise<T> {
  await switchChainAsync({ chainId });
  try {
    return await action();
  } catch (err) {
    if (!isChainMismatch(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 750));
    await switchChainAsync({ chainId });
    return action();
  }
}

export { creditcoinTestnet, sepolia };
