"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, ArrowDownToLine, Undo2, List, Shield, X } from "lucide-react";
import { Logo } from "./Logo";

const nav = [
  {
    label: "Credit",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/pay", label: "Pay deposit", icon: ArrowDownToLine },
      { href: "/repay", label: "Repay", icon: Undo2 },
    ],
  },
  {
    label: "Activity",
    items: [{ href: "/activity", label: "Payments", icon: List }],
  },
  {
    label: "Utility",
    items: [{ href: "/advanced", label: "Advanced", icon: Shield }],
  },
];

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-border bg-panel/95 backdrop-blur-md transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-start justify-between px-4 py-5">
          <div>
            <Logo />
            <p className="mt-1.5 text-[11px] leading-snug text-muted">Verified payment credit</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-text lg:hidden"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {nav.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href + item.label}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={clsx(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                          active
                            ? "bg-brand/15 text-text shadow-[inset_2px_0_0_0_#FF6600]"
                            : "text-muted hover:bg-white/5 hover:text-text",
                        )}
                      >
                        <Icon className={clsx("h-4 w-4", active ? "text-brand" : "text-muted")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <a
            href="https://docs.creditcoin.org/creditcoin-usc"
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-border bg-panel2 px-3 py-2.5 text-xs text-muted hover:border-brand/40 hover:text-text"
          >
            Attestcoin powers verification
          </a>
        </div>
      </aside>
    </>
  );
}
