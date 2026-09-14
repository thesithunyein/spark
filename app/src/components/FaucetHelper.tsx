"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { sepolia } from "wagmi/chains";
import { creditcoinTestnet } from "@/lib/wagmi";
import clsx from "clsx";

/**
 * The two faucets, made pasteable.
 *
 * Every one of these steps is free, but the friction is real and it is where onboarding
 * dies: Creditcoin's testnet CTC comes from a Discord bot command that has to be typed
 * with a 42-character address in it, and Sepolia ETH comes from a site that wants the
 * address pasted too. Doing that by hand, twice, from a wallet the user may not have open
 * in the right place, is the whole cost of trying the product.
 *
 * So this component does the two things a person cannot be bothered to do: it reads the
 * connected address and puts it straight into a copy-ready command, and it shows the live
 * balance for each chain so the user can see whether a step is actually finished rather
 * than guessing.
 *
 * The amounts quoted are minimums to complete the loop, not policy: a deposit is 0.01
 * Sepolia ETH and the Creditcoin side only needs gas.
 */

const SEPOLIA_FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const CREDITCOIN_DISCORD = "https://discord.com/invite/creditcoin";

/** Format wei to a short decimal string without pulling in a formatting library. */
function fmt(value: bigint | undefined, decimals: number, places = 5): string {
  if (value === undefined) return "—";
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).slice(0, places).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function CopyButton({
  value,
  label,
  testId,
}: {
  value: string;
  label: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can be blocked; the value is visible on screen either way. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      data-testid={testId}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition",
        copied
          ? "border-success/50 bg-success/10 text-success"
          : "border-border text-muted hover:border-accent2/60 hover:text-text",
      )}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function FaucetHelper() {
  const { address, isConnected } = useAccount();

  const { data: sepoliaBal } = useBalance({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });
  const { data: ctcBal } = useBalance({
    address,
    chainId: creditcoinTestnet.id,
    query: { enabled: Boolean(address) },
  });

  if (!isConnected || !address) return null;

  const faucetCommand = `/faucet address:${address}`;
  const sepoliaWei = sepoliaBal?.value ?? 0n;
  const ctcWei = ctcBal?.value ?? 0n;
  const hasSepolia = sepoliaWei > 0n;
  const hasCtc = ctcWei > 0n;
  const ready = hasSepolia && hasCtc;

  return (
    <div className="mt-4 border border-border bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          Testnet funds · both free
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          {ready ? "Both funded" : `${(hasSepolia ? 1 : 0) + (hasCtc ? 1 : 0)} of 2 funded`}
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {/* ── Sepolia ETH ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={clsx(
              "flex h-5 w-5 shrink-0 items-center justify-center",
              hasSepolia ? "bg-success/20 text-success" : "border border-border text-muted",
            )}
          >
            {hasSepolia ? <Check className="h-3 w-3" /> : null}
          </span>
          <span className="text-[13px] text-text">Sepolia ETH</span>
          <span
            className={clsx(
              "font-mono text-[11px]",
              hasSepolia ? "text-success" : "text-muted",
            )}
          >
            {fmt(sepoliaWei, 18, 4)} ETH
          </span>
          <span className="ml-auto flex items-center gap-2">
            <CopyButton value={address} label="Copy address" testId="copy-address" />
            <a
              href={SEPOLIA_FAUCET}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:border-accent2/60 hover:text-text"
            >
              Faucet <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>
        <p className="pl-8 text-[12px] leading-relaxed text-muted">
          Needs about <span className="text-text">0.01 ETH</span> to pay the deposit and
          prove the balance. Paste your address on the faucet page.
        </p>

        {/* ── Creditcoin gas ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
          <span
            className={clsx(
              "flex h-5 w-5 shrink-0 items-center justify-center",
              hasCtc ? "bg-success/20 text-success" : "border border-border text-muted",
            )}
          >
            {hasCtc ? <Check className="h-3 w-3" /> : null}
          </span>
          <span className="text-[13px] text-text">Creditcoin CTC</span>
          <span className={clsx("font-mono text-[11px]", hasCtc ? "text-success" : "text-muted")}>
            {fmt(ctcWei, 18, 4)} CTC
          </span>
          <span className="ml-auto">
            <a
              href={CREDITCOIN_DISCORD}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:border-accent2/60 hover:text-text"
            >
              Discord <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>

        {/* The one thing nobody wants to do by hand: type a 42-character address into a
            chat box. So the exact command is built and copyable. */}
        <div className="pl-8">
          <p className="text-[12px] leading-relaxed text-muted">
            Post this in{" "}
            <span className="text-text">#token-faucet</span> on the Creditcoin Discord.
            There is no faucet API, so this is a manual command.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto border border-border bg-black/50 px-3 py-1.5 font-mono text-[11px] text-text">
              {faucetCommand}
            </code>
            <CopyButton value={faucetCommand} label="Copy command" testId="copy-faucet-cmd" />
          </div>
        </div>
      </div>

      {ready ? (
        <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-success">
          Both funded. You can run the whole loop: pay on Sepolia, prove it, borrow on
          Creditcoin, repay.
        </p>
      ) : (
        <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted">
          Both steps are free and take a few minutes. The Creditcoin faucet is a Discord
          command with a cooldown, so request it before you need it.
        </p>
      )}
    </div>
  );
}
