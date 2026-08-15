"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { ConnectButton } from "./ConnectButton";
import { Sidebar } from "./Sidebar";
import { isConfigured } from "@/lib/config";

export function AppShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isConfigured() && (
          <div className="border-b border-warn/20 bg-warn/5 px-6 py-2.5 text-center text-xs text-warn">
            Contracts not configured. Set payment and credit addresses to enable pay.
          </div>
        )}
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="border border-border p-2 text-muted transition hover:text-text lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-light tracking-[0.02em] text-text">{title}</h1>
              {subtitle && <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <ConnectButton />
          </div>
        </header>
        <main className="flex-1 px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
