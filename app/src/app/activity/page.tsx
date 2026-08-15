"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/AppShell";
import { ActivityTable } from "@/components/ActivityTable";
import { usePaymentActivity, type ActivityFilter } from "@/hooks/usePaymentActivity";
import { isConfigured } from "@/lib/config";

const filters: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposits" },
  { id: "withdraw", label: "Withdraws" },
  { id: "redeem", label: "Redeems" },
  { id: "repay", label: "Repayments" },
  { id: "credit", label: "Credit" },
  { id: "transfer", label: "Transfers" },
];

export default function ActivityPage() {
  const { isConnected } = useAccount();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const { items, loading, empty } = usePaymentActivity(filter);

  return (
    <AppShell
      title="Payments"
      subtitle="Deposits, withdraws, redeems, repayments, and credit events for your wallet."
    >
      <div className="mb-6 flex flex-wrap gap-1">
        {filters.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={
              filter === t.id
                ? " bg-white/[0.08] px-3.5 py-1.5 text-[13px] font-medium text-text"
                : " px-3.5 py-1.5 text-[13px] text-muted transition hover:text-text"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isConnected && (
        <p className="text-[13px] text-muted">Connect a wallet to load payment history.</p>
      )}

      {isConnected && !isConfigured() && (
        <div>
          <p className="text-[13px] text-muted">Contracts not configured. History appears after deploy.</p>
          <Link href="/pay" className="mt-3 inline-flex text-[13px] font-medium text-brand hover:underline">
            Explore Pay deposit →
          </Link>
        </div>
      )}

      {isConnected && isConfigured() && (
        <>
          {loading && <p className="mb-3 text-[12px] text-muted">Loading…</p>}
          {!loading && empty ? (
            <div className=" border border-dashed border-border px-5 py-12 text-center">
              <p className="text-[13px] text-muted">No activity yet</p>
              <Link
                href="/pay"
                className="mt-4 inline-flex bg-brand px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
              >
                Make your first deposit
              </Link>
            </div>
          ) : (
            !loading && <ActivityTable items={items} />
          )}
        </>
      )}
    </AppShell>
  );
}
