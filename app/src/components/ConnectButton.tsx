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
        className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent2"
      >
        Connect wallet
      </button>
      <ConnectModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
