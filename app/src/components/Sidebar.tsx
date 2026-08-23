"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Undo2, List, CircleHelp, Settings, X, BadgeCheck } from "lucide-react";
import { Logo } from "./Logo";

const items = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/pay", label: "Pay deposit", icon: ArrowDownToLine },
  { href: "/score", label: "Credit score", icon: BadgeCheck },
  { href: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { href: "/transfer", label: "Send & Receive", icon: ArrowLeftRight },
  { href: "/repay", label: "Repay", icon: Undo2 },
  { href: "/activity", label: "Payments", icon: List },
  { href: "/help", label: "Help", icon: CircleHelp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-border bg-bg/95 backdrop-blur-xl transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="anim anim-fade-in flex items-center justify-between px-5 py-6">
          <Logo />
          <button
            type="button"
            className="p-1.5 text-muted transition hover:bg-white/[0.04] hover:text-text lg:hidden"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-3">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={clsx(
                      "relative flex items-center gap-2.5 px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] transition-[background-color,color,transform] duration-300 hover:translate-x-0.5",
                      active
                        ? "bg-white/[0.06] text-text"
                        : "text-muted hover:bg-white/[0.03] hover:text-text",
                    )}
                  >
                    {/* Active indicator bar */}
                    <span
                      className={clsx(
                        "absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
                        active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
                      )}
                      aria-hidden
                    />
                    <Icon
                      className={clsx(
                        "h-[15px] w-[15px] transition-transform duration-300",
                        active ? "text-white" : "text-muted",
                      )}
                      strokeWidth={1.75}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-5 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
            Verified payment credit
          </p>
        </div>
      </aside>
    </>
  );
}