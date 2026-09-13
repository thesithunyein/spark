# Roadmap

This document is deliberately unflattering about where Spark is today, because a roadmap
that starts from an inflated present is worthless to the person reading it.

## Where Spark actually is

**Live and working.** A user pays on Sepolia, two Attestcoin proofs verify the deposit event
and the wallet balance, and credit opens on Creditcoin. Four credit lines have been opened
across the two deployed `CreditLine` contracts and two complete loops have been closed. That
record is public, wallet-free and independently verifiable: 46 events, every one linking to
Blockscout, at [spark.sithunyein.com/onchain](https://spark.sithunyein.com/onchain). On-chain
`creditScore()` reads 850. Contract suite is 417 tests, 0 failures. The BlockProver precompile
rejects all eight forged-proof scenarios we throw at it, read-only and free to re-run.

**Measured but not deployed.** The mainnet position engine reconstructs a real Aave V3 position
from the aToken Transfer ledger, anchored at a provably-zero block, and values it through
attested Chainlink prices. Eight real mainnet wallets reconcile within 0.51 bps. It has been
executed end to end on a local chain with real mainnet data and read back from the deployed
contracts, but it has **not** been broadcast to CC3.

**Not started.** Real user acquisition. The on-chain record is unambiguous about this: every
one of the 46 events was produced by a **single wallet**. One wallet can prove a loop works; it
cannot prove a market exists. This is the weakest part of the project and no amount of protocol
depth fixes it, which is why it is written here rather than left for a judge to discover.

## The thesis

Credit underwriting needs two things that a single chain cannot give you: a borrower's history
elsewhere, and proof that they can cover the loan. Both can be proven rather than trusted, and
Attestcoin is what makes proving them possible without an oracle operator in the middle.

The interesting part is not the payment proof. It is that a position on another chain can be
reconstructed and valued, because that is the input every real lending decision actually needs.

## Milestones

### M1. Broadcast the position engine to CC3

**Unlocks:** the deepest Attestcoin integration in the project becomes a live, independently
verifiable artifact instead of a local execution plus a transcript.

**Depends on:** a funded CC3 key. The deploy is one command
(`script/ProveMainnetPosition.s.sol`) and the flow is already proven against mainnet data.

**Effort:** hours, not days. The work is done; this is a broadcast.

### M2. Position-aware credit limits

**Status: built, not deployed.** `PositionSizedCredit` sizes a limit from proven net worth,
with an explicit policy, a hard half-of-net-worth cap, and distinct status codes for why a
limit is zero. In the local end-to-end run it returns **$217,276** against a proven net worth
of **$1,086,382** at a 20% policy LTV. 23 tests cover it, including the cases where the answer
must be reported rather than flattened to zero.

**What is still missing:** no enforcement path. Nothing draws against the limit, so it is a
policy output rather than a funded line, and there is no liquidation logic because there is
nothing to liquidate: a proven mainnet position is verified data, not seizable collateral.

**Depends on:** M1 for the deployment, and a real credit book for the limit to mean anything.

### M2b. Credit sized by a proven balance, with no deposit

**Status: built and tested, needs a `CreditLine` redeploy.** The deployed generation sizes its
line as `deposit x LTV`, which means the borrower's own deposit is both the collateral and the
ceiling. `openCreditFromBalance` removes the deposit entirely and sizes from the attested
Sepolia balance instead, at a conservative 20% policy LTV, with a floor that refuses dust
lines rather than opening an unusable one.

Unlike M2, this path has a full enforcement route, because it is the same `CreditLine`:
`withdraw`, `redeem`, `repayCredit` and `closeUnused` all work on it unchanged. It needs only
the kind-3 balance attestation, which the **deployed** verifier already handles, so it adds no
new proof machinery. 21 tests cover it, including that a balance attestation never inflates
the credit score, since a balance is not a payment.

For the same borrower wealth the two models differ by more than 200x: a 0.01 ETH deposit with
10 ETH attested lends 0.009 ETH, while the balance path lends 2 ETH. That is the difference
between a deposit mirror and credit, and it is why this path exists.

**Depends on:** a funded CC3 key. Adding a function to a deployed contract means deploying a
new `CreditLine`, which is why it is not live yet.

### M3. State proofs for current position, ledger proofs for history

**Unlocks:** a position that stays correct without replaying every event, which is what makes
the model affordable per borrower.

**Depends on:** M1. The measured conclusion from eight wallets is that interest is the one input
events can never supply, which is why the current design caps the residual and reverts past it
rather than pretending to compute interest.

### M4. Distribution: meet users where they already are

**Unlocks:** the only pillar where Spark currently scores near zero.

A website requires a stranger to find it, connect a wallet, and pay before seeing value. The
previous season's Grand Prize was a Telegram Mini App, and a credit product is not inherently a
solo activity, so the honest fixes are to ship the same loop as a Mini App and to make the
product multiplayer by giving a group a reason to vouch for a member.

**Depends on:** M1 and M2, because a distribution push against a product that cannot size credit
from real history would be wasted.

### M5. Repeat: attested history that compounds across activity rounds

**Unlocks:** a borrower who repays in one round carries proven standing into the next without
paperwork, which is the actual user-visible promise of the product.

**Depends on:** M2, since a round-based mechanic needs limits that respond to proven history.

## Who pays, and why

**Borrowers pay interest.** The product is a credit line, so the revenue is the spread on
outstanding debt. The 10% APR accrual is implemented and tested.

**Lenders and capital partners fund the book.** The reason a lender should care is that the
underwriting input is cryptographically verified rather than self-reported, which is exactly the
input that makes an unsecured loan to a thin-file borrower priceable at all.

**The honest risk to this model:** interest revenue requires a funded book, and a funded book
requires underwriting confidence that a testnet prototype cannot yet demonstrate. That is a
capital and track-record problem, not a protocol one.

## What we will not do

- **We will not inflate user counts.** Every number in this repo is reproducible, and a count
  padded with wallets we control would be worse than a small honest one.
- **We will not claim on-chain what is only measured off-chain.** The evidence pages separate
  what is measured, what is executed locally, and what is deployed, on purpose.
- **We will not keep adding protocol surfaces to win a depth contest.** Surface count stops
  mattering the moment the product has no users.
