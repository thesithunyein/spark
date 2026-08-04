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
        className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect"}
      </button>
    );
  }

  const onCredit = chainId === creditcoinTestnet.id;
  const onSepolia = chainId === sepolia.id;
  const network = onSepolia ? "Sepolia" : onCredit ? "Creditcoin" : "Wrong network";

  return (
    <div className="flex items-center gap-2">
      {!onSepolia && !onCredit && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: sepolia.id })}
          className="rounded-full border border-warn/30 px-3 py-1.5 text-[12px] text-warn"
        >
          Switch network
        </button>
      )}
      <span className="hidden rounded-full border border-border px-3 py-1.5 text-[12px] text-muted sm:inline">
        {network}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="rounded-full border border-border px-3 py-1.5 font-mono text-[12px] text-text transition hover:bg-white/[0.03]"
        title="Disconnect"
      >
        {shortHash(address ?? "")}
      </button>
    </div>
  );
}
