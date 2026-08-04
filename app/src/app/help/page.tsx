"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
      <h2 className="text-[15px] font-medium text-text">{title}</h2>
      <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 font-mono text-[11px] text-brand">
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
    <AppShell title="Help" subtitle="How Spark works, in plain language.">
      <div className="mx-auto max-w-2xl space-y-3">
        <Block title="What is Spark?">
          <p>
            Spark lets you pay a deposit and open a small credit line. We check that your payment
            really happened, then credit becomes available. You do not fill out bank forms or wait
            on phone calls.
          </p>
          <p>
            Think of it like putting money down first, then borrowing against what you paid. When
            you repay, the line closes.
          </p>
        </Block>

        <Block title="Who is Spark for?">
          <p>
            Spark is for people who want credit tied to a payment they already made.
            This version runs on test networks only, so it is best for trying the flow before anything goes
            live with real money.
          </p>
          <p>
            You will need the MetaMask browser extension. If you have never used one, follow the steps
            below and use the free test tokens linked in this page.
          </p>
        </Block>

        <Block title="How it works">
          <ol className="space-y-5">
            <Step
              n="1"
              title="Pay a deposit"
              body="You send a small amount on the test payment network (Sepolia). That payment is your deposit."
            />
            <Step
              n="2"
              title="We confirm it"
              body="Spark checks the payment on chain. No one has to email a receipt or call a bank."
            />
            <Step
              n="3"
              title="Credit opens"
              body="After confirmation, your credit line opens on Creditcoin testnet. You can see balance and status on Overview."
            />
            <Step
              n="4"
              title="Withdraw to your wallet"
              body="Withdraw sends available credit to your wallet as sCREDIT (testnet credit units). Debt goes up by what you take."
            />
          </ol>
          <p className="pt-2">
            To finish, go to Repay, pay back what you withdrew on the payment network, and your line closes.
          </p>
        </Block>

        <Block title="Before you start">
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="text-text">MetaMask.</span> Install the{" "}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                MetaMask browser extension
              </a>
              , then connect from the top right. That wallet is your Spark account.
            </li>
            <li>
              <span className="text-text">Test payment tokens.</span> You need a little Sepolia ETH
              to pay the deposit and cover network fees.{" "}
              <a
                href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Get Sepolia ETH (free)
              </a>
            </li>
            <li>
              <span className="text-text">Test credit network fees.</span> Opening and repaying
              credit uses Creditcoin testnet. You need a small amount of tCTC for fees. Ask in the{" "}
              <a
                href="https://discord.com/invite/creditcoin"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Creditcoin Discord
              </a>{" "}
              (#token-faucet channel).
            </li>
          </ul>
          <p>
            Spark may ask you to switch networks in your wallet. That is normal. Pay on Sepolia.
            Open and repay credit on Creditcoin.
          </p>
        </Block>

        <Block title="Step-by-step guide">
          <ol className="list-inside list-decimal space-y-2">
            <li>Connect MetaMask (top right).</li>
            <li>Open Overview and follow the Get started checklist if you see it.</li>
            <li>Go to Pay deposit. Enter an amount (0.01 ETH is a typical starting amount).</li>
            <li>
              Confirm in MetaMask. Wait for Attestcoin attestation (~8–10 min on Sepolia) until credit
              opens.
            </li>
            <li>Optional: Withdraw sCREDIT to your wallet, then Send &amp; Receive if you want to move it.</li>
            <li>Check Overview for credit available, debt, and deposit locked.</li>
            <li>When done testing, use Repay to clear debt and close the line.</li>
          </ol>
          <p className="pt-2">
            Payment history is under{" "}
            <Link href="/activity" className="text-brand hover:underline">
              Payments
            </Link>
            .
          </p>
        </Block>

        <Block title="Common questions">
          <div className="space-y-4">
            <Faq
              q="Is this real money?"
              a="No. This version uses test networks only. Tokens have no real value. It shows how the product would work before a live launch."
            />
            <Faq
              q="Why two networks?"
              a="Spark pays on Ethereum testnet (Sepolia) and opens credit on Creditcoin testnet. A future version could use one screen for both."
            />
            <Faq
              q="What is a network fee?"
              a="A small charge to process your transaction, like a card processing fee. You pay it in the network's native token (ETH on Sepolia, tCTC on Creditcoin)."
            />
            <Faq
              q="Why did my transaction fail?"
              a="Usually you need more test tokens for fees, or you rejected the request in your wallet. Spark shows a short message when that happens."
            />
            <Faq
              q="Why does verifying take so long?"
              a="Attestcoin waits ~8–10 minutes after a Sepolia payment so the block is safe from reorgs. That is protocol security, not Spark being stuck."
            />
            <Faq
              q="What is sCREDIT?"
              a="Testnet credit units minted to your MetaMask when you withdraw. Not real money. You can send them to another address on Creditcoin testnet."
            />
            <Faq
              q="Does Spark hold my money?"
              a="No. Your MetaMask stays in your control. Smart contracts move funds only when you approve each step."
            />
            <Faq
              q="Where can I see my past payments?"
              a="Open Payments in the sidebar. Deposits, withdraws, sends, and repayments for your connected wallet appear there."
            />
          </div>
        </Block>

        <Block title="Words we use">
          <dl className="space-y-3">
            <div>
              <dt className="text-text">Wallet</dt>
              <dd className="mt-0.5">MetaMask — your digital account for Spark.</dd>
            </div>
            <div>
              <dt className="text-text">Deposit</dt>
              <dd className="mt-0.5">Money you pay upfront on Sepolia. It backs the credit line.</dd>
            </div>
            <div>
              <dt className="text-text">Credit line</dt>
              <dd className="mt-0.5">Borrowing room opened after Attestcoin verifies your deposit.</dd>
            </div>
            <div>
              <dt className="text-text">Withdraw</dt>
              <dd className="mt-0.5">Send available credit to your wallet as sCREDIT (testnet units).</dd>
            </div>
            <div>
              <dt className="text-text">Repay</dt>
              <dd className="mt-0.5">Pay back on Sepolia to clear debt and close the line.</dd>
            </div>
          </dl>
        </Block>

        <Block title="More for builders">
          <p>
            Contract addresses, network settings, and security notes are in{" "}
            <Link href="/settings" className="text-brand hover:underline">
              Settings
            </Link>
            . Technical integration notes are on{" "}
            <Link href="/advanced" className="text-brand hover:underline">
              Developers
            </Link>
            .
          </p>
          <p>
            Source code and architecture docs:{" "}
            <a
              href="https://github.com/thesithunyein/spark"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              github.com/thesithunyein/spark
            </a>
          </p>
        </Block>

        <div className="rounded-2xl border border-dashed border-border px-6 py-8 text-center">
          <p className="text-[15px] font-medium text-text">Ready to try it?</p>
          <p className="mt-2 text-[13px] text-muted">Connect MetaMask and pay a small test deposit.</p>
          <Link
            href="/pay"
            className="mt-5 inline-flex rounded-full bg-brand px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-accent2"
          >
            Go to Pay deposit
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
