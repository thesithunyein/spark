"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className=" border border-border bg-panel/80 p-6 shadow-soft">
      <h2 className="text-[15px] font-medium text-text">{title}</h2>
      <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-white/15 font-mono text-[11px] text-white">
        {n}
      </span>
      <div>
        <p className="font-medium text-text">{title}</p>
        <p className="mt-1">{body}</p>
      </div>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="font-medium text-text">{q}</p>
      <p className="mt-1">{a}</p>
    </div>
  );
}

export default function HelpPage() {
  return (
    <AppShell title="Help" subtitle="How Spark works on testnet.">
      <div className="mx-auto max-w-2xl space-y-3">
        <Block title="What is Spark?">
          <p>
            Pay a deposit on Sepolia. Spark proves it with Attestcoin, then opens credit on
            Creditcoin. Your verified payment history becomes your credit score — no bank forms, no
            oracle.
          </p>
          <p>Testnet only. Tokens have no real value.</p>
        </Block>

        <Block title="What you need">
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="text-text">MetaMask</span> —{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
                className="text-white hover:underline"
              >
                install the extension
              </a>
              , connect top-right.
            </li>
            <li>
              <span className="text-text">Sepolia ETH</span> — deposit + fees.{" "}
              <a
                href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
                target="_blank"
                rel="noreferrer"
                className="text-white hover:underline"
              >
                Free faucet
              </a>
            </li>
            <li>
              <span className="text-text">Creditcoin tCTC</span> — gas to open/repay credit.{" "}
              <a
                href="https://discord.com/invite/creditcoin"
                target="_blank"
                rel="noreferrer"
                className="text-white hover:underline"
              >
                Creditcoin Discord
              </a>{" "}
              (#token-faucet).
            </li>
          </ul>
          <p>Pay on Sepolia. Open and repay on Creditcoin. Approve network switches in MetaMask.</p>
        </Block>

        <Block title="Full demo flow">
          <ol className="space-y-5">
            <Step
              n="1"
              title="Pay deposit"
              body="Sepolia → Pay deposit (0.01 ETH is typical). Wait for confirmation."
            />
            <Step
              n="2"
              title="Verify & open credit"
              body="Tap Verify. Spark attests your Sepolia balance and waits for Attestcoin (~8–20 min, both proofs in parallel). Then approve Creditcoin and confirm openCredit in MetaMask."
            />
            <Step
              n="3"
              title="Withdraw & redeem (optional)"
              body="Withdraw sCREDIT to your wallet. Redeem burns sCREDIT against debt on Creditcoin."
            />
            <Step
              n="4"
              title="Repay & close"
              body="Repay on Sepolia → verify on Creditcoin → line closes. Use 0.001 ETH if tiny dust debt remains."
            />
          </ol>
        </Block>

        <Block title="Credit score (optional)">
          <p>
            More attested Sepolia payments → higher score and bigger credit line (LTV bonus).
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Score: 650 base + 40 per payment (max 850)</li>
            <li>LTV bonus: +2.5% at ≥1 payment, +5% at ≥3</li>
            <li>Balance also raises LTV (more Sepolia ETH attested → up to 90%)</li>
          </ul>
          <p>
            Go to{" "}
            <Link href="/score" className="text-white hover:underline">
              Credit score
            </Link>{" "}
            to link past deposits/repays, then open a <em>fresh</em> deposit on{" "}
            <Link href="/pay" className="text-white hover:underline">
              Pay deposit
            </Link>
            .
          </p>
        </Block>

        <Block title="Step-by-step (first time)">
          <ol className="list-inside list-decimal space-y-2">
            <li>Connect MetaMask.</li>
            <li>
              <Link href="/overview" className="text-white hover:underline">
                Overview
              </Link>{" "}
              — follow the checklist (gas faucets).
            </li>
            <li>Optional: link history on Credit score.</li>
            <li>Pay deposit → Verify & open credit. Keep the tab open during Attestcoin.</li>
            <li>Check Overview for score, credit, debt, status.</li>
            <li>Withdraw, redeem, repay when ready.</li>
          </ol>
          <p className="pt-2">
            History:{" "}
            <Link href="/activity" className="text-white hover:underline">
              Payments
            </Link>
            . Contracts:{" "}
            <Link href="/settings" className="text-white hover:underline">
              Settings
            </Link>
            .
          </p>
        </Block>

        <Block title="Common questions">
          <div className="space-y-4">
            <Faq
              q="Why does verify take so long?"
              a="Attestcoin waits for Sepolia reorg safety — usually 8–20 minutes. Deposit and balance proofs run in parallel (one wait, not two). Keep the tab open."
            />
            <Faq
              q="Should I pay again if verify fails?"
              a="No. Use Retry verify with the same Sepolia tx. Paying twice uses extra ETH and does not speed up Attestcoin."
            />
            <Faq
              q="Wrong network error?"
              a="Approve switching to Creditcoin testnet when MetaMask asks — right before openCredit or repayCredit."
            />
            <Faq
              q="What is sCREDIT?"
              a="Testnet credit token minted when you withdraw. Debt accrues 10% APR. Redeem burns it; Sepolia repay closes the line."
            />
            <Faq
              q="Two networks?"
              a="Sepolia = payments. Creditcoin = credit line. Spark handles proofs between them via Attestcoin."
            />
            <Faq
              q="Does Spark hold my keys?"
              a="No. Non-custodial. You sign every step in MetaMask."
            />
          </div>
        </Block>

        <Block title="App pages">
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-text">Overview</dt>
              <dd>Status, score, deposit, debt</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text">Pay deposit</dt>
              <dd>Sepolia pay + verify + open</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text">Credit score</dt>
              <dd>Link attested payment history</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text">Withdraw</dt>
              <dd>Withdraw or redeem sCREDIT</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text">Send & Receive</dt>
              <dd>Transfer sCREDIT</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text">Repay</dt>
              <dd>Close the line</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text">Payments</dt>
              <dd>Activity journal</dd>
            </div>
          </dl>
        </Block>

        <Block title="For developers">
          <p>
            Live contracts and env vars:{" "}
            <a
              href="https://github.com/thesithunyein/spark/blob/main/docs/addresses.md"
              target="_blank"
              rel="noreferrer"
              className="text-white hover:underline"
            >
              docs/addresses.md
            </a>
            . Integration notes:{" "}
            <Link href="/advanced" className="text-white hover:underline">
              Developers
            </Link>
            . Repo:{" "}
            <a
              href="https://github.com/thesithunyein/spark"
              target="_blank"
              rel="noreferrer"
              className="text-white hover:underline"
            >
              github.com/thesithunyein/spark
            </a>
          </p>
        </Block>

        <div className=" border border-dashed border-border px-6 py-8 text-center">
          <p className="text-[15px] font-medium text-text">Ready to try?</p>
          <p className="mt-2 text-[13px] text-muted">Connect MetaMask and pay a test deposit.</p>
          <Link
            href="/pay"
            className="btn-shine mt-5 inline-flex px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.18em] text-white"
          >
            Pay deposit
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
