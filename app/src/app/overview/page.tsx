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

export default function OverviewPage() {
  const { address, isConnected } = useAccount();

  const { data: position } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) && config.creditLineAddress.startsWith("0x") && config.creditLineAddress !== "0x0000000000000000000000000000000000000000" },
  });

  const status = position ? Number(position.status) : 0;
  const credit = position ? position.credit : 0n;
  const deposit = position ? position.deposit : 0n;
  const debt = position ? position.debt : 0n;
  const chart = status === 0 ? [0, 0, 0, 0, 0] : [0, Number(deposit) / 1e18, Number(credit) / 1e18, Number(debt) / 1e18, Number(credit - debt) / 1e18];

  return (
    <AppShell
      title="Your credit"
      subtitle="Status, deposit, and next action — verified payments only."
      actions={
        <div className="flex gap-2">
          <Link href="/pay" className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
            Pay deposit
          </Link>
          <Link href="/repay" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text">
            Repay
          </Link>
        </div>
      }
    >
      {!isConnected && (
        <p className="mb-4 rounded-xl border border-border bg-panel px-4 py-3 text-sm text-muted">
          Connect a wallet to see your position. Email / injected wallets supported via the connect button.
        </p>
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
          <ActivityTable
            items={
              status === 0
                ? []
                : [
                    {
                      id: "1",
                      type: "Credit opened",
                      amount: `${formatEth(credit)} ETH`,
                      status: "Completed",
                      at: "On Creditcoin testnet",
                    },
                  ]
            }
          />
        </div>
      </div>
    </AppShell>
  );
}
