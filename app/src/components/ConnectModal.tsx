"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect } from "wagmi";
import { X } from "lucide-react";
import { setSparkInjectedProvider } from "@/lib/sparkInjected";

function findMetaMaskProvider(): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!eth) return undefined;
  const list = Array.isArray(eth.providers) && eth.providers.length > 0 ? eth.providers : [eth];
  return (
    list.find((p) => p.isMetaMask && !p.isRabby && !p.isPhantom) ||
    (eth.isMetaMask ? eth : undefined)
  );
}

type EthereumProvider = {
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
};

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, connectors, isPending, error } = useConnect();
  const [mounted, setMounted] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setHasMetaMask(Boolean(findMetaMaskProvider()));
  }, [open]);

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

  function connectMetaMask() {
    if (!injected) return;
    const provider = findMetaMaskProvider();
    if (provider) setSparkInjectedProvider(provider);
    connect({ connector: injected }, { onSuccess: () => onClose() });
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-panel p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-medium text-text">Connect wallet</h2>
            <p className="mt-1 text-[13px] text-muted">Your wallet is your Spark account.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-white/[0.04] hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2">
          <li>
            <button
              type="button"
              disabled={!injected || isPending || !hasMetaMask}
              onClick={connectMetaMask}
              className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:bg-white/[0.03] disabled:opacity-40"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white/[0.04]">
                {/* Official MetaMask fox icon (from MetaMask extension brand assets) */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/metamask.png" alt="MetaMask" width={20} height={20} className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-[14px] font-medium text-text">MetaMask</span>
                <span className="block text-[12px] text-muted">
                  {hasMetaMask ? "Browser extension" : "Install MetaMask to continue"}
                </span>
              </span>
            </button>
          </li>
        </ul>

        {!hasMetaMask && (
          <p className="mt-3 text-[12px] text-muted">
            Install{" "}
            <a
              className="text-brand hover:underline"
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
            >
              MetaMask
            </a>
            , then refresh this page.
          </p>
        )}

        {error && <p className="mt-3 text-[12px] text-red-400">{error.message}</p>}
        {isPending && <p className="mt-3 text-[12px] text-muted">Confirm in MetaMask…</p>}
      </div>
    </div>,
    document.body,
  );
}
