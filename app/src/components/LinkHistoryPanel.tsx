"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { type Hex, parseAbiItem } from "viem";
import { config } from "@/lib/config";
import { creditLineAbi } from "@/lib/abi";
import { formatEth } from "@/lib/format";
import { buildAttestcoinProof, type AttestcoinPhase } from "@/lib/usc";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { AttestcoinProofPanel } from "@/components/AttestcoinProofPanel";
import { encodePaymentProof } from "@/lib/format";

type HistoryPayment = {
  txHash: Hex;
  amount: bigint;
  kind: 1 | 2;
  blockNumber: bigint;
};

const depositEvent = parseAbiItem(
  "event DepositPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);
const repayEvent = parseAbiItem(
  "event RepaymentPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);

export function LinkHistoryPanel() {
  const { address, chainId, isConnected } = useAccount();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  const [scanning, setScanning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [found, setFound] = useState<HistoryPayment[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attestPhase, setAttestPhase] = useState<AttestcoinPhase | "submitting" | "done" | null>(
    null,
  );
  const [currentTx, setCurrentTx] = useState<Hex | undefined>();

  const enabled =
    Boolean(address) &&
    config.creditLineAddress !== "0x0000000000000000000000000000000000000000";

  const { data: hist, refetch: refetchHistory } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getHistory",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled },
  });

  const { data: score, refetch: refetchScore } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "creditScore",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled },
  });

  const { data: bonusBps, refetch: refetchBonus } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "historyBonusBps",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled },
  });

  const scan = useCallback(async () => {
    setError(null);
    setStatus(null);
    setFound([]);
    if (!address || !sepoliaClient || !creditClient) {
      setError("Connect a wallet first.");
      return;
    }
    if (config.paymentAddress.endsWith("0000")) {
      setError("Payment contract not configured.");
      return;
    }
    try {
      setScanning(true);
      setStatus("Scanning SepoliaPayment for your deposit/repay events…");
      const [deps, reps] = await Promise.all([
        sepoliaClient.getLogs({
          address: config.paymentAddress,
          event: depositEvent,
          args: { payer: address },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        sepoliaClient.getLogs({
          address: config.paymentAddress,
          event: repayEvent,
          args: { payer: address },
          fromBlock: 0n,
          toBlock: "latest",
        }),
      ]);

      const byTx = new Map<string, HistoryPayment>();
      for (const log of deps) {
        if (!log.transactionHash || log.args.amount == null) continue;
        byTx.set(log.transactionHash, {
          txHash: log.transactionHash,
          amount: log.args.amount,
          kind: 1,
          blockNumber: log.blockNumber ?? 0n,
        });
      }
      for (const log of reps) {
        if (!log.transactionHash || log.args.amount == null) continue;
        byTx.set(log.transactionHash, {
          txHash: log.transactionHash,
          amount: log.args.amount,
          kind: 2,
          blockNumber: log.blockNumber ?? 0n,
        });
      }

      const candidates = [...byTx.values()].sort((a, b) =>
        a.blockNumber < b.blockNumber ? -1 : 1,
      );

      const fresh: HistoryPayment[] = [];
      for (const c of candidates) {
        const used = await creditClient.readContract({
          address: config.creditLineAddress,
          abi: creditLineAbi,
          functionName: "usedTx",
          args: [c.txHash],
        });
        if (!used) fresh.push(c);
      }

      setFound(fresh);
      setStatus(
        fresh.length === 0
          ? candidates.length === 0
            ? "No Sepolia deposit/repay events found for this wallet on the payment contract."
            : "All found payments are already linked on Creditcoin."
          : `Found ${fresh.length} unlinked payment(s) ready to prove.`,
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setScanning(false);
    }
  }, [address, sepoliaClient, creditClient]);

  async function linkAll() {
    setError(null);
    if (!address || found.length === 0) return;
    try {
      setLinking(true);
      for (let i = 0; i < found.length; i++) {
        const item = found[i];
        setCurrentTx(item.txHash);
        setStatus(`Linking ${i + 1}/${found.length}: proving Sepolia tx…`);

        let proof: Hex;
        if (config.attestcoin) {
          setAttestPhase("finding_tx");
          const built = await buildAttestcoinProof(item.txHash, (phase) => setAttestPhase(phase));
          proof = built.proof;
          setAttestPhase("submitting");
        } else {
          proof = encodePaymentProof({
            txHash: item.txHash,
            payer: address,
            amountWei: item.amount,
            kind: item.kind,
          });
        }

        if (chainId !== creditcoinTestnet.id) {
          await switchChainAsync({ chainId: creditcoinTestnet.id });
        }

        setStatus(`Linking ${i + 1}/${found.length}: submitting on Creditcoin…`);
        await writeContractAsync({
          address: config.creditLineAddress,
          abi: creditLineAbi,
          functionName: "submitAttestedPayment",
          args: [
            {
              txHash: item.txHash,
              payer: address,
              amount: item.amount,
              kind: item.kind,
            },
            proof,
          ],
          chainId: creditcoinTestnet.id,
        });
      }
      setAttestPhase("done");
      setStatus("History linked. Score and LTV bonus updated.");
      setFound([]);
      await Promise.all([refetchHistory(), refetchScore(), refetchBonus()]);
    } catch (e) {
      setError(friendlyError(e));
      setAttestPhase(null);
    } finally {
      setLinking(false);
    }
  }

  const count = hist ? Number(hist.count) : 0;
  const volume = hist ? hist.volume : 0n;
  const scoreN = score != null ? Number(score) : 650;
  const bonus = bonusBps != null ? Number(bonusBps) : 0;

  return (
    <div className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-label text-muted">
        Attested payment history
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Prove past Sepolia deposits/repays via Attestcoin. They raise your credit score and can add
        up to +5% LTV when you open a line. Use separate txs from the openCredit deposit.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-muted">Score</p>
          <p className="mt-1 text-[22px] font-medium tabular-nums text-text">{scoreN}</p>
          <p className="text-[11px] text-muted">650 base · +40 / payment · cap 850</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Linked</p>
          <p className="mt-1 text-[22px] font-medium tabular-nums text-text">{count}</p>
          <p className="text-[11px] text-muted">{formatEth(volume)} ETH volume</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">LTV bonus</p>
          <p className="mt-1 text-[22px] font-medium tabular-nums text-text">+{(bonus / 100).toFixed(2)}%</p>
          <p className="text-[11px] text-muted">≥1 → +2.5% · ≥3 → +5%</p>
        </div>
      </div>

      {!isConnected && (
        <p className="mt-5 text-[13px] text-muted">Connect MetaMask to scan and link history.</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void scan()}
          disabled={!isConnected || scanning || linking}
          className="rounded-full border border-border px-4 py-2.5 text-[13px] font-medium text-text transition hover:bg-white/[0.03] disabled:opacity-50"
        >
          {scanning ? "Scanning…" : "Scan Sepolia payments"}
        </button>
        <button
          type="button"
          onClick={() => void linkAll()}
          disabled={!isConnected || linking || isPending || found.length === 0}
          className="rounded-full bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
        >
          {linking ? "Linking…" : `Link ${found.length || ""} payment${found.length === 1 ? "" : "s"}`.trim()}
        </button>
      </div>

      {found.length > 0 && (
        <ul className="mt-4 space-y-2 text-[12px] text-muted">
          {found.map((f) => (
            <li key={f.txHash} className="flex justify-between gap-3 font-mono">
              <span>
                {f.kind === 1 ? "deposit" : "repay"} · {formatEth(f.amount)} ETH
              </span>
              <span className="truncate text-text/70">{f.txHash.slice(0, 10)}…</span>
            </li>
          ))}
        </ul>
      )}

      {config.attestcoin && attestPhase && address && (
        <AttestcoinProofPanel
          phase={attestPhase}
          meta={null}
          paymentTx={currentTx}
          claim={{
            payer: address,
            amountLabel: "history",
            kind: "deposit",
          }}
        />
      )}

      {status && <p className="mt-4 text-[13px] text-muted">{status}</p>}
      {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
    </div>
  );
}
