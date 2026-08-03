"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ActivityTable } from "@/components/ActivityTable";

export default function ActivityPage() {
  return (
    <AppShell title="Payments" subtitle="Deposits and repayments appear here after you pay.">
      <div className="mb-4 flex gap-2 text-xs">
        {["All", "Deposits", "Repayments"].map((t, i) => (
          <span
            key={t}
            className={
              i === 0
                ? "rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-brand"
                : "rounded-full border border-border px-3 py-1 text-muted"
            }
          >
            {t}
          </span>
        ))}
      </div>
      <ActivityTable items={[]} />
      <div className="mt-4 rounded-xl border border-dashed border-border bg-panel/40 px-4 py-5 text-center">
        <p className="text-sm text-muted">No payments yet — that’s expected for a new account.</p>
        <Link
          href="/pay"
          className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white"
        >
          Make your first deposit
        </Link>
      </div>
    </AppShell>
  );
}
