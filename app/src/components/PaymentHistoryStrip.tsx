"use client";

import Link from "next/link";
import { ActivityTable } from "@/components/ActivityTable";
import { usePaymentActivity } from "@/hooks/usePaymentActivity";

type PaymentHistoryStripProps = {
  limit?: number;
  title?: string;
};

export function PaymentHistoryStrip({
  limit = 5,
  title = "Payment history",
}: PaymentHistoryStripProps) {
  const { items, loading } = usePaymentActivity("all");
  const recent = items.slice(0, limit);

  if (loading && recent.length === 0) {
    return (
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-[12px] text-muted">Loading payment history…</p>
      </div>
    );
  }

  if (recent.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-label text-muted">{title}</p>
        <Link href="/activity" className="text-[12px] text-muted transition hover:text-text">
          View all
        </Link>
      </div>
      <ActivityTable items={recent} />
    </div>
  );
}
