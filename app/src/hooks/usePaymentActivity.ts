"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { sepolia } from "wagmi/chains";
import { config, isConfigured } from "@/lib/config";
import { creditcoinTestnet } from "@/lib/wagmi";
import { creditLineAbi } from "@/lib/abi";
import { formatEth, type ActivityItem as TableItem } from "@/lib/format";

export type ActivityItem = TableItem & {
  kind: "deposit" | "repay";
};

export type ActivityFilter = "all" | "deposit" | "repay";

const LOOKBACK = 120_000n; // public RPCs reject full-history eth_getLogs

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

const JOURNAL_KEY = "spark.activity.v1";

type JournalEntry = ActivityItem;

function readJournal(address: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, JournalEntry[]>;
    return all[address.toLowerCase()] ?? [];
  } catch {
    return [];
  }
}

export function journalActivity(address: string, entry: JournalEntry) {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, JournalEntry[]>;
    const key = address.toLowerCase();
    const prev = all[key] ?? [];
    if (prev.some((p) => p.id === entry.id)) return;
    all[key] = [entry, ...prev].slice(0, 50);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

async function fromBlock(client: { getBlockNumber: () => Promise<bigint> }) {
  const latest = await client.getBlockNumber();
  return latest > LOOKBACK ? latest - LOOKBACK : 0n;
}

export function usePaymentActivity(filter: ActivityFilter = "all") {
  const { address } = useAccount();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: position } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: Boolean(address) && isConfigured(),
    },
  });

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
        const seen = new Set<string>();

        const push = (item: ActivityItem) => {
          if (seen.has(item.id)) return;
          seen.add(item.id);
          next.push(item);
        };

        // Local journal (survives RPC log failures)
        for (const j of readJournal(address!)) push(j);

        if (sepoliaClient) {
          try {
            const start = await fromBlock(sepoliaClient);
            const [deposits, repayments] = await Promise.all([
              sepoliaClient.getLogs({
                address: config.paymentAddress,
                event: depositPaid,
                args: { payer: address },
                fromBlock: start,
                toBlock: "latest",
              }),
              sepoliaClient.getLogs({
                address: config.paymentAddress,
                event: repaymentPaid,
                args: { payer: address },
                fromBlock: start,
                toBlock: "latest",
              }),
            ]);

            for (const log of deposits) {
              push({
                id: `${log.transactionHash}-dep`,
                type: "Deposit paid",
                amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
                status: "Confirmed",
                at: "Sepolia",
                kind: "deposit",
                href: `${config.explorerSepolia}/tx/${log.transactionHash}`,
              });
            }
            for (const log of repayments) {
              push({
                id: `${log.transactionHash}-rep`,
                type: "Repayment paid",
                amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
                status: "Confirmed",
                at: "Sepolia",
                kind: "repay",
                href: `${config.explorerSepolia}/tx/${log.transactionHash}`,
              });
            }
          } catch {
            /* RPC range / archive limits */
          }
        }

        if (creditClient) {
          try {
            const start = await fromBlock(creditClient);
            const [opened, repaid] = await Promise.all([
              creditClient.getLogs({
                address: config.creditLineAddress,
                event: creditOpened,
                args: { user: address },
                fromBlock: start,
                toBlock: "latest",
              }),
              creditClient.getLogs({
                address: config.creditLineAddress,
                event: creditRepaid,
                args: { user: address },
                fromBlock: start,
                toBlock: "latest",
              }),
            ]);

            for (const log of opened) {
              push({
                id: `${log.transactionHash}-open`,
                type: "Credit opened",
                amount: `${formatEther(log.args.credit ?? 0n)} ETH`,
                status: "Completed",
                at: "Creditcoin",
                kind: "deposit",
                href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
              });
            }
            for (const log of repaid) {
              push({
                id: `${log.transactionHash}-crepay`,
                type: "Credit repaid",
                amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
                status: "Completed",
                at: "Creditcoin",
                kind: "repay",
                href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
              });
            }
          } catch {
            /* RPC range / archive limits */
          }
        }

        // Position-backed fallback when eth_getLogs fails (public RPC range limits).
        // openTxHash / closeTxHash store the Sepolia payment hash used as the claim.
        if (position && Number(position.status) !== 0) {
          const openHash = position.openTxHash;
          if (openHash && openHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            push({
              id: `${openHash}-dep`,
              type: "Deposit paid",
              amount: `${formatEth(position.deposit)} ETH`,
              status: "Confirmed",
              at: "Sepolia",
              kind: "deposit",
              href: `${config.explorerSepolia}/tx/${openHash}`,
            });
            push({
              id: `${openHash}-open`,
              type: "Credit opened",
              amount: `${formatEth(position.credit)} ETH`,
              status: "Completed",
              at: "Creditcoin",
              kind: "deposit",
            });
          }
          const closeHash = position.closeTxHash;
          if (
            Number(position.status) === 2 &&
            closeHash &&
            closeHash !== "0x0000000000000000000000000000000000000000000000000000000000000000"
          ) {
            push({
              id: `${closeHash}-rep`,
              type: "Repayment paid",
              amount: `${formatEth(position.deposit)} ETH`,
              status: "Confirmed",
              at: "Sepolia",
              kind: "repay",
              href: `${config.explorerSepolia}/tx/${closeHash}`,
            });
          }
        }

        if (!cancelled) setItems(next);
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
  }, [address, sepoliaClient, creditClient, position]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  return { items: filtered, loading, empty: !loading && filtered.length === 0 };
}
