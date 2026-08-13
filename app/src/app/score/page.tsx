"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LinkHistoryPanel } from "@/components/LinkHistoryPanel";

export default function ScorePage() {
  return (
    <AppShell
      title="Credit score"
      subtitle="Your verified Sepolia payment history is your credit score — no oracle."
    >
      <div className="mx-auto max-w-xl space-y-6">
        <LinkHistoryPanel />
        <p className="text-[13px] text-muted">
          Tip: make 2–3 small deposits first, link them here, then{" "}
          <Link href="/pay" className="text-brand hover:underline">
            Pay deposit
          </Link>{" "}
          with a <em>new</em> tx to open credit at the boosted LTV.
        </p>
      </div>
    </AppShell>
  );
}
