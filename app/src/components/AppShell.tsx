"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isConfigured() && (
          <div className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-xs text-warn sm:px-6">
            Contracts not configured — set payment and credit addresses to enable pay.
          </div>
        )}
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              className="mt-0.5 rounded-lg border border-border p-2 text-muted hover:text-text lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-muted">Spark / {title}</p>
              <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {actions}
            <ConnectButton />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
