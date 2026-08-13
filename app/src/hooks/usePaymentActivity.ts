"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { sepolia } from "wagmi/chains";
import { config, isConfigured } from "@/lib/config";
import { creditcoinTestnet } from "@/lib/wagmi";
import { creditLineAbi } from "@/lib/abi";
import { formatEth, type ActivityItem as TableItem } from "@/lib/format";

export type ActivityKind =
  | "deposit"
  | "repay"
  | "withdraw"
  | "redeem"
  | "credit"
  | "transfer"
  | "attest";

export type ActivityItem = TableItem & {
  kind: ActivityKind;
};

export type ActivityFilter =
  | "all"
  | "deposit"
  | "withdraw"
  | "redeem"
  | "repay"
  | "credit"
  | "transfer";

const JOURNAL_EVENT = "spark-activity-journal";
const JOURNAL_KEY = "spark.activity.v1";
const LOOKBACK = 30_000n;
const LOG_TIMEOUT_MS = 8_000;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const depositPaid = parseAbiItem(
  "event DepositPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);
const repaymentPaid = parseAbiItem(
  "event RepaymentPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);
const creditOpened = parseAbiItem(
  "event CreditOpened(address indexed user, uint256 deposit, uint256 attestedBalance, uint256 credit, uint256 factorBps, bytes32 indexed depositTxHash, bytes32 balanceTxHash)",
);
const creditRepaid = parseAbiItem(
  "event CreditRepaid(address indexed user, uint256 amount, bytes32 indexed txHash)",
);
const creditWithdrawn = parseAbiItem(
  "event CreditWithdrawn(address indexed user, uint256 amount, uint256 debt)",
);
const creditRedeemed = parseAbiItem(
  "event CreditRedeemed(address indexed user, uint256 amount, uint256 debt)",
);
const creditClosed = parseAbiItem(
  "event CreditClosed(address indexed user, bytes32 indexed txHash)",
);

function readJournal(address: string): ActivityItem[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, ActivityItem[]>;
    return all[address.toLowerCase()] ?? [];
  } catch {
    return [];
  }
}

/** Sepolia repay logged in journal but Creditcoin repayCredit not yet done. */
export function getPendingSepoliaRepay(
  address: string,
): { txHash: `0x${string}`; amountLabel: string } | null {
  const journal = readJournal(address);
  if (journal.some((e) => e.type === "Credit repaid")) return null;
  const repay = journal.find((e) => e.type === "Repayment paid" && e.at === "Sepolia");
  if (!repay?.href) return null;
  const m = repay.href.match(/\/tx\/(0x[a-fA-F0-9]{64})/i);
  if (!m) return null;
  return {
    txHash: m[1] as `0x${string}`,
    amountLabel: (repay.amount ?? "0").replace(/\s*ETH\s*$/i, "").trim(),
  };
}

export function journalActivity(address: string, entry: ActivityItem) {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, ActivityItem[]>;
    const key = address.toLowerCase();
    const prev = all[key] ?? [];
    if (prev.some((p) => p.id === entry.id)) return;
    all[key] = [entry, ...prev].slice(0, 100);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(JOURNAL_EVENT));
  } catch {
    /* ignore */
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("rpc timeout")), ms);
    }),
  ]);
}

async function fromBlock(client: { getBlockNumber: () => Promise<bigint> }) {
  const latest = await withTimeout(client.getBlockNumber(), LOG_TIMEOUT_MS);
  return latest > LOOKBACK ? latest - LOOKBACK : 0n;
}

function mergeItems(sources: ActivityItem[][]): ActivityItem[] {
  const seen = new Set<string>();
  const next: ActivityItem[] = [];
  for (const source of sources) {
    for (const item of source) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      next.push(item);
    }
  }
  return next;
}

function itemsFromPosition(
  position:
    | {
        status: number;
        deposit: bigint;
        credit: bigint;
        openTxHash: `0x${string}`;
        closeTxHash: `0x${string}`;
      }
    | undefined,
): ActivityItem[] {
  if (!position || Number(position.status) === 0) return [];

  const items: ActivityItem[] = [];
  const openHash = position.openTxHash;
  if (openHash && openHash !== ZERO_HASH) {
    items.push({
      id: `${openHash}-dep-pos`,
      type: "Deposit paid",
      amount: `${formatEth(position.deposit)} ETH`,
      status: "Confirmed",
      at: "Sepolia",
      kind: "deposit",
      href: `${config.explorerSepolia}/tx/${openHash}`,
    });
  }

  const closeHash = position.closeTxHash;
  if (Number(position.status) === 2 && closeHash && closeHash !== ZERO_HASH) {
    items.push({
      id: `${closeHash}-close-pos`,
      type: "Credit closed",
      amount: `${formatEth(position.deposit)} ETH`,
      status: "Completed",
      at: "Creditcoin",
      kind: "credit",
      href: `${config.explorerCreditcoin}/tx/${closeHash}`,
    });
  }

  return items;
}

export function usePaymentActivity(filter: ActivityFilter = "all") {
  const { address } = useAccount();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const [logItems, setLogItems] = useState<ActivityItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [journalTick, setJournalTick] = useState(0);

  useEffect(() => {
    const bump = () => setJournalTick((t) => t + 1);
    window.addEventListener(JOURNAL_EVENT, bump);
    return () => window.removeEventListener(JOURNAL_EVENT, bump);
  }, []);

  const { data: position, isPending: positionPending } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: Boolean(address) && isConfigured(),
    },
  });

  const journalItems = useMemo(
    () => (address ? readJournal(address) : []),
    [address, journalTick],
  );

  const positionItems = useMemo(() => itemsFromPosition(position), [position]);

  const openTxHash = position?.openTxHash;
  const closeTxHash = position?.closeTxHash;
  const positionStatus = position ? Number(position.status) : 0;

  useEffect(() => {
    if (!address || !isConfigured()) {
      setLogItems([]);
      setLoadingLogs(false);
      return;
    }

    let cancelled = false;

    async function loadLogs() {
      setLoadingLogs(true);
      const next: ActivityItem[] = [];

      const push = (item: ActivityItem) => {
        if (next.some((n) => n.id === item.id)) return;
        next.push(item);
      };

      if (sepoliaClient) {
        try {
          const start = await fromBlock(sepoliaClient);
          const [deposits, repayments] = await withTimeout(
            Promise.all([
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
            ]),
            LOG_TIMEOUT_MS,
          );

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
          /* timeout or RPC range limits */
        }
      }

      if (creditClient && !cancelled) {
        try {
          const start = await fromBlock(creditClient);
          const [opened, repaid, withdrawn, redeemed, closed] = await withTimeout(
            Promise.all([
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
              creditClient.getLogs({
                address: config.creditLineAddress,
                event: creditWithdrawn,
                args: { user: address },
                fromBlock: start,
                toBlock: "latest",
              }),
              creditClient.getLogs({
                address: config.creditLineAddress,
                event: creditRedeemed,
                args: { user: address },
                fromBlock: start,
                toBlock: "latest",
              }),
              creditClient.getLogs({
                address: config.creditLineAddress,
                event: creditClosed,
                args: { user: address },
                fromBlock: start,
                toBlock: "latest",
              }),
            ]),
            LOG_TIMEOUT_MS,
          );

          for (const log of opened) {
            push({
              id: `${log.transactionHash}-open`,
              type: "Credit opened",
              amount: `${formatEther(log.args.credit ?? 0n)} sCREDIT`,
              status: "Completed",
              at: "Creditcoin",
              kind: "credit",
              href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
            });
          }
          for (const log of repaid) {
            push({
              id: `${log.transactionHash}-crepay`,
              type: "Credit repaid",
              amount: `${formatEther(log.args.amount ?? 0n)} sCREDIT`,
              status: "Completed",
              at: "Creditcoin",
              kind: "repay",
              href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
            });
          }
          for (const log of withdrawn) {
            push({
              id: `${log.transactionHash}-wd`,
              type: "Credit withdrawn",
              amount: `${formatEther(log.args.amount ?? 0n)} sCREDIT`,
              status: "Completed",
              at: "Creditcoin",
              kind: "withdraw",
              href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
            });
          }
          for (const log of redeemed) {
            push({
              id: `${log.transactionHash}-rd`,
              type: "Credit redeemed",
              amount: `${formatEther(log.args.amount ?? 0n)} sCREDIT`,
              status: "Completed",
              at: "Creditcoin",
              kind: "redeem",
              href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
            });
          }
          for (const log of closed) {
            push({
              id: `${log.transactionHash}-closed`,
              type: "Credit closed",
              amount: "—",
              status: "Completed",
              at: "Creditcoin",
              kind: "credit",
              href: `${config.explorerCreditcoin}/tx/${log.transactionHash}`,
            });
          }
        } catch {
          /* timeout or RPC range limits */
        }
      }

      if (!cancelled) {
        setLogItems(next);
        setLoadingLogs(false);
      }
    }

    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, [address, sepoliaClient, creditClient, openTxHash, closeTxHash, positionStatus, journalTick]);

  const items = useMemo(() => {
    const merged = mergeItems([journalItems, positionItems, logItems]);
    return merged.sort((a, b) => {
      const rank = (id: string) => (journalItems.some((j) => j.id === id) ? 1 : 0);
      return rank(b.id) - rank(a.id);
    });
  }, [journalItems, positionItems, logItems]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const hasFastData = journalItems.length > 0 || positionItems.length > 0;
  const loading =
    Boolean(address) &&
    isConfigured() &&
    !hasFastData &&
    (positionPending || loadingLogs);

  return { items: filtered, loading, empty: !loading && filtered.length === 0 };
}
