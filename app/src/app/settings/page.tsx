"use client";

import Link from "next/link";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConnectButton } from "@/components/ConnectButton";
import { config, isConfigured } from "@/lib/config";
import { creditcoinTestnet } from "@/lib/wagmi";
import { shortHash } from "@/lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
      <h2 className="text-[15px] font-medium text-text">{title}</h2>
      <div className="mt-4 space-y-3 text-[13px] text-muted">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const onSepolia = chainId === sepolia.id;
  const onCredit = chainId === creditcoinTestnet.id;

  return (
    <AppShell title="Settings" subtitle="Account, security, and network preferences.">
      <div className="mx-auto max-w-2xl space-y-3">
        <Section title="Account">
          {isConnected && address ? (
            <>
              <p>
                Connected as{" "}
                <span className="font-mono text-text">{shortHash(address)}</span>
              </p>
              <p className="break-all font-mono text-[12px] text-text/80">{address}</p>
              <p>Spark uses your wallet as your account. Credit and payments tie to this address.</p>
              <button
                type="button"
                onClick={() => disconnect()}
                className="mt-2 rounded-full border border-border px-4 py-2 text-[13px] font-medium text-text transition hover:bg-white/[0.03]"
              >
                Disconnect wallet
              </button>
            </>
          ) : (
            <>
              <p>No wallet connected.</p>
              <div className="pt-1">
                <ConnectButton />
              </div>
            </>
          )}
        </Section>

        <Section title="Security">
          <ul className="list-inside list-disc space-y-2">
            <li>Non-custodial. Spark never holds your keys or funds.</li>
            <li>Credit only moves after payment verification on chain.</li>
            <li>Each payment tx can only unlock credit once (replay protected).</li>
            <li>Transactions always require your wallet signature.</li>
          </ul>
          <p className="pt-1">
            <a
              href="https://github.com/thesithunyein/spark-ctc/blob/main/SECURITY.md"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              Security policy →
            </a>
          </p>
        </Section>

        <Section title="Networks">
          <p>Spark uses two networks: pay on Sepolia, credit on Creditcoin.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => switchChain({ chainId: sepolia.id })}
              className={`rounded-full px-4 py-2 text-[13px] transition ${
                onSepolia ? "bg-white/[0.08] text-text" : "border border-border text-muted hover:text-text"
              }`}
            >
              Sepolia {onSepolia && "· active"}
            </button>
            <button
              type="button"
              onClick={() => switchChain({ chainId: creditcoinTestnet.id })}
              className={`rounded-full px-4 py-2 text-[13px] transition ${
                onCredit ? "bg-white/[0.08] text-text" : "border border-border text-muted hover:text-text"
              }`}
            >
              Creditcoin {onCredit && "· active"}
            </button>
          </div>
          <p className="text-[12px]">
            Need gas?{" "}
            <a className="text-text/80 hover:underline" href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">
              Sepolia faucet
            </a>
            {" · "}
            <a className="text-text/80 hover:underline" href="https://discord.com/invite/creditcoin" target="_blank" rel="noreferrer">
              Creditcoin Discord faucet
            </a>
          </p>
        </Section>

        <Section title="Contracts">
          <p>Status: {isConfigured() ? "Live" : "Not configured"}</p>
          <ul className="space-y-2 break-all font-mono text-[11px]">
            <li>
              SepoliaPayment:{" "}
              <a className="text-brand hover:underline" href={`${config.explorerSepolia}/address/${config.paymentAddress}`} target="_blank" rel="noreferrer">
                {config.paymentAddress}
              </a>
            </li>
            <li>
              CreditLine:{" "}
              <a className="text-brand hover:underline" href={`${config.explorerCreditcoin}/address/${config.creditLineAddress}`} target="_blank" rel="noreferrer">
                {config.creditLineAddress}
              </a>
            </li>
            <li>Verifier: {config.verifierAddress}</li>
          </ul>
        </Section>

        <p className="pt-2 text-center text-[12px] text-muted">
          Developer docs and Attestcoin notes →{" "}
          <Link href="/advanced" className="text-brand hover:underline">
            Developers
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
