"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { useState, type ReactNode } from "react";
import { config as appConfig } from "@/lib/config";
import { sparkInjected } from "@/lib/sparkInjected";

export const creditcoinTestnet = defineChain({
  id: appConfig.creditChainId,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "CTC", symbol: "CTC", decimals: 18 },
  rpcUrls: {
    default: { http: [appConfig.creditcoinRpc || "https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: appConfig.explorerCreditcoin },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [sepolia, creditcoinTestnet],
  connectors: [sparkInjected()],
  transports: {
    [sepolia.id]: http(appConfig.sepoliaRpc || undefined),
    [creditcoinTestnet.id]: http(appConfig.creditcoinRpc || undefined),
  },
  ssr: true,
  // Don't auto-reconnect after the user explicitly disconnects (see sparkInjected flag).
  multiInjectedProviderDiscovery: false,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
