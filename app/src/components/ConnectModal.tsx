"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect } from "wagmi";
import { Wallet, QrCode, X } from "lucide-react";

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, connectors, isPending, error } = useConnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const injected = connectors.find((c) => c.id === "spark-injected" || c.id === "injected");
  const wc = connectors.find((c) => c.id === "walletConnect");

  const options = [
    {
      id: "browser",
      title: "Browser wallet",
      hint: "MetaMask, Rabby, and others",
      icon: Wallet,
      connector: injected,
    },
    {
      id: "wc",
      title: "WalletConnect",
      hint: wc ? "Scan with mobile wallet" : "Set NEXT_PUBLIC_WALLETCONNECT_ID",
      icon: QrCode,
      connector: wc,
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-panel p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-medium text-text">Connect wallet</h2>
            <p className="mt-1 text-[13px] text-muted">Your wallet is your Spark account.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/[0.04] hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            const disabled = !opt.connector || isPending;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (!opt.connector) return;
                    connect(
                      { connector: opt.connector },
                      { onSuccess: () => onClose() },
                    );
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:bg-white/[0.03] disabled:opacity-40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
                    <Icon className="h-4 w-4 text-brand" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium text-text">{opt.title}</span>
                    <span className="block text-[12px] text-muted">{opt.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="mt-3 text-[12px] text-red-400">{error.message}</p>}
        {isPending && <p className="mt-3 text-[12px] text-muted">Confirm in your wallet…</p>}
      </div>
    </div>,
    document.body,
  );
}
