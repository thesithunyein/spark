"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { config, isConfigured } from "@/lib/config";

export default function AdvancedPage() {
  return (
    <AppShell title="Developers" subtitle="Networks, contracts, and Attestcoin integration notes.">
      <div className="mx-auto max-w-2xl space-y-3">
        <section className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
          <h2 className="text-[15px] font-medium text-text">Networks</h2>
          <ul className="mt-4 space-y-2 text-[13px] text-muted">
            <li>Payment chain ID: {config.paymentChainId} (Sepolia)</li>
            <li>Credit chain ID: {config.creditChainId} (Creditcoin testnet)</li>
            <li>Configured: {isConfigured() ? "yes" : "no"}</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
          <h2 className="text-[15px] font-medium text-text">Contracts</h2>
          <ul className="mt-4 space-y-2 break-all font-mono text-[11px] text-muted">
            <li>
              SepoliaPayment:{" "}
              <a className="text-brand hover:underline" href={`${config.explorerSepolia}/address/${config.paymentAddress}`}>
                {config.paymentAddress}
              </a>
            </li>
            <li>
              CreditLine:{" "}
              <a className="text-brand hover:underline" href={`${config.explorerCreditcoin}/address/${config.creditLineAddress}`}>
                {config.creditLineAddress}
              </a>
            </li>
            <li>Verifier: {config.verifierAddress}</li>
            <li>Prover API: {config.proverUrl}</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
          <h2 className="text-[15px] font-medium text-text">Attestcoin</h2>
          <p className="mt-4 text-[13px] text-muted">
            Credit cannot open or repay unless payment verification succeeds. See{" "}
            <a
              href="https://github.com/thesithunyein/spark/blob/main/docs/attestcoin.md"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              docs/attestcoin.md
            </a>{" "}
            in the repo.
          </p>
        </section>

        <p className="text-center text-[12px] text-muted">
          <Link href="/settings" className="text-brand hover:underline">
            Back to Settings
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
