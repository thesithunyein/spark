"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Check, Copy, LogOut, Settings, ChevronDown } from "lucide-react";
import { creditcoinTestnet } from "@/lib/wagmi";
import { shortHash } from "@/lib/format";

export function AccountMenu() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onSepolia = chainId === sepolia.id;
  const onCredit = chainId === creditcoinTestnet.id;
  const network = onSepolia ? "Sepolia" : onCredit ? "Creditcoin" : "Unknown";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!address) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[12px] transition hover:bg-white/[0.03]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="hidden text-muted sm:inline">{network}</span>
        <span className="font-mono text-text">{shortHash(address)}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-border bg-panel p-2 shadow-soft"
        >
          <div className="border-b border-border px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-label text-muted">Account</p>
            <p className="mt-1 break-all font-mono text-[12px] text-text">{address}</p>
            <p className="mt-1 text-[11px] text-muted">Wallet is your identity. No password stored.</p>
          </div>

          <ul className="py-1">
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyAddress()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-text transition hover:bg-white/[0.04]"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted" />}
                {copied ? "Copied" : "Copy address"}
              </button>
            </li>
            <li>
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-text transition hover:bg-white/[0.04]"
              >
                <Settings className="h-4 w-4 text-muted" />
                Settings
              </Link>
            </li>
          </ul>

          <div className="border-t border-border px-3 py-2">
            <p className="mb-2 text-[11px] text-muted">Network</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => switchChain({ chainId: sepolia.id })}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] transition ${
                  onSepolia ? "bg-white/[0.08] text-text" : "text-muted hover:bg-white/[0.04]"
                }`}
              >
                Sepolia
              </button>
              <button
                type="button"
                onClick={() => switchChain({ chainId: creditcoinTestnet.id })}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] transition ${
                  onCredit ? "bg-white/[0.08] text-text" : "text-muted hover:bg-white/[0.04]"
                }`}
              >
                Creditcoin
              </button>
            </div>
          </div>

          <div className="border-t border-border p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-red-400 transition hover:bg-white/[0.04]"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
