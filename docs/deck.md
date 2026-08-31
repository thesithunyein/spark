# Spark — pitch deck outline (export to PDF for DoraHacks)

## Slide 1 — Title
**Spark**
Pay once. Unlock credit.
DeFi credit on Creditcoin. Attestcoin-verified payment history is your credit score. No bank, no oracle, no paperwork.
DeFi Track · BUIDL CTC 2026 Fall · Attestcoin Protocol

## Slide 2 — Problem
2.5 billion people can't get credit without paperwork. Most of the world is unbanked. Credit systems require physical documents, bank history, and centralized intermediaries that don't exist for millions.
- Cross-chain credit impossible without a trusted middleman
- Centralized oracles add single points of failure
- No way to prove payment history across chains trustlessly

## Slide 3 — Solution
Your on-chain payment history is your credit score.
Spark uses Attestcoin to prove Sepolia payments on Creditcoin. Verified payment history builds a trustless credit score.
- Pay deposit → dual Attestcoin proofs → credit opens on Creditcoin
- On-chain credit score: 650 base + 40 per attested payment (cap 850)
- LTV bonus from payment history (+2.5% at 1+, +5% at 3+ payments)
- No valid proof = no state change

## Slide 4 — How it works
1. Pay deposit + attest balance on Sepolia
2. Attestcoin proves both txs via BlockProver
3. CreditLine opens on Creditcoin (LTV sized by balance)
4. Repay on Sepolia → verify → line closes
Optional: link past payments to raise credit score and LTV before opening.

## Slide 5 — Attestcoin depth
The deepest Attestcoin integration in this hackathon.
- `openCredit` requires **two** BlockProver proofs: deposit + balance
- Strict receipt log decoding: topic, payer, and **amount** verified from proven data
- One-time `txHash` (replay protected)
- Payer must match `msg.sender`
- Attested balance sizes LTV (80% / 85% / 90%)
- Payment history adds LTV bonus (+250 / +500 bps)
- Per Aug 18 AMA: "Transaction fields and their log data are verified and available." Amount is cryptographically bound.

| Component | Role |
|---|---|
| SepoliaPayment | Deposit, repay, balance events |
| Attestcoin / USC | Cross-chain proof (dual) |
| CreditLine | Credit + score + history + interest |
| BlockProver 0xFD2 | On-chain verify |

## Slide 6 — Traction
Two full closed loops on-chain with real USC proofs.
- 2 full closed loops: Open → Withdraw → Redeem → Repay → Close
- 5 attested payments on-chain credit history
- Credit score 850 (max possible)
- LTV 95% (base 90% + 5% history bonus)
- All proofs are real Attestcoin USC proofs verified by BlockProver
- On-chain demo wallet: 0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2
- Live at spark.sithunyein.com · Contracts verified on Blockscout

## Slide 7 — Product
Live testnet product, not a slideware demo.
- spark.sithunyein.com — live on Creditcoin testnet
- github.com/thesithunyein/spark
- Full UI: Overview, Pay, Score, Withdraw, Repay, Help
- On-chain credit score with history linking
- 200 contract tests passing
- Batch proving via submitAttestMultiple
- Testnet only. Not audited. MIT License.

## Slide 8 — The Ask
$10K to ship credit for the real world.
- **Now:** Dual Attestcoin proofs, strict log decoding, credit score, history LTV bonus — live on testnet
- **With $10K:** Deploy strict verifier to testnet, faster attestation UX (parallel proofs, caching), audit-ready code
- **CEIP fast-track:** Mainnet readiness, lending pool, single-network UX
- Spark turns verified payment history into creditworthiness. No bank. No oracle. Just cryptographic proof. This is DeFi credit for the 2.5 billion people the traditional system forgot.
