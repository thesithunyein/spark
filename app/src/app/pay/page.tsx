"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import {
  parseEther,
  keccak256,
  toBytes,
  decodeEventLog,
  parseAbiItem,
  type Hex,
  type Log,
} from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { AttestcoinProofPanel } from "@/components/AttestcoinProofPanel";
import { ConnectButton } from "@/components/ConnectButton";
import { SuccessBanner } from "@/components/SuccessBanner";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodePaymentProof, formatEth } from "@/lib/format";
import {
  buildAttestcoinProofPair,
  type AttestcoinPhase,
  type AttestcoinProofMeta,
} from "@/lib/usc";
import { ensureCreditcoinChain, ensureSepoliaChain } from "@/lib/chains";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";
import { useChainTxConfirmation } from "@/hooks/useChainTxConfirmation";
import { clearPayFlow, loadPayFlow, savePayFlow } from "@/lib/flowState";

const depositPaidEvent = parseAbiItem(
  "event DepositPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);

function readAttestedBalance(logs: Log[], payment: `0x${string}`): bigint | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== payment.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: sepoliaPaymentAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "BalanceAttested") {
        return decoded.args.ethBalance as bigint;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

export default function PayPage() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const [amount, setAmount] = useState("0.01");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [balanceTxHash, setBalanceTxHash] = useState<Hex | undefined>();
  const [attestedBalanceWei, setAttestedBalanceWei] = useState<bigint | null>(null);
  const [creditTx, setCreditTx] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [attestPhase, setAttestPhase] = useState<AttestcoinPhase | "submitting" | "done" | null>(
    null,
  );
  const [attestMeta, setAttestMeta] = useState<Partial<AttestcoinProofMeta> | null>(null);
  const [verifyStartedAt, setVerifyStartedAt] = useState<number | null>(null);
  const [proving, setProving] = useState(false);
  const [resumeReady, setResumeReady] = useState(false);
  const autoAttemptHash = useRef<string | null>(null);
  const provingRef = useRef(false);
  const hydrated = useRef(false);
  const lastAttestPhaseRef = useRef<AttestcoinPhase | "submitting" | null>(null);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const sepoliaTx = useChainTxConfirmation(sepolia.id);

  const { data: position, refetch: refetchPosition } = useReadContract({
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
  const hasActiveLine = status === 1;
  const lineClosed = status === 2;
  const histCount = hist ? Number(hist.count) : 0;

  // Hydrate from session + detect unfinished Sepolia deposit.
  useEffect(() => {
    if (!address || !creditClient || !publicClient || hydrated.current) return;
    hydrated.current = true;

    void (async () => {
      if (hasActiveLine) {
        clearPayFlow(address);
        setStep(4);
        setResumeReady(true);
        return;
      }

      const saved = loadPayFlow(address);
      if (saved?.txHash) {
        try {
          const used = await creditClient.readContract({
            address: config.creditLineAddress,
            abi: creditLineAbi,
            functionName: "usedTx",
            args: [saved.txHash],
          });
          if (used && hasActiveLine) {
            clearPayFlow(address);
            setStep(4);
            setCreditTx(saved.creditTx);
            setResumeReady(true);
            return;
          }
          if (!used) {
            setTxHash(saved.txHash);
            setAmount(saved.amount || "0.01");
            if (saved.balanceTxHash) setBalanceTxHash(saved.balanceTxHash);
            if (saved.attestedBalanceWei) setAttestedBalanceWei(BigInt(saved.attestedBalanceWei));
            sepoliaTx.track(saved.txHash);
            if (saved.step === 3) {
              setStep(3);
              setVerifyStartedAt(saved.updatedAt ?? Date.now());
              setAttestPhase("waiting_attestation");
              lastAttestPhaseRef.current = "waiting_attestation";
              setStatusNote("Resumed — tap Verify. Don't pay again.");
            } else {
              setStep(2);
              setStatusNote("Resumed — tap Verify. Don't pay again.");
            }
            setResumeReady(true);
            return;
          }
        } catch {
          /* fall through to chain scan */
        }
      }

      // Scan newest unused DepositPaid on payment contract.
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = latest > 50_000n ? latest - 50_000n : 0n;
        const logs = await publicClient.getLogs({
          address: config.paymentAddress,
          event: depositPaidEvent,
          args: { payer: address },
          fromBlock,
          toBlock: "latest",
        });
        for (let i = logs.length - 1; i >= 0; i--) {
          const log = logs[i];
          if (!log.transactionHash || log.args.amount == null) continue;
          const used = await creditClient.readContract({
            address: config.creditLineAddress,
            abi: creditLineAbi,
            functionName: "usedTx",
            args: [log.transactionHash],
          });
          if (used) continue;
          setTxHash(log.transactionHash);
          setAmount(formatEth(log.args.amount));
          sepoliaTx.track(log.transactionHash);
          setStep(2);
          savePayFlow(address, {
            txHash: log.transactionHash,
            amount: formatEth(log.args.amount),
            step: 2,
          });
          setStatusNote("Found unused deposit — tap Verify. Don't pay again.");
          setResumeReady(true);
          return;
        }
      } catch {
        /* ignore scan errors */
      }
      setResumeReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, creditClient, publicClient, hasActiveLine]);

  useEffect(() => {
    if (!address || !txHash || step < 2 || step === 4) return;
    const persistStep = (step === 3 ? 3 : 2) as 2 | 3;
    savePayFlow(address, {
      txHash,
      amount,
      balanceTxHash,
      attestedBalanceWei: attestedBalanceWei?.toString(),
      creditTx,
      step: persistStep,
    });
  }, [address, txHash, amount, balanceTxHash, attestedBalanceWei, creditTx, step]);

  async function onPay() {
    setError(null);
    autoAttemptHash.current = null;
    provingRef.current = false;
    setProving(false);
    setAttestPhase(null);
    setAttestMeta(null);
    lastAttestPhaseRef.current = null;
    setCreditTx(undefined);
    setBalanceTxHash(undefined);
    setAttestedBalanceWei(null);
    setVerifyStartedAt(null);
    sepoliaTx.reset();
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (hasActiveLine) {
      setError("You already have an active credit line. Withdraw or repay first.");
      setStep(4);
      return;
    }
    if (config.paymentAddress.endsWith("0000")) {
      setError("Payment contract not configured yet.");
      return;
    }
    try {
      if (chainId !== sepolia.id) {
        await ensureSepoliaChain(switchChainAsync);
      }
      setStep(1);
      const ref = keccak256(toBytes(`spark-${address}-${Date.now()}`));
      const hash = await writeContractAsync({
        address: config.paymentAddress,
        abi: sepoliaPaymentAbi,
        functionName: "payDeposit",
        args: [ref],
        value: parseEther(amount || "0.01"),
        chainId: sepolia.id,
      });
      setTxHash(hash);
      sepoliaTx.track(hash);
      setStep(2);
      savePayFlow(address, { txHash: hash, amount: amount || "0.01", step: 2 });
      journalActivity(address, {
        id: `${hash}-dep`,
        type: "Deposit paid",
        amount: `${amount || "0.01"} ETH`,
        status: "Confirmed",
        at: "Sepolia",
        kind: "deposit",
        href: `${config.explorerSepolia}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
      setStep(0);
    }
  }

  async function attestSepoliaBalance(): Promise<{ hash: Hex; balanceWei: bigint }> {
    if (!address || !publicClient) throw new Error("Wallet / RPC not ready.");
    if (chainId !== sepolia.id) {
      await ensureSepoliaChain(switchChainAsync);
    }
    const ref = keccak256(toBytes(`spark-bal-${address}-${Date.now()}`));
    const hash = await writeContractAsync({
      address: config.paymentAddress,
      abi: sepoliaPaymentAbi,
      functionName: "attestBalance",
      args: [ref],
      chainId: sepolia.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const balanceWei = readAttestedBalance(receipt.logs, config.paymentAddress);
    if (balanceWei == null) {
      throw new Error("BalanceAttested event missing from receipt.");
    }
    journalActivity(address, {
      id: `${hash}-bal`,
      type: "Balance attested",
      amount: `${formatEth(balanceWei)} ETH`,
      status: "Confirmed",
      at: "Sepolia",
      kind: "attest",
      href: `${config.explorerSepolia}/tx/${hash}`,
    });
    return { hash, balanceWei };
  }

  async function onProveAndOpen() {
    setError(null);
    setStatusNote(null);
    setCreditTx(undefined);
    if (!address || !txHash) return;
    if (provingRef.current) return;
    if (config.creditLineAddress.endsWith("0000")) {
      setError("CreditLine not configured yet.");
      return;
    }
    provingRef.current = true;
    setProving(true);
    try {
      if (creditClient) {
        const used = await creditClient.readContract({
          address: config.creditLineAddress,
          abi: creditLineAbi,
          functionName: "usedTx",
          args: [txHash],
        });
        if (used) {
          const pos = await refetchPosition();
          if (pos.data && Number(pos.data.status) === 1) {
            clearPayFlow(address);
            setStep(4);
            setAttestPhase("done");
            setStatusNote(null);
            return;
          }
          setError(
            "This Sepolia deposit was already used on Creditcoin. Start a fresh Pay deposit if you want a new line.",
          );
          setStep(0);
          sepoliaTx.reset();
          clearPayFlow(address);
          return;
        }
      }

      setStep(3);
      if (!verifyStartedAt) setVerifyStartedAt(Date.now());
      const amountWei = parseEther(amount || "0.01");

      setStatusNote("Recording balance…");
      let balHash: Hex;
      let balanceWei: bigint;
      if (balanceTxHash && attestedBalanceWei != null) {
        balHash = balanceTxHash;
        balanceWei = attestedBalanceWei;
      } else {
        const attested = await attestSepoliaBalance();
        balHash = attested.hash;
        balanceWei = attested.balanceWei;
      }
      setBalanceTxHash(balHash);
      setAttestedBalanceWei(balanceWei);
      savePayFlow(address, {
        txHash,
        amount: amount || "0.01",
        balanceTxHash: balHash,
        attestedBalanceWei: balanceWei.toString(),
        step: 3,
      });

      let depositProof: Hex;
      let balanceProof: Hex;

      if (config.attestcoin) {
        setAttestPhase("finding_tx");
        setAttestMeta(null);
        setStatusNote("Verifying… usually 8–20 min");
        const pair = await buildAttestcoinProofPair(txHash, balHash, ({ phase, meta }) => {
          lastAttestPhaseRef.current = phase;
          setAttestPhase(phase);
          if (meta) setAttestMeta((prev) => ({ ...prev, ...meta }));
          if (phase === "building_proof") setStatusNote("Building proof…");
        });
        depositProof = pair.deposit.proof;
        balanceProof = pair.balance.proof;
        setAttestMeta(pair.balance.meta);
        lastAttestPhaseRef.current = "submitting";
        setAttestPhase("submitting");
        setStatusNote("Confirm in MetaMask");
      } else {
        depositProof = encodePaymentProof({
          txHash,
          payer: address,
          amountWei,
          kind: 1,
        });
        balanceProof = encodePaymentProof({
          txHash: balHash,
          payer: address,
          amountWei: balanceWei,
          kind: 3,
        });
      }

      await ensureCreditcoinChain(switchChainAsync);

      const openHash = await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "openCredit",
        args: [
          {
            txHash,
            payer: address,
            amount: amountWei,
            kind: 1,
          },
          depositProof,
          {
            txHash: balHash,
            payer: address,
            amount: balanceWei,
            kind: 3,
          },
          balanceProof,
        ],
        chainId: creditcoinTestnet.id,
      });
      if (creditClient) {
        await creditClient.waitForTransactionReceipt({ hash: openHash });
      }
      setCreditTx(openHash);
      journalActivity(address, {
        id: `${openHash}-open`,
        type: "Credit opened",
        amount: `${formatEth(amountWei)} ETH`,
        status: "Completed",
        at: "Creditcoin",
        kind: "credit",
        href: `${config.explorerCreditcoin}/tx/${openHash}`,
      });
      clearPayFlow(address);
      setStatusNote(null);
      if (config.attestcoin) setAttestPhase("done");
      setStep(4);
      setVerifyStartedAt(null);
      void refetchPosition();
    } catch (e) {
      setError(friendlyError(e));
      const lastPhase = lastAttestPhaseRef.current;
      const pastAttestation =
        lastPhase === "attested" ||
        lastPhase === "building_proof" ||
        lastPhase === "proof_ready" ||
        lastPhase === "submitting";
      if (pastAttestation) {
        setStep(3);
        setAttestPhase(lastPhase === "submitting" ? "submitting" : "proof_ready");
        setStatusNote("Confirm in MetaMask or tap Retry.");
      } else {
        setStatusNote(null);
        setAttestPhase(null);
        setStep(2);
      }
      // Do not clear autoAttemptHash — prevents verify restart loop.
      autoAttemptHash.current = txHash ?? autoAttemptHash.current;
    } finally {
      provingRef.current = false;
      setProving(false);
    }
  }

  useEffect(() => {
    if (!sepoliaTx.confirmed || step !== 2 || !txHash) return;
    if (autoAttemptHash.current === txHash) return;
    if (provingRef.current || hasActiveLine) return;
    autoAttemptHash.current = txHash;
    void onProveAndOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sepoliaTx.confirmed, step, txHash, hasActiveLine]);

  const awaitingWallet = isSigning && !sepoliaTx.hash;
  const sepoliaConfirming = Boolean(sepoliaTx.hash && !sepoliaTx.confirmed && step >= 1 && step < 3);
  const verifying = step === 3 || proving;
  const stage: 0 | 1 | 2 | 3 | 4 =
    step === 4 ? 4 : verifying ? 3 : sepoliaTx.confirmed ? 2 : sepoliaTx.hash ? 2 : step;

  return (
    <AppShell
      title="Pay deposit"
      subtitle="Prove deposit + Sepolia balance via Attestcoin, then unlock credit on Creditcoin."
    >
      <div className="mx-auto max-w-md border border-border bg-panel/80 p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet to pay</p>
            <p className="mt-1 text-[13px] text-muted">
              You’ll pay on Sepolia, attest your ETH balance, then unlock credit on Creditcoin.
            </p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        {isConnected && hasActiveLine && (
          <div className="mb-6">
            <SuccessBanner
              title="Credit line already open"
              description="No need to verify again. Withdraw, redeem, or repay from here."
              actions={
                <>
                  <Link
                    href="/withdraw"
                    className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
                  >
                    Withdraw
                  </Link>
                  <Link
                    href="/overview"
                    className=" border border-border px-4 py-2 text-[13px] font-medium"
                  >
                    Overview
                  </Link>
                </>
              }
            />
          </div>
        )}

        {isConnected && lineClosed && step < 2 && resumeReady && !txHash && (
          <div className="mb-6">
            <SuccessBanner
              title={`Ready to reopen · history bonus ${histCount >= 3 ? "+5%" : histCount >= 1 ? "+2.5%" : "0%"}`}
              description={`${histCount} attested payment${histCount === 1 ? "" : "s"} on file. Pay a fresh deposit to open credit with the boosted LTV.`}
            />
          </div>
        )}

        {sepoliaTx.confirmed && step >= 2 && step < 4 && txHash && (
          <div className="mb-6">
            <SuccessBanner
              title="Sepolia deposit ready — finish on Creditcoin"
              description="Paid on Sepolia. Tap Verify — don't pay again."
              href={`${config.explorerSepolia}/tx/${txHash}`}
              hrefLabel="View Sepolia payment"
            />
          </div>
        )}

        {step === 4 && !hasActiveLine && (
          <div className="mb-6">
            <SuccessBanner
              title="Credit line opened"
              description={`Deposit verified and credit unlocked on Creditcoin${attestedBalanceWei != null ? ` with ${formatEth(attestedBalanceWei)} ETH attested balance` : ""}.`}
              href={creditTx ? `${config.explorerCreditcoin}/tx/${creditTx}` : undefined}
              hrefLabel="View Creditcoin tx"
              actions={
                <>
                  <Link
                    href="/withdraw"
                    className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
                  >
                    Withdraw credit
                  </Link>
                  <Link
                    href="/overview"
                    className=" border border-border px-4 py-2 text-[13px] font-medium"
                  >
                    View overview
                  </Link>
                </>
              }
            />
          </div>
        )}

        {!hasActiveLine && step < 4 && (
          <>
            {step < 2 && (
              <>
                <label className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
                  Amount (ETH)
                </label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-2 w-full border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums text-text outline-none transition focus:border-accent/60"
                />
                <p className="mt-2 text-[12px] text-muted">
                  Credit LTV rises with attested Sepolia balance and linked payment history (+2.5% /
                  +5%). Use a fresh deposit tx to open.
                </p>
              </>
            )}

            {(step >= 1 || txHash) && (
              <div className="mt-8">
                <ConfirmingStages step={stage === 0 ? 0 : stage} />
              </div>
            )}

            <div className="mt-8 flex flex-col gap-2">
              {step < 2 && !txHash && (
                <button
                  type="button"
                  onClick={onPay}
                  disabled={!isConnected || awaitingWallet || sepoliaConfirming || verifying}
                  className="btn-shine px-4 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white disabled:opacity-50"
                >
                  {awaitingWallet
                    ? "Confirm in MetaMask…"
                    : sepoliaConfirming
                      ? "Confirming on Sepolia…"
                      : "Pay deposit"}
                </button>
              )}
              {sepoliaTx.confirmed && step >= 2 && step < 4 && (
                <>
                  <button
                    type="button"
                    onClick={() => void onProveAndOpen()}
                    disabled={proving}
                    className="btn-shine px-4 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white disabled:opacity-50"
                  >
                    {proving
                      ? attestPhase === "submitting"
                        ? "Confirm in MetaMask…"
                        : "Verifying…"
                      : "Verify & open credit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (provingRef.current) return;
                      autoAttemptHash.current = null;
                      setError(null);
                      setStep(3);
                      void onProveAndOpen();
                    }}
                    disabled={proving}
                    className=" border border-border px-4 py-3 text-[14px] font-medium transition hover:bg-white/[0.03] disabled:opacity-50"
                  >
                    Retry verify
                  </button>
                </>
              )}
              {statusNote && <p className="text-center text-[12px] text-muted">{statusNote}</p>}
            </div>
          </>
        )}

        {config.attestcoin && attestPhase && address && step < 4 && (
          <AttestcoinProofPanel
            phase={attestPhase}
            meta={attestMeta}
            dualProof
            verifyStartedAt={verifyStartedAt ?? undefined}
            paymentTx={txHash}
            creditTx={creditTx}
            claim={{
              payer: address,
              amountLabel: amount || "0.01",
              kind: "deposit",
            }}
          />
        )}

        {txHash && !attestPhase && step < 4 && (
          <p className="mt-5 break-all text-[12px] text-muted">
            Payment tx:{" "}
            <a
              className="text-text/80 hover:underline"
              href={`${config.explorerSepolia}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
      </div>
    </AppShell>
  );
}
