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

export { creditcoinTestnet, sepolia };
