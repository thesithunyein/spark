"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen bg-bg">
      {/* Subtle purple ambient background, echoing the landing video's palette */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -10%, rgba(139, 92, 246, 0.10), transparent 60%), radial-gradient(ellipse 60% 45% at 100% 110%, rgba(124, 58, 237, 0.07), transparent 60%)",
        }}
      />
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
              className="border border-border p-2 text-muted transition hover:bg-white/[0.04] hover:text-text lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div key={`heading-${pathname}`} className="anim anim-fade-up min-w-0">
              <h1 className="truncate text-[22px] font-light tracking-[0.02em] text-text">{title}</h1>
              {subtitle && <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div key={`actions-${pathname}`} className="anim anim-fade-up anim-delay-1 flex items-center gap-2">
              {actions}
            </div>
            <ConnectButton />
          </div>
        </header>
        <main className="relative flex-1 px-4 py-6 sm:px-8 sm:py-8" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <div key={`content-${pathname}`} className="anim anim-fade-up stagger">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}