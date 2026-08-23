"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AccountMenu } from "./AccountMenu";
import { ConnectModal } from "./ConnectModal";

export function ConnectButton() {
  const { isConnected } = useAccount();
  const [open, setOpen] = useState(false);

  if (isConnected) {
    return <AccountMenu />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.18em] text-white"
      >
        Connect wallet
      </button>
      <ConnectModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
