"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useSwitchChain,
} from "wagmi";
import { formatEther, isAddress, parseEther, type Hex } from "viem";
import { Check, Copy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConnectButton } from "@/components/ConnectButton";
import { config } from "@/lib/config";
import { sparkCreditAbi } from "@/lib/abi";
import { formatEth } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";
import { useChainTxConfirmation } from "@/hooks/useChainTxConfirmation";
import clsx from "clsx";

type Tab = "send" | "receive";

export default function TransferPage() {
  const { address, chainId, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("send");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [copied, setCopied] = useState(false);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const creditTx = useChainTxConfirmation(creditcoinTestnet.id);

  const tokenOk =
    config.creditTokenAddress !== "0x0000000000000000000000000000000000000000";

  const { data: balance, refetch } = useReadContract({
    address: config.creditTokenAddress,
    abi: sparkCreditAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) && tokenOk },
  });

  const bal = balance ?? 0n;

  useEffect(() => {
    if (creditTx.confirmed) void refetch();
  }, [creditTx.confirmed, refetch]);

  async function onCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy address.");
    }
  }

  async function onSend() {
    setError(null);
    if (!address) return setError("Connect a wallet first.");
    if (!isAddress(to)) return setError("Enter a valid recipient address.");
    if (to.toLowerCase() === address.toLowerCase()) {
      return setError("Cannot send to yourself.");
    }
    try {
      const value = parseEther(amount || "0");
      if (value === 0n) return setError("Enter an amount greater than 0.");
      if (value > bal) return setError("Amount exceeds your sCREDIT balance.");

      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }

      const hash = await writeContractAsync({
        address: config.creditTokenAddress,
        abi: sparkCreditAbi,
        functionName: "transfer",
        args: [to as `0x${string}`, value],
        chainId: creditcoinTestnet.id,
      });
      setTxHash(hash);
      creditTx.track(hash);
      journalActivity(address, {
        id: `${hash}-send`,
        type: "sCREDIT sent",
        amount: `${formatEth(value)} sCREDIT`,
        status: "Completed",
        at: "Creditcoin",
        kind: "transfer",
        href: `${config.explorerCreditcoin}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  const awaitingWallet = isSigning && !creditTx.hash;
  const confirming = Boolean(creditTx.hash && !creditTx.confirmed);

  const qrUrl = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(address)}`
    : null;

  return (
    <AppShell title="Send & Receive" subtitle="Move sCREDIT between wallets on Creditcoin testnet.">
      <div className="mx-auto max-w-md border border-border bg-panel/80 p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet</p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 border border-border p-1">
          {(["send", "receive"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={clsx(
                " px-3 py-2 text-[13px] font-medium capitalize transition",
                tab === t ? "bg-brand text-white" : "text-muted hover:text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {isConnected && (
          <p className="mt-5 text-[13px] text-muted">
            Balance:{" "}
            <span className="tabular-nums text-text">{formatEth(bal)} sCREDIT</span>
          </p>
        )}

        {tab === "send" && (
          <div className="mt-5">
            <label className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
              To address
            </label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="0x…"
              disabled={!isConnected}
              className="mt-2 w-full border border-border bg-transparent px-4 py-3.5 font-mono text-[14px] outline-none transition focus:border-brand/50 disabled:opacity-50"
            />

            <div className="mt-4 flex items-end justify-between gap-3">
              <label className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
                Amount (sCREDIT)
              </label>
              {bal > 0n && (
                <button
                  type="button"
                  onClick={() => setAmount(formatEther(bal))}
                  className="text-[12px] font-medium text-brand hover:underline"
                >
                  Max
                </button>
              )}
            </div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!isConnected || bal === 0n}
              className="mt-2 w-full border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-brand/50 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={onSend}
              disabled={!isConnected || awaitingWallet || confirming || bal === 0n || creditTx.confirmed}
              className="mt-8 w-full bg-brand px-4 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white transition hover:bg-accent2 disabled:opacity-50"
            >
              {awaitingWallet
                ? "Confirm in MetaMask…"
                : confirming
                  ? "Confirming on Creditcoin…"
                  : creditTx.confirmed
                    ? "Sent"
                    : "Send sCREDIT"}
            </button>

            {bal === 0n && isConnected && (
              <p className="mt-3 text-[12px] text-muted">
                No sCREDIT yet.{" "}
                <Link href="/withdraw" className="text-brand hover:underline">
                  Withdraw from your credit line
                </Link>{" "}
                first.
              </p>
            )}
          </div>
        )}

        {tab === "receive" && (
          <div className="mt-5">
            {!address ? (
              <p className="text-[13px] text-muted">Connect to see your receive address.</p>
            ) : (
              <>
                <p className="text-[13px] text-muted">
                  Share this Creditcoin address to receive sCREDIT.
                </p>
                {qrUrl && (
                  <div className="mt-5 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrUrl}
                      alt="Wallet QR code"
                      width={180}
                      height={180}
                      className=" border border-border bg-white p-2"
                    />
                  </div>
                )}
                <p className="mt-5 break-all font-mono text-[12px] text-text/90">{address}</p>
                <button
                  type="button"
                  onClick={onCopy}
                  className="mt-4 inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[13px] font-medium text-text transition hover:bg-white/[0.03]"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-brand" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted" />
                  )}
                  {copied ? "Copied" : "Copy address"}
                </button>
              </>
            )}
          </div>
        )}

        {txHash && (
          <p className="mt-5 break-all text-[12px] text-muted">
            <a
              className="hover:underline"
              href={`${config.explorerCreditcoin}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
        {creditTx.confirmed && tab === "send" && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[15px] font-medium text-text">Sent</p>
            <Link
              href="/activity"
              className="mt-4 inline-flex border border-border px-4 py-2 text-[13px] font-medium"
            >
              See payments
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
