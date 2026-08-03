"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, ArrowDownToLine, Undo2, List, Shield, Settings } from "lucide-react";
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
    items: [
      { href: "/advanced", label: "Advanced", icon: Shield },
      { href: "/advanced#settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-panel/80 backdrop-blur-md">
      <div className="px-4 py-5">
        <Logo />
        <p className="mt-1.5 text-[11px] leading-snug text-muted">Verified payment credit</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "#");
                const Icon = item.icon;
                return (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                        active
                          ? "bg-accent/15 text-text shadow-[inset_2px_0_0_0_#A855F7]"
                          : "text-muted hover:bg-white/5 hover:text-text",
                      )}
                    >
                      <Icon className={clsx("h-4 w-4", active ? "text-accent" : "text-muted")} />
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
          className="block rounded-xl border border-border bg-panel2 px-3 py-2.5 text-xs text-muted hover:border-accent/40 hover:text-text"
        >
          Attestcoin powers verification
        </a>
      </div>
    </aside>
  );
}
