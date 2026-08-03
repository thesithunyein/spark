"use client";

import { AppShell } from "@/components/AppShell";
import { ActivityTable } from "@/components/ActivityTable";

export default function ActivityPage() {
  return (
    <AppShell title="Payments" subtitle="Your deposits and repayments. Empty until you pay.">
      <div className="mb-4 flex gap-2 text-xs">
        {["All", "Deposits", "Repayments"].map((t) => (
          <span key={t} className="rounded-full border border-border px-3 py-1 text-muted">
            {t}
          </span>
        ))}
      </div>
      <ActivityTable items={[]} />
    </AppShell>
  );
}
