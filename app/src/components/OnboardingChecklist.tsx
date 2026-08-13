"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { sepolia } from "wagmi/chains";
import { creditcoinTestnet } from "@/lib/wagmi";
import clsx from "clsx";

const DISMISS_KEY = "spark.onboarding.dismissed";

type Step = {
  id: string;
  title: string;
  hint: string;
  href?: string;
  done: boolean;
};

export function OnboardingChecklist({ hasCreditLine }: { hasCreditLine: boolean }) {
  const { address, isConnected } = useAccount();
  const [dismissed, setDismissed] = useState(true);

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

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!isConnected || dismissed || hasCreditLine) return null;

  const hasSepoliaGas = (sepoliaBal?.value ?? 0n) > 0n;
  const hasCtcGas = (ctcBal?.value ?? 0n) > 0n;

  const steps: Step[] = [
    {
      id: "gas-sep",
      title: "Get Sepolia ETH",
      hint: "For the deposit payment",
      href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
      done: hasSepoliaGas,
    },
    {
      id: "gas-ctc",
      title: "Get Creditcoin gas",
      hint: "Discord faucet → your wallet",
      href: "https://discord.com/invite/creditcoin",
      done: hasCtcGas,
    },
    {
      id: "score",
      title: "Link payment history",
      hint: "Optional — raises score & LTV",
      href: "/score",
      done: false,
    },
    {
      id: "pay",
      title: "Pay a deposit",
      hint: "Then verify to unlock credit",
      href: "/pay",
      done: hasCreditLine,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="mb-8 rounded-2xl border border-border bg-panel/80 p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium text-text">Get started</p>
          <p className="mt-1 text-[13px] text-muted">
            {doneCount}/{steps.length} complete. Pay on Sepolia, unlock credit on Creditcoin.
          </p>
        </div>
        <button type="button" onClick={dismiss} className="text-[12px] text-muted hover:text-text">
          Dismiss
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            {step.href?.startsWith("http") ? (
              <a
                href={step.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.03]"
              >
                <StepIcon done={step.done} />
                <span>
                  <span className={clsx("block text-[13px]", step.done ? "text-muted line-through" : "text-text")}>
                    {step.title}
                  </span>
                  <span className="block text-[12px] text-muted">{step.hint}</span>
                </span>
              </a>
            ) : (
              <Link
                href={step.href ?? "#"}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.03]"
              >
                <StepIcon done={step.done} />
                <span>
                  <span className={clsx("block text-[13px]", step.done ? "text-muted line-through" : "text-text")}>
                    {step.title}
                  </span>
                  <span className="block text-[12px] text-muted">{step.hint}</span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepIcon({ done }: { done: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        done ? "bg-success/20 text-success" : "border border-border text-muted",
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : null}
    </span>
  );
}
