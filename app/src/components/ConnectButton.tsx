"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { creditcoinTestnet } from "@/lib/wagmi";
import { shortHash } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors.find((c) => c.id === "spark-injected") ?? connectors[0];
    return (
      <button
        type="button"
        disabled={!injected || isPending}
        onClick={() => injected && connect({ connector: injected })}
        className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-accent2 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const onCredit = chainId === creditcoinTestnet.id;
  const onSepolia = chainId === sepolia.id;

  return (
    <div className="flex items-center gap-2">
      {!onSepolia && !onCredit && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: sepolia.id })}
          className="rounded-lg border border-warn/40 px-2 py-1.5 text-[11px] text-warn"
        >
          Switch network
        </button>
      )}
      <span className="hidden rounded-lg border border-border bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-muted sm:inline">
        {onSepolia ? "Sepolia" : onCredit ? "Creditcoin" : `Chain ${chainId}`}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="rounded-lg border border-border px-2.5 py-1.5 font-mono text-[11px] text-text hover:border-brand/40"
        title="Disconnect"
      >
        {shortHash(address ?? "")}
      </button>
    </div>
  );
}
