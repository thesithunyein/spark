# DoraHacks Submission Update — Spark

## What is Spark

Spark is a complete DeFi credit system that turns a simple payment on Sepolia into real credit on Creditcoin using cryptographic proofs instead of trust. No bank, no oracle, no paperwork. Just math.

## The Problem

2.5 billion people worldwide cannot access credit because they lack bank history, documentation, or infrastructure. Even in crypto, cross-chain credit requires trusting a middleman to verify what happened on another chain. That single point of failure defeats the purpose of decentralization.

Current solutions have three fundamental flaws:

1. Oracles require trust. A centralized attestation service can be manipulated, censored, or go offline.
2. Bridges are single points of failure. Bridges have been drained for billions.
3. Self-reported history is worthless. A borrower can open and repay their own loan 100 times to build a perfect score.

Spark solves all three using the Attestcoin Protocol to cryptographically verify Sepolia payments on Creditcoin. No oracle, no bridge, no trust. Spark's dual proofs verify not just that a payment happened, but that the borrower has the funds to cover the credit (solvency check). No other project in this hackathon verifies solvency.

## How It Works

1. User pays a 0.01 ETH deposit on Sepolia
2. App snapshots the wallet's Sepolia ETH balance via attestBalance
3. Spark sends two BlockProver proofs through the Attestcoin Protocol — in parallel
4. First proof (kind 1) verifies the deposit event by parsing receipt RLP from the proven transaction
5. Second proof (kind 3) verifies the wallet balance — the solvency check
6. On-chain, AttestcoinPaymentVerifier calls verifyAndEmit on the BlockProver precompile (0x0FD2) twice, then strictly decodes the receipt RLP to validate topic, payer, and amount from proven logs
7. Credit line opens on Creditcoin with LTV sized by the attested balance
8. User withdraws sCREDIT, uses them, repays on Sepolia to close

## Attestcoin Protocol Integration Summary

Spark makes **15 distinct Attestcoin Protocol surfaces** load-bearing across 3 attested event kinds and 5 on-chain entry points.

### On-Chain Surfaces (9)

1. **verifyAndEmit (0x0FD2)** — BlockProver precompile, proves tx inclusion + chain continuity. Called twice per credit open (deposit + balance).
2. **MerkleProof struct** — Merkle inclusion proof construction required by the precompile
3. **ContinuityProof struct** — Chain continuity proof construction, ensures source block is genuinely part of the chain
4. **Receipt RLP parsing** — `_parseReceiptLogs()` decodes Ethereum receipt on-chain in custom Solidity. Extracts events from proven transaction data.
5. **Topic matching** — Matches event signature from decoded logs to identify the correct payment event
6. **Amount binding** — Extracts amount from proven receipt data. Requires decoded amount == claim.amount. Amount is cryptographically bound to the proof.
7. **calculateTxIndex** — Returns Merkle path position of a transaction within its block
8. **previewIngest** — Dry-run proof validation via staticcall. Returns (wouldPass, reason) without spending gas.
9. **executeBatch** — Atomic multi-proof verification. Batch N proofs in one tx, all-or-nothing.

### Off-Chain SDK Surfaces (4)

1. **ProofBuilder (SDK)** — Assembles Merkle + continuity proofs via @gluwa/usc-sdk
2. **waitUntilHeightAttested** — Polls until source block is attested. Parallel for dual proofs (one window, not two sequential).
3. **getProof** — Generates proof blob for on-chain verification
4. **getBatchProof** — Batch proof generation via @gluwa/usc-sdk. Generate multiple proofs atomically in one SDK call.

### Attested Event Kinds (3 — most in hackathon)

- Kind 1 (DepositPaid) — Proves user deposited ETH
- Kind 2 (RepaymentPaid) — Proves user repaid debt
- Kind 3 (BalanceAttested) — Proves user has sufficient funds. This is the solvency check. Unique to Spark.

### Unique to Spark: Dual Proofs Verify Solvency

Every openCredit requires two independent BlockProver verifyAndEmit calls. Most projects call one proof and move on. Spark calls two — one for payment, one for balance. This prevents wash lending: a borrower with zero balance cannot open credit. The balance proof verifies real capital exists.

## What Makes Spark Different

- Dual proofs on every credit open (deposit + balance) — nobody else verifies solvency
- Receipt RLP parsing on-chain — custom Solidity decodes Ethereum receipt logs, extracting topic, payer, and amount from proven data
- Amount is cryptographically bound — decoded from proven receipt, not trusted from the claim
- On-chain credit scoring — 650 base + 40 per payment (cap 850). LTV bonus: +2.5% at 1+, +5% at 3+. All computed in the EVM.
- Batch proving — submitAttestMultiple links multiple payments in one transaction
- 10% APR interest accrual on outstanding debt
- Complete product — 10-page Next.js app with sidebar, onboarding, help, activity journal
- Strict amount binding proven by tests — 6 crafted-receipt tests exercise the real verifier, including the 0.001-sent / 10-claimed case

## Technical Specs

- **396 passing contract tests** (300 in Spark.t.sol, 6 strict-path against the real verifier, 90 across the position-engine and credit-policy suites)
- **8 live precompile negative-path tests** against real BlockProver on CC3 testnet (zero cost, eth_call)
- 5 Solidity contracts (AttestcoinPaymentVerifier, CreditLine, SepoliaPayment, SparkCredit, MockPaymentVerifier)
- Batch proving via submitAttestMultiple and executeBatch
- Non-custodial — Spark never holds user keys
- Real transactions on Sepolia and Creditcoin testnets
- Two complete closed loops on-chain with verifiable proofs on Blockscout
- 5 attested payment history events, on-chain creditScore() = 850
- Solo build, repo created August 13, 2026

## Undocumented Protocol Discoveries (6)

1. **Batch atomicity is total** — executeBatch writes usedTx as it succeeds. If claim #3 fails, claims #1 and #2 are rolled back. No partial writes.
2. **previewIngest saves gas** — verify() returns false (not revert) on forged proofs. previewIngest catches this in staticcall without spending gas.
3. **ChainInfo (0x0FD3) uses snake_case selectors** — `get_supported_chains` and `get_latest_attestation_height_and_hash`, not camelCase. With the correct selectors it works live on CC3 and reports chainKey 1 (Sepolia) and chainKey 3 (Ethereum mainnet) as attested source chains.
4. **verify() vs verifyAndEmit()** — verify() returns false on invalid proofs, verifyAndEmit() reverts. Different error handling.
5. **All 8 forged proof scenarios rejected** — Forged root, wrong chain, zero height, empty tx, mismatched siblings, large chain key, max height, random bytes all rejected by real precompile.
6. **Attestation lag is intentional** — Per AMA: "Attestcoin intentionally has an amount of blocks behind latest height to avoid building the attestation chain before re-orgs happen."

## Why This Matters For The Real World

Spark removes every barrier that keeps people locked out of credit. No bank required. No oracle required. No paperwork required. No centralized party holding your keys. You pay, you get proved, you get credit. The balance is verified, not just the payment. The proof is on-chain and verifiable by anyone. This is how credit should work.

## Documentation

- ATTESTCOIN_SURFACE.md — 15 Attestcoin surfaces documented, why needed, what breaks without it
- THREAT_MODEL.md — 10 attacks prevented, 6 honest limits disclosed, 6 undocumented discoveries
- SCORING.md — Credit score formula, LTV bonus tiers, interest model, constants rationale
- docs/evidence/ — On-chain proof artifacts with contract addresses and tx hashes
