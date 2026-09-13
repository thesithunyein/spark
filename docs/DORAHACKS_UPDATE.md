# DoraHacks Submission — Spark

Copy-paste text for the submission fields. Every number here was read off the chain or
produced by the commands in the README, and the credit-policy numbers match
`collateralFactorBps()` and `_factorFor()` in the deployed `CreditLine`.

## What is Spark

Spark turns a payment on one chain into credit on another using cryptographic proofs
instead of a trusted intermediary. No oracle operator, no bridge, no paperwork.

A user pays a small deposit on Sepolia. Two Attestcoin proofs verify it on Creditcoin —
one proves the payment happened, the other proves the wallet actually holds the funds.
Credit opens on Creditcoin against both proofs. The user withdraws, uses, and repays.

## The Problem

2.5 billion people cannot access credit because they lack bank history, documentation or
infrastructure. Cross-chain credit in crypto has the same problem in a different shape:
proving what happened on another chain normally means trusting someone.

Three specific failures:

1. **Oracles require trust.** A centralized attestation service can be manipulated,
   censored, or go offline.
2. **Bridges are single points of failure.** They have been drained for billions.
3. **Self-reported history is worthless.** A borrower can open and repay their own loan
   a hundred times to manufacture a perfect score.

Spark's answer to all three is proof instead of permission: the evidence is verified by
the Attestcoin Protocol on Creditcoin, so no operator sits in the middle, and the payment
history that drives the score is proven rather than self-reported.

## How It Works

1. User pays a 0.01 ETH deposit on Sepolia
2. The app snapshots the wallet's Sepolia ETH balance via `attestBalance`
3. Spark requests **two BlockProver proofs in parallel** through the Attestcoin Protocol,
   so both wait on one attestation window rather than two sequential ones
4. **Proof one** verifies the deposit event by strict-decoding the receipt RLP from the
   proven transaction
5. **Proof two** verifies the wallet balance: the solvency check
6. On-chain, `AttestcoinPaymentVerifier` calls `verifyAndEmit` on the BlockProver
   precompile (`0x0FD2`) twice, then decodes the receipt logs to bind topic, payer and
   amount to the proof. A decoded amount that disagrees with the claim **reverts**
7. Credit opens on Creditcoin, sized by the policy below
8. The user withdraws sCREDIT, repays on Sepolia when ready, and the line closes

## How credit is sized, precisely

Being exact here matters more than sounding impressive, because this is the part a
reviewer can verify on chain.

The deployed generation sizes the line as **`deposit × factor`**, where the factor is
chosen by proven wealth and the borrower's proven history:

| Condition | Base factor |
|---|---|
| Attested balance ≥ 2× deposit | 9000 bps (90%) |
| Attested balance ≥ deposit | 8500 bps (85%) |
| Otherwise | `collateralFactorBps` = 8000 bps (80%) |

History then adds **+250 bps** at ≥1 linked payment and **+500 bps** at ≥3, capped at
`MAX_FACTOR_BPS` = **9500 bps**. Interest is **10% APR** (`interestPerYearBps` = 1000).

Read that table honestly and the shape is clear: **the attested balance selects the tier,
but the deposit sets the size.** So this generation is best described as bridgeless
cross-chain liquidity with a proven-wealth gate — it removes the bridge, and it removes
the borrower with no deposit along with it.

That limit is why the next layer exists, and it is already built and tested:
`PositionSizedCredit` sizes a limit from a **proven net worth on Ethereum mainnet**,
reconstructed from the aToken Transfer ledger, anchored at a provably-zero block and
valued through **attested Chainlink prices**. In the end-to-end run it returns
**$217,276** against a proven **$1,086,382** at a 20% policy LTV, with a hard
half-of-net-worth cap and distinct status codes for why a limit is zero. It is executed
end to end on a local chain with real mainnet data and read back from the deployed
contracts; it is **not yet broadcast to CC3**.

Scope is stated rather than implied: **13 of the 46 on-chain events** carry a wealth signal
(9 `BalanceAttested` events plus the attested balance recorded in each of the 4
`CreditOpened` events), and the deployed generation still requires a deposit to open.

**Two layers are built to remove that requirement.** `openCreditFromBalance` needs no deposit
at all: it sizes the line at a conservative **20% of the attested Sepolia balance** and reuses
the kind-3 balance attestation the deployed verifier already handles, so it adds no new proof
machinery. It keeps the full enforcement route, since it is the same `CreditLine`:
`withdraw`, `redeem`, `repayCredit` and `closeUnused` all work unchanged. For the same
borrower wealth the two models differ by more than **200x** (a 0.01 ETH deposit against 10 ETH
attested lends 0.009 ETH; the balance path lends 2 ETH). It is built and covered by 21 tests,
including that a balance attestation never inflates the credit score, because a balance is not
a payment. It needs a `CreditLine` redeploy to go live, so it is **not deployed yet**.

The second layer is `PositionSizedCredit`, described above, which sizes from a proven net
worth on Ethereum mainnet rather than a Sepolia balance.

## Attestcoin Protocol Integration Summary

Spark makes **15 distinct Attestcoin Protocol surfaces** load-bearing, across 3 attested
event kinds and 5 on-chain entry points.

### On-Chain Surfaces (9)

1. **verifyAndEmit (`0x0FD2`)** — BlockProver precompile, proves transaction inclusion and
   chain continuity. Called **twice per credit open** (deposit + balance).
2. **MerkleProof struct** — inclusion proof construction required by the precompile
3. **ContinuityProof struct** — chain continuity proof, so the source block is genuinely
   part of the chain
4. **Receipt RLP parsing** — `_parseReceiptLogs()` decodes an Ethereum receipt on chain in
   custom Solidity, extracting events from proven transaction data
5. **Topic matching** — matches the event signature against decoded logs to identify the
   correct payment event
6. **Amount binding** — the decoded amount must equal the claimed amount, so value is
   cryptographically bound to the proof rather than trusted
7. **calculateTxIndex** — Merkle path position of a transaction within its block
8. **previewIngest** — dry-run proof validation via `staticcall`, returning
   `(wouldPass, reason)` without spending gas
9. **executeBatch** — atomic multi-proof verification, all-or-nothing

### Off-Chain SDK Surfaces (4)

1. **ProofBuilder** — assembles Merkle + continuity proofs via `@gluwa/usc-sdk`
2. **waitUntilHeightAttested** — polls until the source block is attested, **in parallel**
   for the dual proofs
3. **getProof** — generates the proof blob for on-chain verification
4. **getBatchProof** — batch proof generation in one SDK call

### Attested Event Kinds (3)

- **Kind 1 (DepositPaid)** — proves the user deposited
- **Kind 2 (RepaymentPaid)** — proves the user repaid
- **Kind 3 (BalanceAttested)** — proves the wallet holds funds. This is the solvency check.

### Unique to Spark: dual proofs on every open

Every `openCredit` requires two independent `verifyAndEmit` calls — one for the payment,
one for the balance. A single-proof design lets a borrower with an empty wallet open
credit by making one payment. Spark's second proof means the balance is checked at the
moment of the decision, not assumed from the first.

## Public on-chain record

**[spark.sithunyein.com/onchain](https://spark.sithunyein.com/onchain)** renders every
event the deployed contracts have emitted — **46 events across two chains**, oldest first,
each linked to its Blockscout entry, **with no wallet and no sign-in**.

The app's own history page is scoped to the connected address, which meant a reviewer with
a fresh wallet saw an empty product. That record is now public, and it leads with its own
scope rather than burying it: **all 46 events came from a single wallet.** One wallet
proves the loop works end to end. It does not prove a market exists.

Measured, not asserted: **4 credit lines opened, 2 closed, 6 attested payments linked,
0.0175 ETH drawn, 6 Sepolia deposits, 5 repayments, 9 balance attestations.**

Rows are generated from chain reads into a typed module, so the page cannot drift from the
chain. Refresh: `npm run activity:regen`.

## What Makes Spark Different

- **Dual proofs on every credit open** (payment + solvency), not one proof
- **Strict receipt RLP decoding on chain** — a decoded amount that differs from the claim
  **reverts**; it never falls through to a weaker check. Proven by crafted-receipt tests
  against the real verifier, including the 0.001-sent / 10-claimed case
- **On-chain credit scoring** — 650 base, +40 per linked payment, capped at 850. History
  bonus +2.5% at ≥1 payment, +5% at ≥3. All computed in the EVM
- **Batch proving** — `submitAttestMultiple` and `executeBatch` link many payments in one
  transaction
- **A position engine for real mainnet history** — the aToken Transfer ledger reconciles
  real Aave V3 positions within **0.51 bps across 8/8 wallets**, where summing protocol
  events is wrong by up to **66.8%** on a single position
- **A public on-chain record** that a reviewer can check without a wallet

## Technical Specs

- **417 passing contract tests**, 0 failures (300 core, 21 balance-sized credit, 6 strict-path
  against the real verifier, 23 credit-policy, 31 price/valuation, 30 position-registry,
  6 stack integration)
- **8 live precompile negative-path tests** against the real BlockProver on CC3
  (read-only, zero cost)
- **11 Solidity contracts** in `src/`, non-custodial throughout; Spark never holds keys
- **15 Attestcoin surfaces** load-bearing, driven by **two proofs per credit open**
- On-chain history records **kinds 1 and 2** (`AttestedPaymentLinked`); the kind-3 balance
  claim is verified by the second proof and recorded as `CreditOpened.attestedBalance` and
  the Sepolia `BalanceAttested` event
- Real transactions on Sepolia and Creditcoin testnets; contracts verified on Blockscout
- **Two complete closed loops** on chain with verifiable proofs
- **6 attested payment history events**, on-chain `creditScore()` = **850** (the cap)
- 13 app routes; production bundle verified to carry the deployed addresses
- Solo build; repo created **August 13, 2026**, the day submissions opened

## Undocumented Protocol Discoveries (6)

1. **ChainInfo (`0x0FD3`) uses snake_case selectors.** The camelCase calls the docs imply
   revert with "Unknown selector". The working ABI is `get_supported_chains`,
   `get_latest_attestation_height_and_hash`, `get_attestation_bounds` — confirmed live on
   CC3 and against the official `@gluwa/usc-sdk` ABI.
2. **Ethereum mainnet is attested on CC3 (chainKey 3).** `get_supported_chains()` reports
   Sepolia (chainKey 1) **and** mainnet (chainKey 3) with attested heights.
3. **Batch atomicity is total.** `executeBatch` reverts the whole batch if any claim fails;
   no partial writes are possible.
4. **previewIngest saves gas.** `verify()` returns false rather than reverting on forged
   proofs, so `previewIngest` catches them in `staticcall` without spending gas.
5. **verify() vs verifyAndEmit().** `verify()` returns false on invalid proofs;
   `verifyAndEmit()` reverts. Different error handling for the same failure.
6. **All 8 forged proof scenarios rejected.** Forged root, wrong chain, zero height, empty
   transaction, mismatched siblings, large chain key, max height, and random bytes are all
   rejected by the real precompile.

## Honest limits

Stated here because a reviewer will find them anyway, and a claim you can check is worth
more than one you cannot:

- The position engine is **executed locally and not broadcast to CC3**. The deployed credit
  flow is separate and live.
- **One wallet** has produced the entire on-chain record. That is a working proof, not
  traction.
- The deployed generation sizes from the deposit, as set out above. The position layer is
  the built answer and is awaiting broadcast.
- Testnet only, not audited.

## Why This Matters

Spark removes the intermediary from cross-chain credit. No bank, no oracle and no bridge
stands between a proven payment and a credit line, and every step is verifiable on chain by
anyone — including the parts that are uncomfortable. You pay, you get proved, you get
credit, and a reviewer can check all of it without asking permission.

## Documentation

- **[docs/ATTESTCOIN_SURFACE.md](ATTESTCOIN_SURFACE.md)** — 15 surfaces, why each is needed,
  what breaks without it
- **[docs/THREAT_MODEL.md](THREAT_MODEL.md)** — 10 attacks prevented, honest limits
  disclosed, undocumented discoveries
- **[docs/SCORING.md](SCORING.md)** — score formula, LTV tiers, interest model, constants
- **[docs/PROOF_OF_NET_POSITION.md](PROOF_OF_NET_POSITION.md)** — the mainnet position
  method, its measurements and its limits
- **[docs/ROADMAP.md](ROADMAP.md)** — what is deployed, what is not, and what comes next
- **[docs/DEPLOY_CC3.md](DEPLOY_CC3.md)** — the one command that broadcasts the position layer
- **[docs/evidence/](evidence/)** — on-chain artifacts, addresses and transaction hashes
