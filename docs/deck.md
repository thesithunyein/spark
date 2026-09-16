# Spark — pitch deck (source for deck.html, exported to deck.pdf for DoraHacks)

> **This mirrors the deck published today, and it tracks the repository.** The version judged on
> September 13 is the PDF attached to the DoraHacks submission; this file is kept current instead of
> frozen, so that the deck a reviewer opens does not contradict the chain. Everything that has moved
> since the submission, and the numbers themselves, are generated from chain reads at
> [spark.sithunyein.com/onchain](https://spark.sithunyein.com/onchain) and
> [spark.sithunyein.com/bonus](https://spark.sithunyein.com/bonus) and stated in full in the README's
> judge path. The changes since the submitted version: the mainnet corpus grew from 8 wallets to 40,
> the contract suite from 417 to 518, the on-chain record from two closed loops to six, and the
> position layer went from built to deployed on CC3.

## Slide 1 — Title
**Spark**
Pay once. Unlock credit.
Pay a deposit on Sepolia. Attestcoin verifies it on-chain. A credit line unlocks on Creditcoin. No credit check, no paperwork, no bank.
DeFi Track · BUIDL CTC 2026 Fall · Attestcoin Protocol

## Slide 2 — Problem
**Credit needs facts that live on another chain. Today that means trust.**
Under-collateralised lending is the growth edge of on-chain credit. Its bottleneck is not capital — it is assessment.
- Assessment today is off-chain: delegates and auditors decide, and enforcement runs through legal process
- When the deciding fact lives on another chain, the options are an **oracle** (a trusted party) or a **bridge** (a repeated point of failure)
- Self-reported history is worthless: a borrower can open and repay their own loan 100 times to manufacture a perfect score

## Slide 3 — Who this is for
**The borrower with a proven position and no way to use it**
A DeFi borrower who holds a verifiable position on Ethereum mainnet and needs liquidity on Creditcoin — without selling the position or bridging it.
- Their facts **already exist on-chain**, verifiably. No bureau, no paperwork, no identity attestation
- The alternative today is specific and bad: realise the gain, or accept bridge risk
- Measured, not asserted: **40** real mainnet wallets rebuilt from the transfer ledger, **38 of 38 measurable** within 10 bps of the live balance
- **Portable attested standing:** a repaid line becomes proven history that follows the borrower across products and chains — not a score locked inside one app

The unbanked borrower is the destination this reaches. The deposit-free path that gets there is built and covered by 21 tests.

## Slide 4 — Why now
**Assessment today is a trusted opinion. It can be a verified fact.**
- Private credit is a **$1.7T** market moving on-chain, and it works today by trusting humans to assess risk off-chain
- Maple and Goldfinch assess through off-chain delegates and auditors, and enforce through legal process
- When the deciding fact lives on another chain the choice is an **oracle** (trust) or a **bridge** (risk). Attestcoin removes the fork by proving the source chain's own record
- Dual proofs verify the payment **and** the current balance — a balance cannot be farmed, self-dealt, or bought
- **Who pays:** **10% APR** on drawn credit, accruing on-chain — and no delegate is needed to underwrite the line

## Slide 5 — Solution
Your on-chain payment history is your credit score.
Spark uses the Attestcoin Protocol to prove Sepolia payments on Creditcoin. Verified payment history builds a trustless credit score. No bank forms, no oracle, no paperwork.
- Pay deposit on Sepolia → dual Attestcoin proofs → credit opens on Creditcoin
- On-chain credit score: 650 base + 40 per attested payment (cap 850)
- LTV bonus from payment history (+2.5% at 1+, +5% at 3+ payments)
- No valid proof = no state change. Cryptographic guarantees only.

## Slide 6 — How it works
Four steps. Fully on-chain.
1. Pay deposit + attest balance on Sepolia
2. Attestcoin proves both txs via BlockProver
3. CreditLine opens on Creditcoin (LTV tier set by attested balance)
4. Repay on Sepolia → verify → line closes
Optional: link past Sepolia payments to raise credit score and LTV bonus before opening.

## Slide 7 — Attestcoin depth
**15 Attestcoin surfaces load-bearing**, across 3 attested event kinds and 5 on-chain entry points: 10 on the critical path, 5 more integrated and tested.
- `openCredit` requires **two** BlockProver proofs: deposit + balance
- Strict receipt log decoding: topic, payer, and **amount** verified from proven data
- One-time `txHash` (replay protected)
- Payer must match `msg.sender`
- **Credit = deposit × LTV**; attested balance sets the tier (80% / 85% / 90%)
- Payment history adds LTV bonus (+250 / +500 bps)
- Per Aug 18 AMA: "Transaction fields and their log data are verified and available." Amount is cryptographically bound.

| Component | Role |
|---|---|
| SepoliaPayment | Deposit, repay, balance events |
| Attestcoin / USC | Cross-chain proof (dual) |
| CreditLine | Credit + score + history + interest |
| BlockProver 0x0FD2 | On-chain verify |

Verifier parses receipt RLP from the proven encodedTransaction; a decoded amount that disagrees with the claim reverts.

## Slide 8 — Measured, not asserted
A position on another chain, rebuilt from proven facts.
Credit sizing needs history elsewhere and proof of cover, so we rebuilt real Aave V3 positions from real mainnet data and measured how wrong the obvious method is.
- **40** real mainnet wallets reconstructed from the transfer ledger, **38 of 38 measurable** within 10 bps of the live balance
- **4.36 bps** largest residual, **2.17 bps** median, the rebasing interest events cannot supply
- **66.8%** error in event-summing a position, measured on a real borrower
- **518** contract tests, 0 failures (417 were the suite as submitted)
- Aave events overstate a real position because aTokens move without emitting an event, so the engine reads the token Transfer ledger, anchored where balance is provably zero
- Interest is never invented: positions advance only against an attested state balance, with a bounded residual
- It sizes credit from the result **on chain**: `PositionSizedCredit` is live on CC3 and returns a real limit — $208,040.04 against a proven $1,040,200.20 at a 20% policy LTV, priced from an attested answer and read live at spark.sithunyein.com/bonus
- The Chainlink proxy that everyone quotes proves no price at all; the aggregator emits, the proxy does not (documented on the live evidence page)
- Live evidence and reproduction commands: spark.sithunyein.com/bonus

## Slide 9 — Traction
Six full closed loops on-chain with real USC proofs.
- 6 full closed loops: Open → Withdraw → Redeem → Repay → Close
- 4 of them run end to end by wallets that are not the founder's, all on the deposit-free path
- 11 attested payments on-chain credit history
- Credit score 850 (max possible)
- LTV 95% (base 90% + 5% history bonus)
- All proofs are real Attestcoin USC proofs verified by BlockProver
- On-chain demo wallet: 0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2
- Live at spark.sithunyein.com · Contracts verified on Blockscout

## Slide 10 — Product
Live testnet product, not a slideware demo.
- spark.sithunyein.com — live on Creditcoin testnet
- github.com/thesithunyein/spark
- Full flow: pay, prove, borrow, repay, close
- Batch proving: link many payments in one tx
- 518 contract tests, strict RLP amount-binding
- spark.sithunyein.com/onchain — all events, no wallet
- Net-position engine: mainnet history to signed net worth

| Contract | Network |
|---|---|
| SepoliaPayment | Sepolia |
| AttestcoinPaymentVerifier | Creditcoin testnet |
| CreditLine + SparkCredit | Creditcoin testnet |
| PositionSizedCredit | Creditcoin testnet |

Testnet only. Not audited. MIT License.

## Slide 11 — The Ask
$10K to ship credit for the real world.
- **Now:** Dual Attestcoin proofs, strict log decoding, credit score and history LTV bonus, live on testnet. 518 tests
- **Deployed:** credit limits sized from a proven position on another chain, not just payment count — `PositionSizedCredit` is live on CC3, and the limit it returns is a real dollar figure
- **With $10K:** External review of the strict verifier, a funded credit book, and a keeper so the attested price never goes stale
- **CEIP fast-track:** Funded credit book, distribution where borrowers already are, mainnet readiness

Spark turns verified facts into creditworthiness. No bank. No oracle. No delegate. The first borrower is the one with a proven position; the path that reaches everyone else is built, tested and deployed — what it lacks is a channel.

MIT License · Sithu Nyein · spark.sithunyein.com
