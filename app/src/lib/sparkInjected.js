import { createConnector } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, numberToHex, SwitchChainError } from "viem";

/** Minimal injected connector — avoids wagmi/connectors barrel (Coinbase/x402). */
export function sparkInjected() {
  return createConnector((config) => ({
    id: "spark-injected",
    name: "Browser wallet",
    type: "injected",
    async setup() {},
    async connect({ chainId } = {}) {
      const provider = typeof window !== "undefined" ? window.ethereum : undefined;
      if (!provider) throw new Error("No browser wallet found. Install MetaMask.");
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      let currentChainId = Number(await provider.request({ method: "eth_chainId" }));
      if (chainId && currentChainId !== chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: numberToHex(chainId) }],
          });
          currentChainId = chainId;
        } catch {
          throw new SwitchChainError(new Error("Switch network in your wallet"));
        }
      }
      return {
        accounts: accounts.map((a) => getAddress(a)),
        chainId: currentChainId,
      };
    },
    async disconnect() {},
    async getAccounts() {
      const provider = typeof window !== "undefined" ? window.ethereum : undefined;
      if (!provider) return [];
      const accounts = await provider.request({ method: "eth_accounts" });
      return accounts.map((a) => getAddress(a));
    },
    async getChainId() {
      const provider = typeof window !== "undefined" ? window.ethereum : undefined;
      if (!provider) return sepolia.id;
      return Number(await provider.request({ method: "eth_chainId" }));
    },
    async getProvider() {
      return typeof window !== "undefined" ? window.ethereum : undefined;
    },
    async isAuthorized() {
      const accounts = await this.getAccounts();
      return accounts.length > 0;
    },
    async switchChain({ chainId }) {
      const provider = typeof window !== "undefined" ? window.ethereum : undefined;
      if (!provider) throw new SwitchChainError(new Error("No provider"));
      const chain = config.chains.find((c) => c.id === chainId);
      if (!chain) throw new SwitchChainError(new Error("Unknown chain"));
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(chainId) }],
        });
      } catch (e) {
        if (e?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: numberToHex(chainId),
                chainName: chain.name,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: chain.rpcUrls.default.http,
                blockExplorerUrls: chain.blockExplorers
                  ? [chain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          });
        } else {
          throw new SwitchChainError(e);
        }
      }
      return chain;
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) config.emitter.emit("disconnect");
      else
        config.emitter.emit("change", {
          accounts: accounts.map((a) => getAddress(a)),
        });
    },
    onChainChanged(chain) {
      config.emitter.emit("change", { chainId: Number(chain) });
    },
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
