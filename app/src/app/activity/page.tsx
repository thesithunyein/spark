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
  { id: "repay", label: "Repayments" },
];

export default function ActivityPage() {
  const { isConnected } = useAccount();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const { items, loading, empty } = usePaymentActivity(filter);

  return (
    <AppShell title="Payments" subtitle="On-chain deposits and repayments for your wallet.">
      <div className="mb-4 flex gap-2 text-xs">
        {filters.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={
              filter === t.id
                ? "rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-brand"
                : "rounded-full border border-border px-3 py-1 text-muted hover:border-brand/30"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isConnected && (
        <div className="rounded-xl border border-dashed border-border bg-panel/40 px-4 py-8 text-center">
          <p className="text-sm text-muted">Connect a wallet to load payment history.</p>
        </div>
      )}

      {isConnected && !isConfigured() && (
        <div className="rounded-xl border border-dashed border-border bg-panel/40 px-4 py-8 text-center">
          <p className="text-sm text-muted">Contracts not configured — history appears after deploy.</p>
          <Link href="/pay" className="mt-3 inline-flex text-sm font-semibold text-brand hover:underline">
            Explore Pay deposit →
          </Link>
        </div>
      )}

      {isConnected && isConfigured() && (
        <>
          {loading && <p className="mb-3 text-xs text-muted">Loading on-chain activity…</p>}
          <ActivityTable items={items} />
          {empty && (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-panel/40 px-4 py-5 text-center">
              <p className="text-sm text-muted">No payments yet — that’s expected for a new account.</p>
              <Link
                href="/pay"
                className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white"
              >
                Make your first deposit
              </Link>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
