"use client";

import { AppShell } from "@/components/AppShell";
import { config, isConfigured } from "@/lib/config";

export default function AdvancedPage() {
  return (
    <AppShell title="Advanced" subtitle="Explorer links, contracts, and Attestcoin notes for judges.">
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-panel p-5" id="settings">
          <h2 className="text-sm font-semibold">Settings / networks</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Payment chain ID: {config.paymentChainId} (Sepolia)</li>
            <li>Credit chain ID: {config.creditChainId} (Creditcoin testnet)</li>
            <li>Configured: {isConfigured() ? "yes" : "no — set env after deploy"}</li>
            <li>Demo banner: {config.demoBanner ? "on" : "off"}</li>
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-panel p-5">
          <h2 className="text-sm font-semibold">Contracts</h2>
          <ul className="mt-3 space-y-2 break-all font-mono text-xs text-muted">
            <li>
              SepoliaPayment:{" "}
              <a className="text-accent" href={`${config.explorerSepolia}/address/${config.paymentAddress}`}>
                {config.paymentAddress}
              </a>
            </li>
            <li>
              CreditLine:{" "}
              <a className="text-accent" href={`${config.explorerCreditcoin}/address/${config.creditLineAddress}`}>
                {config.creditLineAddress}
              </a>
            </li>
            <li>Verifier: {config.verifierAddress}</li>
            <li>Prover API: {config.proverUrl}</li>
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-panel p-5">
          <h2 className="text-sm font-semibold">Attestcoin</h2>
          <p className="mt-2 text-sm text-muted">
            Credit cannot open or repay unless payment verification succeeds. See{" "}
            <code className="text-text">docs/attestcoin.md</code> in the repo for the integration summary used on
            DoraHacks.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
