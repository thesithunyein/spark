# Roadmap

This document is deliberately unflattering about where Spark is today, because a roadmap
that starts from an inflated present is worthless to the person reading it.

## Where Spark actually is

**Live and working.** A user pays on Sepolia, two Attestcoin proofs verify the deposit event
and the wallet balance, and credit opens on Creditcoin. Three credit lines have been opened on
the deployed contracts and two complete loops have been closed. On-chain `creditScore()` reads
850. Contract suite is 373 tests, 0 failures. The BlockProver precompile rejects all eight
forged-proof scenarios we throw at it, read-only and free to re-run.

**Measured but not deployed.** The mainnet position engine reconstructs a real Aave V3 position
from the aToken Transfer ledger, anchored at a provably-zero block, and values it through
attested Chainlink prices. Eight real mainnet wallets reconcile within 0.51 bps. It has been
executed end to end on a local chain with real mainnet data and read back from the deployed
contracts, but it has **not** been broadcast to CC3.

**Not started.** Real user acquisition. Measured distinct wallets that have used the product is
in the single digits. This is the weakest part of the project and no amount of protocol depth
fixes it.

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

**Unlocks:** a borrower's limit on Creditcoin is sized by a proven position on another chain,
not only by their payment count here. This is the difference between a credit score and credit.

**Depends on:** M1, plus a risk parameter review of the LTV tiers. The valuation layer already
returns signed net worth with liabilities subtracted, so the missing piece is the limit formula
and its tests, not new infrastructure.

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
