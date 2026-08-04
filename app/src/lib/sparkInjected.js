import { createConnector } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, numberToHex, SwitchChainError } from "viem";

const DISCONNECT_KEY = "spark.wallet.disconnected";

/** Provider chosen from Connect modal (MetaMask). */
let selectedProvider = undefined;

export function setSparkInjectedProvider(provider) {
  selectedProvider = provider;
}

export function clearSparkInjectedProvider() {
  selectedProvider = undefined;
}

function wasUserDisconnected() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISCONNECT_KEY) === "1";
  } catch {
    return false;
  }
}

function markDisconnected() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCONNECT_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearDisconnectedFlag() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISCONNECT_KEY);
  } catch {
    /* ignore */
  }
}

function findMetaMaskProvider() {
  if (typeof window === "undefined") return undefined;
  const eth = window.ethereum;
  if (!eth) return undefined;

  const list = Array.isArray(eth.providers) && eth.providers.length > 0 ? eth.providers : [eth];
  const metamask = list.find((p) => p?.isMetaMask && !p?.isRabby && !p?.isPhantom);
  return metamask || (eth.isMetaMask ? eth : undefined);
}

function resolveProvider() {
  if (selectedProvider) return selectedProvider;
  return findMetaMaskProvider();
}

/** MetaMask-only injected connector — avoids wagmi/connectors barrel (Coinbase/x402). */
export function sparkInjected() {
  return createConnector((config) => ({
    id: "spark-injected",
    name: "MetaMask",
    type: "injected",
    async setup() {},
    async connect({ chainId } = {}) {
      const provider = resolveProvider();
      if (!provider) {
        throw new Error("MetaMask not found. Install the MetaMask browser extension.");
      }
      selectedProvider = provider;
      clearDisconnectedFlag();

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
    async disconnect() {
      markDisconnected();
      const provider = resolveProvider();
      selectedProvider = undefined;
      try {
        if (provider?.request) {
          await provider.request({
            method: "wallet_revokePermissions",
            params: [{ eth_accounts: {} }],
          });
        }
      } catch {
        // MetaMask may not support revoke on all versions — flag still blocks reconnect.
      }
    },
    async getAccounts() {
      if (wasUserDisconnected()) return [];
      const provider = resolveProvider();
      if (!provider) return [];
      const accounts = await provider.request({ method: "eth_accounts" });
      return accounts.map((a) => getAddress(a));
    },
    async getChainId() {
      const provider = resolveProvider();
      if (!provider) return sepolia.id;
      return Number(await provider.request({ method: "eth_chainId" }));
    },
    async getProvider() {
      return resolveProvider();
    },
    async isAuthorized() {
      if (wasUserDisconnected()) return false;
      const accounts = await this.getAccounts();
      return accounts.length > 0;
    },
    async switchChain({ chainId }) {
      const provider = resolveProvider();
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
      if (accounts.length === 0) {
        markDisconnected();
        selectedProvider = undefined;
        config.emitter.emit("disconnect");
      } else {
        clearDisconnectedFlag();
        config.emitter.emit("change", {
          accounts: accounts.map((a) => getAddress(a)),
        });
      }
    },
    onChainChanged(chain) {
      config.emitter.emit("change", { chainId: Number(chain) });
    },
    onDisconnect() {
      markDisconnected();
      selectedProvider = undefined;
      config.emitter.emit("disconnect");
    },
  }));
}
