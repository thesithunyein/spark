"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { PositionSnapshot } from "@/components/PositionSnapshot";
import { ActivityTable } from "@/components/ActivityTable";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { SuccessBanner } from "@/components/SuccessBanner";
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

  const { data: score } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "creditScore",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled:
        Boolean(address) &&
        config.creditLineAddress !== "0x0000000000000000000000000000000000000000",
    },
  });

  const { data: hist } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getHistory",
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
  const attestedBalance = position ? position.attestedBalance : 0n;
  const available = status === 1 && credit > debt ? credit - debt : 0n;
  const activity = recent.slice(0, 5);
  const scoreN = score != null ? Number(score) : null;
  const histCount = hist ? Number(hist.count) : 0;

  return (
    <AppShell
      title="Overview"
      subtitle="Your credit line after verified payment."
      actions={
        <div className="hidden gap-2 sm:flex">
          <Link
            href="/pay"
            className=" bg-white px-4 py-2 font-mono text-[12px] uppercase tracking-[0.18em] text-black transition hover:bg-white/85"
          >
            Pay deposit
          </Link>
          <Link
            href="/withdraw"
            className=" border border-border px-4 py-2 text-[13px] font-medium text-text transition hover:bg-white/[0.03]"
          >
            Withdraw
          </Link>
          <Link
            href="/repay"
            className=" border border-border px-4 py-2 text-[13px] font-medium text-text transition hover:bg-white/[0.03]"
          >
            Repay
          </Link>
        </div>
      }
    >
      {!isConnected && (
        <div className="mb-8 max-w-lg">
          <p className="text-[15px] font-medium text-text">Connect a wallet to view credit</p>
          <p className="mt-1 text-[13px] text-muted">Start with a small deposit to open a line.</p>
          <Link href="/pay" className="mt-4 inline-flex text-[13px] font-medium text-white hover:underline">
            Go to Pay deposit →
          </Link>
        </div>
      )}

      {isConnected && histCount > 0 && status === 0 && (
        <div className="mb-8">
          <SuccessBanner
            title={`Credit score ${scoreN ?? 650} · +${histCount >= 3 ? "5.00" : "2.50"}% LTV bonus`}
            description={`${histCount} attested payment${histCount === 1 ? "" : "s"} on file. Ready to open credit with a new deposit.`}
            actions={
              <Link href="/pay" className=" bg-white px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-black">
                Pay deposit
              </Link>
            }
          />
        </div>
      )}

      <OnboardingChecklist hasCreditLine={status === 1 || status === 2} />

      {isConnected && status === 0 && (
        <div className="mb-8 max-w-lg">
          <p className="text-[15px] font-medium text-text">No credit line yet</p>
          <p className="mt-1 text-[13px] text-muted">Pay a deposit, verify it, then credit unlocks.</p>
          <Link
            href="/pay"
            className="mt-4 inline-flex bg-white px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-black"
          >
            Pay deposit
          </Link>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Credit available"
          value={`${formatEth(available)} sCREDIT`}
          hint={status === 1 ? "Ready to withdraw · 10% APR on debt" : status === 2 ? "Closed" : "—"}
        />
        <MetricCard
          label="Deposit locked"
          value={`${formatEth(deposit)} ETH`}
          hint={
            attestedBalance > 0n ? `Attested Sepolia bal ${formatEth(attestedBalance)} ETH` : undefined
          }
        />
        <MetricCard
          label="Credit score"
          value={scoreN != null ? String(scoreN) : "—"}
          hint={histCount > 0 ? `${histCount} attested payment${histCount === 1 ? "" : "s"}` : "Link history to raise"}
        />
        <MetricCard
          label="Status"
          value={statusLabel(status)}
          hint={debt > 0n ? `Debt ${formatEth(debt)} sCREDIT (accruing)` : undefined}
        />
      </div>

      {isConnected && histCount === 0 && status === 0 && (
        <p className="mt-3 text-[13px] text-muted">
          <Link href="/score" className="text-white hover:underline">
            Link payment history
          </Link>{" "}
          to raise score and LTV before opening credit.
        </p>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PositionSnapshot deposit={deposit} credit={credit} debt={debt} empty={status === 0} />
        </div>
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Activity</p>
            <Link href="/activity" className="text-[12px] text-muted transition hover:text-text">
              View all
            </Link>
          </div>
          <ActivityTable items={activity} />
          <div className="mt-4 flex gap-2 sm:hidden">
            <Link
              href="/pay"
              className="flex-1 bg-white px-3 py-2.5 text-center font-mono text-[12px] uppercase tracking-[0.16em] text-black"
            >
              Pay deposit
            </Link>
            <Link
              href="/withdraw"
              className="flex-1 border border-border px-3 py-2.5 text-center text-[13px] font-medium"
            >
              Withdraw
            </Link>
            <Link
              href="/repay"
              className="flex-1 border border-border px-3 py-2.5 text-center text-[13px] font-medium"
            >
              Repay
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
