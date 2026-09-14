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
import { GEN2, GEN2_CREDIT_LINE_ABI } from "@/lib/gen2";
import { formatEth, statusLabel } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";
import { usePaymentActivity } from "@/hooks/usePaymentActivity";

export default function OverviewPage() {
  const { address, isConnected } = useAccount();
  const { items: recent } = usePaymentActivity("all");

  const { data: position, isFetching: isFetchingPos } = useReadContract({
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

  const { data: score, isFetching: isFetchingScore } = useReadContract({
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

  const { data: hist, isFetching: isFetchingHist } = useReadContract({
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

  // Generation 2, read separately because a balance-sized line lives on a different
  // contract. Without this, a wallet that opened a line through the deposit-free path sees
  // "No credit line yet" on its own overview, which reads as a broken product rather than
  // as a second generation.
  const { data: gen2Position } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const { data: gen2Available } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "availableCredit",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) },
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

  const gen2Status = gen2Position ? Number(gen2Position.status) : 0;
  const gen2Open = gen2Status === 1;
  const gen2Credit = gen2Position ? gen2Position.credit : 0n;
  const gen2Attested = gen2Position ? gen2Position.attestedBalance : 0n;
  const gen2Drawable = gen2Available ?? 0n;

  // The metric cards below describe a line. When the only line this wallet has is the
  // balance-sized one, they should describe that line instead of showing zeroes alongside a
  // banner that says a line is open.
  const gen2Only = gen2Open && status !== 1;
  const cardAvailable = gen2Only ? gen2Drawable : available;
  const cardStatusLabel = gen2Only ? "Active (balance-sized)" : statusLabel(status);
  const cardStatusHint = gen2Only
    ? "Sized from an attested balance · 10% APR on debt"
    : debt > 0n
      ? `Debt ${formatEth(debt)} sCREDIT (accruing)`
      : undefined;
  const cardDepositHint = gen2Only
    ? "Nothing deposited: the balance was proven instead"
    : attestedBalance > 0n
      ? `Attested Sepolia bal ${formatEth(attestedBalance)} ETH`
      : undefined;

  return (
    <AppShell
      title="Overview"
      subtitle="Your credit line after verified payment."
      actions={
        <div className="hidden gap-2 sm:flex">
          <Link
            href="/pay"
            className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.18em] text-white"
          >
            Pay deposit
          </Link>
          <Link
            href="/withdraw"
            className=" border border-border px-4 py-2 text-[13px] font-medium text-text transition hover:border-accent/40 hover:bg-accent/[0.05]"
          >
            Withdraw
          </Link>
          <Link
            href="/repay"
            className=" border border-border px-4 py-2 text-[13px] font-medium text-text transition hover:border-accent/40 hover:bg-accent/[0.05]"
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
          <Link href="/pay" className="mt-4 inline-flex text-[13px] font-medium text-accent2 transition hover:text-accent3 hover:underline">
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
              <Link href="/pay" className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white">
                Pay deposit
              </Link>
            }
          />
        </div>
      )}

      <OnboardingChecklist hasCreditLine={status === 1 || status === 2 || gen2Open} />

      {/* Generation 2 carries its own header, because the overview's own position read is
          generation 1 and would otherwise report this wallet as having nothing at all. */}
      {isConnected && gen2Open && (
        <div className="mb-8 max-w-2xl">
          <SuccessBanner
            title={`Generation-2 line open · ${formatEth(gen2Credit)} ETH limit`}
            description={`${formatEth(gen2Attested)} ETH proven on Sepolia, no deposit. ${formatEth(
              gen2Drawable,
            )} ETH is available to draw on the balance credit page.`}
            actions={
              <Link
                href="/balance"
                className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
              >
                Balance credit
              </Link>
            }
          />
        </div>
      )}

      {isConnected && status === 0 && !gen2Open && (
        <div className="mb-8 max-w-lg">
          <p className="text-[15px] font-medium text-text">No credit line yet</p>
          <p className="mt-1 text-[13px] text-muted">Pay a deposit, verify it, then credit unlocks.</p>
          <Link
            href="/pay"
            className="btn-shine mt-4 inline-flex px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
          >
            Pay deposit
          </Link>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Credit available"
          value={`${formatEth(cardAvailable)} sCREDIT`}
          loading={isFetchingPos}
          hint={
            gen2Only
              ? "Ready to draw on Balance credit · 10% APR on debt"
              : status === 1
                ? "Ready to withdraw · 10% APR on debt"
                : status === 2
                  ? "Closed"
                  : "—"
          }
        />
        <MetricCard
          label="Deposit locked"
          value={`${formatEth(deposit)} ETH`}
          loading={isFetchingPos}
          hint={cardDepositHint}
        />
        <MetricCard
          label="Credit score"
          value={scoreN != null ? String(scoreN) : "—"}
          loading={isFetchingScore || isFetchingHist}
          hint={histCount > 0 ? `${histCount} attested payment${histCount === 1 ? "" : "s"}` : "Link history to raise"}
        />
        <MetricCard
          label="Status"
          value={cardStatusLabel}
          loading={isFetchingPos}
          hint={cardStatusHint}
        />
      </div>

      {isConnected && histCount === 0 && status === 0 && !gen2Open && (
        <p className="mt-3 text-[13px] text-muted">
          <Link href="/score" className="text-accent2 transition hover:text-accent3 hover:underline">
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
            <Link href="/activity" className="text-[12px] text-accent2 transition hover:text-accent3">
              View all
            </Link>
          </div>
          <ActivityTable items={activity} />
          <div className="mt-4 flex gap-2 sm:hidden">
            <Link
              href="/pay"
              className="btn-shine flex-1 px-3 py-2.5 text-center font-mono text-[12px] uppercase tracking-[0.16em] text-white"
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
