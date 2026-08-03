"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { SimpleChart } from "@/components/SimpleChart";
import { ActivityTable } from "@/components/ActivityTable";
import { config } from "@/lib/config";
import { creditLineAbi } from "@/lib/abi";
import { formatEth, statusLabel } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";
import { usePaymentActivity } from "@/hooks/usePaymentActivity";

export default function OverviewPage() {
  const { address, isConnected } = useAccount();
  const { items: recent } = usePaymentActivity("all");

  const { data: position } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled:
        Boolean(address) &&
        config.creditLineAddress !== "0x0000000000000000000000000000000000000000",
    },
  });

  const status = position ? Number(position.status) : 0;
  const credit = position ? position.credit : 0n;
  const deposit = position ? position.deposit : 0n;
  const debt = position ? position.debt : 0n;
  const chart =
    status === 0
      ? [0, 0, 0, 0, 0]
      : [
          0,
          Number(deposit) / 1e18,
          Number(credit) / 1e18,
          Number(debt) / 1e18,
          Number(credit - debt) / 1e18,
        ];

  return (
    <AppShell
      title="Your credit"
      subtitle="See status and take the next step. Payments are verified before credit moves."
      actions={
        <div className="hidden gap-2 sm:flex">
          <Link href="/pay" className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">
            Pay deposit
          </Link>
          <Link
            href="/repay"
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text hover:border-brand/40"
          >
            Repay
          </Link>
        </div>
      }
    >
      {!isConnected && (
        <div className="mb-4 rounded-xl border border-border bg-panel px-4 py-4 text-sm text-muted">
          <p className="font-medium text-text">Connect your wallet to see your credit line.</p>
          <p className="mt-1">New here? Start by paying a small demo deposit.</p>
          <Link href="/pay" className="mt-3 inline-flex text-sm font-semibold text-brand hover:underline">
            Go to Pay deposit →
          </Link>
        </div>
      )}

      {isConnected && status === 0 && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-4 text-sm">
          <p className="font-medium text-text">No credit line yet</p>
          <p className="mt-1 text-muted">Pay a deposit, verify the payment, then your credit unlocks.</p>
          <Link
            href="/pay"
            className="mt-3 inline-flex rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white"
          >
            Pay deposit
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Credit available"
          value={`${formatEth(credit)} ETH`}
          hint={status === 1 ? "Active line" : status === 2 ? "Closed" : "No line yet"}
          glow
        />
        <MetricCard label="Deposit locked" value={`${formatEth(deposit)} ETH`} />
        <MetricCard
          label="Status"
          value={statusLabel(status)}
          hint={debt > 0n ? `Debt ${formatEth(debt)} ETH` : undefined}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SimpleChart points={chart} />
        </div>
        <div className="lg:col-span-2">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Recent activity</p>
          <ActivityTable items={recent.slice(0, 5)} />
          {recent.length === 0 && isConnected && (
            <p className="mt-2 text-xs text-muted">No on-chain activity yet.</p>
          )}
          <Link href="/activity" className="mt-2 inline-flex text-xs font-semibold text-brand hover:underline">
            View all payments →
          </Link>
          <div className="mt-3 flex gap-2 sm:hidden">
            <Link href="/pay" className="flex-1 rounded-lg bg-brand px-3 py-2 text-center text-xs font-semibold text-white">
              Pay deposit
            </Link>
            <Link
              href="/repay"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-xs font-semibold"
            >
              Repay
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
