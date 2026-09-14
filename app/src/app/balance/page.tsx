"use client";

import { useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { keccak256, parseEther, toBytes, type Hex } from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConnectButton } from "@/components/ConnectButton";
import { sepoliaPaymentAbi } from "@/lib/abi";
import { config } from "@/lib/config";
import { GEN2, GEN2_CREDIT_LINE_ABI } from "@/lib/gen2";
import { buildAttestcoinProof, type AttestcoinPhase } from "@/lib/usc";
import { ensureCreditcoinChain, ensureSepoliaChain } from "@/lib/chains";
import { creditcoinTestnet } from "@/lib/wagmi";
import { formatEth } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";

/**
 * Open a credit line from a PROVEN BALANCE, with no deposit.
 *
 * ── Why this is a separate page and not a mode on /pay ──────────────────────
 * /pay is the flow the demo video shows and the flow the frozen submission describes:
 * pay a deposit on Sepolia, prove it, open a line sized from it. This path is a different
 * generation of the contract with a different sizing rule, and folding it into /pay as a
 * toggle would mean one state machine serving two shapes of proof. Keeping it separate
 * means the recorded flow cannot break, and it means a reviewer can see exactly which
 * generation they are exercising.
 *
 * ── What it actually proves ─────────────────────────────────────────────────
 * One proof, not two. `openCreditFromBalance` needs only the kind-3 balance attestation,
 * so this page builds a single BlockProver proof instead of the pair /pay builds. That is
 * the deposit-free path working as designed rather than as a variation.
 *
 * ── What it does not claim ──────────────────────────────────────────────────
 * The attested balance is VERIFIED, NOT LOCKED. Nothing is custodied, the funds stay in
 * the user's Sepolia wallet, and the line is sized at 20% of the attested amount rather
 * than 95% of a payment, precisely because an attested balance can move the moment after
 * it is attested. That reasoning is in docs/UNIT_ECONOMICS.md.
 */

const BALANCE_ATTESTED_TOPIC = keccak256(toBytes("BalanceAttested(address,uint256,bytes32)"));

type Step = "idle" | "attested" | "proving" | "opening" | "done";

function Row({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</span>
      <span className={`text-right text-[14px] ${mono ? "font-mono" : ""} text-text`}>{value}</span>
    </div>
  );
}

export default function BalanceCreditPage() {
  const { address, chainId, isConnected } = useAccount();
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<AttestcoinPhase | null>(null);
  const [balanceTxHash, setBalanceTxHash] = useState<Hex | undefined>();
  const [attestedWei, setAttestedWei] = useState<bigint | null>(null);
  const [openHash, setOpenHash] = useState<Hex | undefined>();
  const [drawAmount, setDrawAmount] = useState("");
  const [drawHash, setDrawHash] = useState<Hex | undefined>();
  const [closeHash, setCloseHash] = useState<Hex | undefined>();

  const { data: ltvBps } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "BALANCE_LTV_BPS",
    chainId: creditcoinTestnet.id,
  });

  const { data: minLineWei } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "MIN_BALANCE_LINE_WEI",
    chainId: creditcoinTestnet.id,
  });

  const { data: position, refetch: refetchPosition } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const { data: availableWei, refetch: refetchAvailable } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "availableCredit",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const { data: debtWei, refetch: refetchDebt } = useReadContract({
    address: GEN2.creditLine as `0x${string}`,
    abi: GEN2_CREDIT_LINE_ABI,
    functionName: "currentDebt",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const ltv = ltvBps ? Number(ltvBps) : 2000;
  const projectedCredit = attestedWei ? (attestedWei * BigInt(ltv)) / 10_000n : null;
  const minBalanceForALine = minLineWei ? (minLineWei * 10_000n) / BigInt(ltv) : null;
  const gen2Status = position ? Number(position.status) : 0;
  const hasLine = gen2Status === 1;

  /** Step 1: emit BalanceAttested on Sepolia. This is the only input the path needs. */
  async function attest() {
    setError(null);
    setNote(null);
    if (!address || !creditClient) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    try {
      if (chainId !== sepolia.id) await ensureSepoliaChain(switchChainAsync);
      const ref = keccak256(toBytes(`spark-balance-path-${address}-${Date.now()}`));
      const hash = await writeContractAsync({
        address: config.paymentAddress,
        abi: sepoliaPaymentAbi,
        functionName: "attestBalance",
        args: [ref],
        chainId: sepolia.id,
      });
      setNote("Waiting for the attestation to confirm on Sepolia…");
      if (!sepoliaClient) throw new Error("Sepolia RPC not ready. Retry in a moment.");
      // Read the value out of the receipt rather than from the wallet's local balance. The
      // contract records msg.sender.balance at mining time, so the event is the only
      // authoritative figure, and it is what the proof will later assert against.
      const rc = await sepoliaClient.waitForTransactionReceipt({ hash });
      const log = rc.logs.find((l) => l.topics[0] === BALANCE_ATTESTED_TOPIC);
      if (!log) throw new Error("BalanceAttested event missing from the receipt.");
      const wei = BigInt(log.data);
      setBalanceTxHash(hash);
      setAttestedWei(wei);
      setStep("attested");
      setNote(null);
      journalActivity(address, {
        id: `${hash}-bal2`,
        type: "Balance attested",
        amount: `${formatEth(wei)} ETH`,
        status: "Confirmed",
        at: "Sepolia",
        kind: "attest",
        href: `${config.explorerSepolia}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Step 2: one proof, then open on generation 2. */
  async function proveAndOpen() {
    setError(null);
    setNote(null);
    if (!address || !balanceTxHash || attestedWei == null) {
      setError("Attest a balance first.");
      return;
    }
    setBusy(true);
    try {
      setStep("proving");
      setNote("Building a single kind-3 proof… usually 8-20 min");
      const built = await buildAttestcoinProof(balanceTxHash, (p) => {
        setPhase(p);
        if (p === "building_proof") setNote("Building proof…");
        if (p === "proof_ready") setNote("Proof ready. Confirm in MetaMask.");
      });

      setStep("opening");
      setNote("Confirm in MetaMask on Creditcoin");
      await ensureCreditcoinChain(switchChainAsync);
      const hash = await writeContractAsync({
        address: GEN2.creditLine as `0x${string}`,
        abi: GEN2_CREDIT_LINE_ABI,
        functionName: "openCreditFromBalance",
        args: [
          { txHash: balanceTxHash, payer: address, amount: attestedWei, kind: 3 },
          built.proof,
        ],
        chainId: creditcoinTestnet.id,
      });
      if (creditClient) await creditClient.waitForTransactionReceipt({ hash });
      setOpenHash(hash);
      setStep("done");
      setNote(null);
      journalActivity(address, {
        id: `${hash}-openbal`,
        type: "Credit opened from balance",
        amount: `${formatEth(projectedCredit ?? 0n)} ETH line`,
        status: "Completed",
        at: "Creditcoin",
        kind: "credit",
        href: `${config.explorerCreditcoin}/tx/${hash}`,
      });
      void refetchPosition();
    } catch (e) {
      setError(friendlyError(e));
      setStep(balanceTxHash ? "attested" : "idle");
    } finally {
      setBusy(false);
    }
  }

  function parseDrawAmount(): bigint | null {
    const value = drawAmount.trim();
    if (!value) {
      setError("Enter an amount first.");
      return null;
    }
    let amountWei: bigint;
    try {
      amountWei = parseEther(value);
    } catch {
      setError("That is not a valid ETH amount.");
      return null;
    }
    if (amountWei <= 0n) {
      setError("Amount must be greater than zero.");
      return null;
    }
    return amountWei;
  }

  /**
   * Draw against an already-open generation-2 line.
   *
   * ── Why this exists here and not on /withdraw ───────────────────────────────
   * /withdraw is wired to generation 1, so it cannot reach this contract. Without a draw
   * on this page the deposit-free path opens a limit and stops there, which is a credit
   * product nobody can spend from. `withdraw` mints sCREDIT to the drawer, so the drawn
   * amount arrives as the credit token rather than as ETH.
   */
  async function drawCredit() {
    setError(null);
    setNote(null);
    if (!address || !creditClient) {
      setError("Connect a wallet first.");
      return;
    }
    const amountWei = parseDrawAmount();
    if (amountWei == null) return;
    if (availableWei != null && amountWei > availableWei) {
      setError(`Only ${formatEth(availableWei)} ETH is available to draw.`);
      return;
    }
    setBusy(true);
    try {
      await ensureCreditcoinChain(switchChainAsync);
      const hash = await writeContractAsync({
        address: GEN2.creditLine as `0x${string}`,
        abi: GEN2_CREDIT_LINE_ABI,
        functionName: "withdraw",
        args: [amountWei],
        chainId: creditcoinTestnet.id,
      });
      if (creditClient) await creditClient.waitForTransactionReceipt({ hash });
      setDrawHash(hash);
      setDrawAmount("");
      journalActivity(address, {
        id: `${hash}-draw2`,
        type: "Credit withdrawn",
        amount: `${formatEth(amountWei)} ETH`,
        status: "Completed",
        at: "Creditcoin",
        kind: "withdraw",
        href: `${config.explorerCreditcoin}/tx/${hash}`,
      });
      void refetchPosition();
      void refetchAvailable();
      void refetchDebt();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Burn sCREDIT back against the debt. This reduces the balance, it does not repay the loan. */
  async function redeemCredit() {
    setError(null);
    setNote(null);
    if (!address || !creditClient) {
      setError("Connect a wallet first.");
      return;
    }
    const amountWei = parseDrawAmount();
    if (amountWei == null) return;
    if (debtWei != null && amountWei > debtWei) {
      setError(`Outstanding debt is ${formatEth(debtWei)} ETH, so that is more than can be redeemed.`);
      return;
    }
    setBusy(true);
    try {
      await ensureCreditcoinChain(switchChainAsync);
      const hash = await writeContractAsync({
        address: GEN2.creditLine as `0x${string}`,
        abi: GEN2_CREDIT_LINE_ABI,
        functionName: "redeem",
        args: [amountWei],
        chainId: creditcoinTestnet.id,
      });
      if (creditClient) await creditClient.waitForTransactionReceipt({ hash });
      setDrawHash(hash);
      setDrawAmount("");
      journalActivity(address, {
        id: `${hash}-redeem2`,
        type: "Credit redeemed",
        amount: `${formatEth(amountWei)} ETH`,
        status: "Completed",
        at: "Creditcoin",
        kind: "redeem",
        href: `${config.explorerCreditcoin}/tx/${hash}`,
      });
      void refetchPosition();
      void refetchAvailable();
      void refetchDebt();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Close an unused line. The contract refuses while any debt stands, so this is only offered at zero. */
  async function closeLine() {
    setError(null);
    setNote(null);
    if (!address || !creditClient) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    try {
      await ensureCreditcoinChain(switchChainAsync);
      const hash = await writeContractAsync({
        address: GEN2.creditLine as `0x${string}`,
        abi: GEN2_CREDIT_LINE_ABI,
        functionName: "closeUnused",
        chainId: creditcoinTestnet.id,
      });
      if (creditClient) await creditClient.waitForTransactionReceipt({ hash });
      setCloseHash(hash);
      journalActivity(address, {
        id: `${hash}-close2`,
        type: "Credit line closed",
        amount: "Unused",
        status: "Completed",
        at: "Creditcoin",
        kind: "credit",
        href: `${config.explorerCreditcoin}/tx/${hash}`,
      });
      void refetchPosition();
      void refetchAvailable();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Open from a proven balance"
      subtitle="No deposit. Your Sepolia balance is proven on Creditcoin, and the line is sized from it."
    >
      <div className="mx-auto max-w-xl">

        {!isConnected ? (
          <div className="border border-border bg-panel/80 p-5 shadow-soft sm:p-7">
            <p className="text-[15px] font-medium text-text">Connect a wallet to use this path</p>
            <p className="mt-1 text-[13px] text-muted">
              You need a small Ethereum Sepolia balance to attest. Nothing is spent or deposited.
            </p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <div className="border border-border bg-panel/80 p-5 shadow-soft sm:p-7">
            <Row label="Your address" value={`${address?.slice(0, 8)}…${address?.slice(-6)}`} />
            <Row
              label="Generation 2 line"
              value={
                hasLine ? (
                  <span className="text-emerald-400">already open</span>
                ) : (
                  <span className="text-muted">none</span>
                )
              }
            />
            <Row label="Balance LTV" value={`${ltv / 100}%`} />
            {minBalanceForALine != null && (
              <Row label="Minimum balance for a line" value={`${formatEth(minBalanceForALine)} ETH`} />
            )}

            {hasLine && position && (
              <div className="mt-4 border border-border/70 bg-panel2/60 p-3">
                <p className="text-[13px] leading-relaxed text-muted">
                  Your generation-2 line: {formatEth(position.attestedBalance)} ETH attested,{" "}
                  {formatEth(position.credit)} ETH limit, one per address. The buttons below draw on it.
                </p>
                <div className="mt-3">
                  <Row label="Available to draw" value={`${formatEth(availableWei ?? 0n)} ETH`} />
                  <Row label="Outstanding debt" value={`${formatEth(debtWei ?? 0n)} ETH`} />
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={drawAmount}
                    onChange={(e) => setDrawAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.001"
                    aria-label="Amount in ETH"
                    className="w-full border border-border bg-transparent px-3 py-2 font-mono text-[13px] text-text placeholder:text-muted/60 focus:border-text focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={drawCredit}
                    disabled={busy || (availableWei ?? 0n) === 0n}
                    className="border border-border bg-accent/10 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text transition disabled:opacity-40"
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={redeemCredit}
                    disabled={busy || (debtWei ?? 0n) === 0n}
                    className="border border-border bg-panel/70 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text transition disabled:opacity-40"
                  >
                    Redeem
                  </button>
                </div>

                {(debtWei ?? 0n) === 0n && (
                  <button
                    type="button"
                    onClick={closeLine}
                    disabled={busy}
                    className="mt-2 w-full border border-border bg-panel/70 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition disabled:opacity-40"
                  >
                    Close this unused line
                  </button>
                )}

                {drawHash && (
                  <p className="mt-3 text-[13px] text-accent2">
                    Confirmed.{" "}
                    <a
                      href={`${config.explorerCreditcoin}/tx/${drawHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2"
                    >
                      View tx
                    </a>
                  </p>
                )}
                {closeHash && (
                  <p className="mt-3 text-[13px] text-accent2">
                    Line closed.{" "}
                    <a
                      href={`${config.explorerCreditcoin}/tx/${closeHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2"
                    >
                      View tx
                    </a>
                  </p>
                )}
              </div>
            )}

            {/* The two opening buttons disappear once a line exists, because the only way
                forward from there is to draw on it, not to open a second one. */}
            {!hasLine && (
              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={attest}
                  disabled={busy}
                  className="w-full border border-border bg-panel2/70 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text transition disabled:opacity-40"
                >
                  {balanceTxHash ? "1. Balance attested" : "1. Attest my Sepolia balance"}
                </button>

                <button
                  type="button"
                  onClick={proveAndOpen}
                  disabled={busy || !balanceTxHash}
                  className="w-full border border-border bg-accent/10 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text transition disabled:opacity-40"
                >
                  {step === "done" ? "Line opened" : "2. Prove it and open the line"}
                </button>
              </div>
            )}

            {attestedWei != null && (
              <div className="mt-5">
                <Row label="Attested balance" value={`${formatEth(attestedWei)} ETH`} />
                {projectedCredit != null && (
                  <Row label="Line it will open" value={`${formatEth(projectedCredit)} ETH`} />
                )}
                {balanceTxHash && (
                  <Row
                    label="Attestation tx"
                    value={
                      <a
                        href={`${config.explorerSepolia}/tx/${balanceTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {balanceTxHash.slice(0, 10)}…
                      </a>
                    }
                  />
                )}
              </div>
            )}

            {phase && step !== "done" && (
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Proof phase: {phase.replace(/_/g, " ")}
              </p>
            )}

            {note && <p className="mt-4 text-[13px] text-accent2">{note}</p>}
            {error && <p className="mt-4 text-[13px] text-red-400">{error}</p>}

            {openHash && (
              <div className="mt-5 border border-emerald-500/40 bg-emerald-500/[0.07] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300">
                  Line opened from a proven balance, with no deposit
                </p>
                <a
                  href={`${config.explorerCreditcoin}/tx/${openHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all font-mono text-[12px] text-text underline decoration-dotted underline-offset-2"
                >
                  {openHash}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Terms kept, essay removed. The rate and the absence of liquidation are the two facts a
            borrower has to see before drawing, so they stay on the screen a borrower actually uses.
            The rest is argued at length in docs/UNIT_ECONOMICS.md and in-source, where length costs
            nothing and here it costs attention. */}
        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          10% APR accrues on drawn credit, and there is no liquidation path. Drawing mints sCREDIT to your
          wallet rather than sending ETH, and redeeming burns it back against the debt. Your balance stays
          in your Sepolia wallet rather than being custodied, which is why the line is 20% of it. Opening
          this way is not a payment, so it does not move your credit score.
        </p>
      </div>
    </AppShell>
  );
}
