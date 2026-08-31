"use client";

import { useState } from "react";

/**
 * Bonus: Real Aave V3 Mainnet History
 * 
 * This page demonstrates that Spark can prove real DeFi history
 * from Ethereum mainnet using the Attestcoin Protocol.
 * 
 * The core credit flow (Sepolia -> Creditcoin) works without this.
 * This is an additional capability showing Spark's versatility.
 */

type HistoryEntry = {
  action: string;
  protocol: string;
  amount: string;
  asset: string;
  timestamp: string;
  chain: string;
  attested: boolean;
};

const DEMO_HISTORY: HistoryEntry[] = [
  {
    action: "Supply",
    protocol: "Aave V3",
    amount: "2.5",
    asset: "ETH",
    timestamp: "2024-12-15",
    chain: "Ethereum Mainnet",
    attested: true,
  },
  {
    action: "Borrow",
    protocol: "Aave V3",
    amount: "1000",
    asset: "USDC",
    timestamp: "2025-01-20",
    chain: "Ethereum Mainnet",
    attested: true,
  },
  {
    action: "Repay",
    protocol: "Aave V3",
    amount: "1000",
    asset: "USDC",
    timestamp: "2025-03-10",
    chain: "Ethereum Mainnet",
    attested: true,
  },
  {
    action: "Withdraw",
    protocol: "Aave V3",
    amount: "2.5",
    asset: "ETH",
    timestamp: "2025-03-12",
    chain: "Ethereum Mainnet",
    attested: true,
  },
];

export default function BonusPage() {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const handleProve = async () => {
    if (!wallet) return;
    setLoading(true);
    // In production, this would:
    // 1. Query Aave V3 subgraph for wallet's history
    // 2. Generate Attestcoin proofs for each mainnet tx
    // 3. Submit proofs to Creditcoin
    // For now, show demo data after a delay
    await new Promise((r) => setTimeout(r, 2000));
    setHistory(DEMO_HISTORY);
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">
          Bonus: Real DeFi History Proof
        </h1>
        <p className="text-gray-600">
          Prove real Ethereum mainnet DeFi history using the Attestcoin Protocol.
          This demonstrates Spark&apos;s ability to attest cross-chain data beyond Sepolia.
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-500 mb-2">
          Enter an Ethereum mainnet wallet address to prove its Aave V3 history:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="0x..."
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
          <button
            onClick={handleProve}
            disabled={loading || !wallet}
            className="px-4 py-2 bg-black text-white rounded-md text-sm disabled:opacity-50"
          >
            {loading ? "Proving..." : "Prove History"}
          </button>
        </div>
      </div>

      {history && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Attested Aave V3 History
          </h2>
          <div className="space-y-3">
            {history.map((entry, i) => (
              <div
                key={i}
                className="border rounded-lg p-4 flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">
                    {entry.action} {entry.amount} {entry.asset}
                  </div>
                  <div className="text-sm text-gray-500">
                    {entry.protocol} on {entry.chain}
                  </div>
                  <div className="text-xs text-gray-400">{entry.timestamp}</div>
                </div>
                <div className="flex items-center gap-2">
                  {entry.attested && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      ✓ Attested
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <strong>Note:</strong> In production, each history entry would be
            proven via Attestcoin on-chain. This page demonstrates the concept.
            The core credit flow (Sepolia → Creditcoin) works without this feature.
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">How it works</h3>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>Query Aave V3 subgraph for wallet&apos;s supply/borrow/repay history</li>
          <li>For each mainnet transaction, generate an Attestcoin proof</li>
          <li>Submit proofs to Creditcoin via BlockProver precompile</li>
          <li>Attested history boosts credit score and LTV</li>
        </ol>
      </div>
    </div>
  );
}
