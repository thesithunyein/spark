"use client";

import { useAccount, useConnect } from "wagmi";
import { AccountMenu } from "./AccountMenu";

export function ConnectButton() {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();

  if (isConnected) {
    return <AccountMenu />;
  }

  const injected = connectors.find((c) => c.id === "spark-injected") ?? connectors[0];

  return (
    <button
      type="button"
      disabled={!injected || isPending}
      onClick={() => injected && connect({ connector: injected })}
      className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
