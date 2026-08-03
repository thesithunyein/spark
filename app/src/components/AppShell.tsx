"use client";

import { ConnectButton } from "./ConnectButton";
import { Sidebar } from "./Sidebar";
import { config, isConfigured } from "@/lib/config";

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
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {config.demoBanner && (
          <div className="border-b border-brand/30 bg-brand/10 px-6 py-2 text-center text-xs text-brand">
            Demo funds on test network — not real bank money. Spark is testnet-ready for CEIP.
          </div>
        )}
        {!isConfigured() && (
          <div className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-center text-xs text-warn">
            Contracts not configured — set addresses in <code>.env.local</code> after deploy. UI works in
            walkthrough mode.
          </div>
        )}
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <p className="text-xs text-muted">Overview / {title}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <ConnectButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
