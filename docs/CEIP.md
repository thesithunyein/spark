# CEIP follow-on plan

**Written after the BUIDL CTC 2026 Fall submission deadline.** Nothing in this document is
part of the submitted project, and nothing here was built before the deadline. It exists
because the three things Spark most needs are the three things a solo builder cannot honestly
claim to have done in a hackathon window, and because the CEIP fast-track is judged on where a
product is going rather than only on where it is.

Stated plainly so no reader has to work out where the line is: **the submission is frozen, and
this is the plan for after it.**

## Why these three, and not more protocol surfaces

Spark's weakest judged pillar is not technical. It is user-based expansion, and the measured
reason is exact: **the 54 on-chain events come from 2 distinct wallets, one of which is the
founder's.** That number is public and stays public, because the alternative — wallets we
control wearing different hats — would be worse than admitting the weakness.

The previous season's Grand Prize went to a **Telegram Mini App for ROSCA savings circles**:
a product where using it *requires* other people. Second and third both named a specific,
identifiable borrower rather than a total addressable market. Those three precedents point the
same way, and none of them is a depth-of-surfaces contest.

So the follow-on work is aimed at the pillar that is actually failing.

## 1. Attested group credit, with vouching

**What it is.** A credit line held by a group rather than an individual. Each member contributes
one proven payment, and the line is sized from the group's aggregate attested history. A member
with proven repayment history can then **vouch** for a new member's first line, and that
guarantee is itself an attested fact rather than a social promise.

**Why it is not just a feature.** It is a new Attestcoin surface, a new product, and a
distribution mechanic in one move:

- **New surface** — a voucher attestation is a fourth data kind alongside DepositPaid,
  RepaymentPaid and BalanceAttested, and the second proof that currently checks a wallet's own
  balance becomes a check on the guarantor's proven standing
- **New product** — the thing a bank structurally cannot copy, because a bank cannot verify a
  stranger's repayment record on a chain it does not control
- **Distribution** — a group product acquires users through its members. This is the mechanism
  CrediKye won with, and Spark's credit primitive already supports the hard part

**What already exists.** `openCredit` already requires two independent proofs and already binds
payer, topic and amount to the receipt RLP. Adding a voucher is an additional proof against an
additional expected topic, plus a policy rule that a guaranteed line is capped at a fraction of
the guarantor's own proven history. `PositionSizedCredit` already demonstrates the harder
version of this: sizing a limit from a position rather than from a payment.

**What has to be built.** A Telegram or web UI that makes joining a group a two-click action,
and per-member exposure accounting inside a shared line. The honest risk is that group credit is
socially complex — repayment incentives inside a small circle are a well-studied problem and
Spark would be re-entering it without the lending experience to price it. That risk is why this
is first on the list rather than assumed to be easy.

**Built since this document was written.** The voucher registry and the exposure policy now
exist as code. `GroupCredit.sol` implements the shared line and vouching, with 31 tests, and
`AttestedStanding.sol` is the portable record that gates membership, with 19 more, and
`StandingGatedCheckout.sol` is a second consumer of that record with 51 more. The design
choices are the ones argued above: membership requires at least one Attestcoin-verified payment,
a vouch is priced off the voucher's own proven volume rather than anyone's promise, and the line
is hard-capped at the members' aggregate proven history so vouching can amplify evidence but can
never manufacture it. `GroupCredit` is a shared line only — per-member exposure is the next step
and is not claimed. `AttestedStanding` and its consumer are deployed to CC3 and exercised end to
end; `GroupCredit` is not deployed. All are labelled post-deadline in source.

**What the consumer proved, and what it found.** A record nothing reads is an interface, not a
fact, so a merchant product was built against the registry, applying its own policy and
snapshotting the Attestcoin evidence reference with each decision. Exercising it surfaced a real
gap: because `AttestedStanding` derives that reference from the borrower's position transaction
hashes and `getHistory` exposes only `(count, volume)`, a wallet that linked attested payments
without ever opening a line gets a record whose reference is zero — proven volume with nothing to
point at. That is reachable, because `submitAttestMultiple` does not require an open position. The
consumer therefore refuses such a record instead of snapshotting zeros. Detail in
[docs/ROADMAP.md](ROADMAP.md).

## 2. A Telegram Mini App

**What it is.** The same pay → prove → borrow → repay loop, shipped where Creditcoin's users
already are.

**Why.** The web app requires a stranger to find the site, connect a wallet, and fund it before
seeing value. The previous Grand Prize was a Mini App. Telegram also solves the group-credit
problem in the same move: a ROSCA-like circle needs a group chat, and Telegram *is* the group
chat.

**What already exists.** The entire flow is on-chain and chain-agnostic from the client's point
of view: the app talks to Sepolia, to CC3, and to the proof-gen API. A Mini App is a new client
for the same contracts, not a new backend.

**The honest blocker.** A Mini App needs a bot, a session model, and a wallet story inside
Telegram. None of that is hard; all of it is a real week of work, and it is worth doing only
if group credit works, because a Mini App for a solo product is a solution without a problem.

## 3. A sponsored deposit, so onboarding has one step

**What it is.** Connect a wallet, and Spark sends the Sepolia ETH needed for the first deposit
from a faucet wallet.

**Why this is the highest-leverage small thing on the list.** Every participant currently has to
acquire testnet funds from **two** separate faucets, one of which is a Discord bot command with
no web API. That is where onboarding dies. The measured funnel is one wallet out of every
person who has ever opened the site, and the faucets are the reason.

**What already exists.** `openCreditFromBalance` removes the deposit requirement entirely — a
line can open from a proven balance with no payment to Spark. Once that generation is deployed,
a new user's only remaining need is Sepolia gas, which is a much smaller ask than a deposit plus
gas on two chains.

**The honest caveat.** A sponsored faucet is a growth mechanic, and growth mechanics on a
testnet measure nothing about real demand. It removes friction from a demo, and that is all it
does. It should not be counted as traction, and this document does not.

## What this plan deliberately does not do

- **It does not add protocol surfaces to win a depth contest.** 15 surfaces is enough. Surface
  count stops mattering the moment the product has no users, and the `/help` page and the
  submission both say so.
- **It does not inflate user numbers.** Every count in this repo is reproducible from the chain.
  A padded number would be worse than a small honest one, and the addresses are public.
- **It does not treat a funded book as implied.** Interest revenue needs capital and a track
  record. A testnet prototype demonstrates neither, and the honest constraint is capital and
  history, not protocol capability.

## Sequence

| Order | Item | Depends on | Why this order |
|---|---|---|---|
| 1 | Deploy the two built layers | a funded CC3 key | Nothing else is judged against live code until this lands |
| 2 | Sponsored deposit | deployment | Cheapest possible lift to the funnel, and it makes every later test easier to run |
| 3 | Group credit with vouching | 1 | The product answer to the failing pillar |
| 4 | Telegram Mini App | 3 | Distribution for a group product, not for a solo one |
| 5 | Real borrowers, small and honest | all | The only input that cannot be engineered |
