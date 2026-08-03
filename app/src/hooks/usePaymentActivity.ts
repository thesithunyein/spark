"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { sepolia } from "wagmi/chains";
import { config, isConfigured } from "@/lib/config";
import { creditcoinTestnet } from "@/lib/wagmi";
import type { ActivityItem as TableItem } from "@/lib/format";

export type ActivityItem = TableItem & {
  kind: "deposit" | "repay";
};

export type ActivityFilter = "all" | "deposit" | "repay";

const depositPaid = parseAbiItem(
  "event DepositPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);
const repaymentPaid = parseAbiItem(
  "event RepaymentPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);
const creditOpened = parseAbiItem(
  "event CreditOpened(address indexed user, uint256 deposit, uint256 credit, bytes32 indexed txHash)",
);
const creditRepaid = parseAbiItem(
  "event CreditRepaid(address indexed user, uint256 amount, bytes32 indexed txHash)",
);

export function usePaymentActivity(filter: ActivityFilter = "all") {
  const { address } = useAccount();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || !isConfigured()) {
      setItems([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const next: ActivityItem[] = [];

        if (sepoliaClient) {
          const [deposits, repayments] = await Promise.all([
            sepoliaClient.getLogs({
              address: config.paymentAddress,
              event: depositPaid,
              args: { payer: address },
              fromBlock: "earliest",
              toBlock: "latest",
            }),
            sepoliaClient.getLogs({
              address: config.paymentAddress,
              event: repaymentPaid,
              args: { payer: address },
              fromBlock: "earliest",
              toBlock: "latest",
            }),
          ]);

          for (const log of deposits) {
            next.push({
              id: `${log.transactionHash}-dep`,
              type: "Deposit paid",
              amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
              status: "Confirmed",
              at: "Sepolia",
              kind: "deposit",
            });
          }
          for (const log of repayments) {
            next.push({
              id: `${log.transactionHash}-rep`,
              type: "Repayment paid",
              amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
              status: "Confirmed",
              at: "Sepolia",
              kind: "repay",
            });
          }
        }

        if (creditClient) {
          const [opened, repaid] = await Promise.all([
            creditClient.getLogs({
              address: config.creditLineAddress,
              event: creditOpened,
              args: { user: address },
              fromBlock: "earliest",
              toBlock: "latest",
            }),
            creditClient.getLogs({
              address: config.creditLineAddress,
              event: creditRepaid,
              args: { user: address },
              fromBlock: "earliest",
              toBlock: "latest",
            }),
          ]);

          for (const log of opened) {
            next.push({
              id: `${log.transactionHash}-open`,
              type: "Credit opened",
              amount: `${formatEther(log.args.credit ?? 0n)} ETH`,
              status: "Completed",
              at: "Creditcoin testnet",
              kind: "deposit",
            });
          }
          for (const log of repaid) {
            next.push({
              id: `${log.transactionHash}-crepay`,
              type: "Credit repaid",
              amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
              status: "Completed",
              at: "Creditcoin testnet",
              kind: "repay",
            });
          }
        }

        if (!cancelled) setItems(next.reverse());
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, sepoliaClient, creditClient]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  return { items: filtered, loading, empty: !loading && filtered.length === 0 };
}
