# Unit economics

**Status: modelled, not measured.** No value has moved through Spark on a mainnet, and
nothing here is a track record. Every line marked FACT is checkable in the contracts in this
repository today. Every line marked ASSUMPTION is a guess with its reasoning written down and
a stated way to falsify it. That separation is the point of the page: a model presented as
evidence is worse than no model at all, and a reviewer who wants to reject this document
should be able to do it from the assumptions alone.

The last section, "What this analysis changed", is the useful part. Reading the contracts to
write this produced a finding that no amount of spreadsheet work would have produced.

---

## FACT: what the deployed contracts actually do

**Revenue is interest and only interest.** `CreditLine.interestPerYearBps` is `1000` on the
deployed generation, so 10% APR, accrued per second on outstanding debt:

```
interest = debt * interestPerYearBps * dt / (10_000 * 365 days)   // CreditLine._accrue
```

**There is no origination fee.** No fee, no spread, no servicer cut, and no owner revenue
path exists in `CreditLine`, `AttestedStanding`, `GroupCredit`, or `PositionSizedCredit`. A
grep for `fee` across `contracts/src` returns nothing that moves money.

**There is no liquidation, seizure, or write-off path.** A grep for
`liquidate|seize|slash|badDebt|writeOff` across `contracts/src` returns three hits, and all
three are comments. Two of them say explicitly that Spark cannot liquidate:
`PositionSizedCredit` states "Spark can read an Aave position on Ethereum mainnet and cannot
liquidate it from Creditcoin."

**A draw is minted, not funded.** `withdraw` calls `creditToken.mint(msg.sender, amount)`.
There is no pool, no reserve, no deposit of underlying, and no `transferFrom`. sCREDIT is
unbacked credit issued against a proof.

**Nothing moves on Creditcoin at open.** `openCredit` takes no `msg.value` and transfers
nothing. It verifies proofs and writes a `Position`.

**The "deposit" is a proven payment on Sepolia, not custody on Creditcoin.** `payDeposit` on
`SepoliaPayment` does `deposits[msg.sender] += msg.value`, and `SepoliaPayment.withdraw` is
gated to `treasury`. So the ETH is real and is held on Sepolia by a contract the protocol
controls. It is not, however, reachable from a default on Creditcoin without a bridge, and
there is no bridge.

**LTV is policy, not collateral:**

| Path | LTV | Source |
|---|---|---|
| Deposit-backed | 8000 bps base, +250 at >=1 attested payment, +500 at >=3, capped at 9500 | `CreditLine` |
| Balance-sized | 2000 bps flat, minimum line 1e14 wei | `BALANCE_LTV_BPS`, `MIN_BALANCE_LINE_WEI` |
| Position-sized | 2000 bps deployed, 5000 bps hard cap in code | `PositionSizedCredit.MAX_LTV_BPS` |

---

## The consequence: loss given default is 100%, not 20%

This is the single most important line in the document, and it follows directly from the
facts above.

A conventional secured lender's expected loss is roughly `LTV x (1 - recovery)`. A 20% LTV
sounds safe because the lender believes it can sell the asset and recover the rest.

Spark cannot. At default, a draw is an unbacked minted token, there is no liquidation
function, and the only real asset in the system sits on a different chain that the lending
contract cannot reach. So:

```
loss given default  = 100% of drawn principal
expected loss       = default rate x drawn principal
```

The LTV does not limit *loss*. It limits *how much is exposed*, and it caps the size of the
mistake rather than protecting against it. Every figure below inherits that.

---

## ASSUMPTION: the inputs, and how to falsify each

| # | Assumption | Value used | Why | Falsified by |
|---|---|---|---|---|
| A1 | Default rate, annual, on a drawn book | 8% | Mid-range for unsecured consumer credit in emerging markets, which is the population the product names. Chosen to be unflattering rather than flattering. | A single cohort's observed default rate over any 12-month window |
| A2 | Fraction of approved lines actually drawn | 50% | A limit is not a loan. Half of approved borrowers drawing is optimistic for a first product with no brand. | Observed draw rate on any live cohort |
| A3 | Average outstanding term | 6 months | Borrowers repaying faster is good for turnover and bad for interest earned. 6 months is what the current path encourages, since there is no amortisation schedule and interest is simple. | Observed weighted-average time to full repayment |
| A4 | Cost of funds | 0% | sCREDIT is minted, so issuing it costs nothing on-chain. This is not a claim that capital is free; it is a statement that the current mechanism has no funding leg. | Any real funding source, or any redemption promise against sCREDIT |
| A5 | Recovery on default | 0% | Follows from the FACT section. There is no enforcement path. | Any liquidation, seizure, insurance, or guarantee function |
| A6 | Repeats per borrower per year | 1.5 | A repaid line should be reusable, and the credit score exists to reward that. | Observed repeat rate |

A1 through A3 are the ones that matter. A4 and A5 are not really assumptions: they are
descriptions of the code, listed here because they behave like assumptions in a model.

---

## Break-even, worked

Per unit of principal drawn for `T` years, at 10% APR, with 100% loss given default:

```
revenue = 0.10 x P x T
loss    = pd x P
break-even:  pd = 0.10 x T
```

So the tolerable default rate is entirely a function of how long the money is out:

| Average term | Break-even default rate |
|---|---|
| 1 month | 0.8% |
| 3 months | 2.5% |
| 6 months | 5.0% |
| 1 year | 10.0% |
| 3 years | 30.0% |

Against assumption A1 (8% annual) and A3 (6 months), the model is **marginally negative**:
5.0% tolerable against 8% assumed defaulting. At a 1-year term it would be roughly
break-even; at 3 months it would be clearly loss-making.

Note what is missing from that calculation: no origination fee to absorb fixed cost, no late
fees, and no recovery. Each of those is a normal part of a lender's P&L and none of them
exists here.

---

## Worked example: one $10,000 line

Assumptions as above: 50% drawn (A2), 6-month term (A3), 8% annual default (A1), zero
recovery (A5), zero funding cost (A4).

| Line | Value |
|---|---|
| Approved limit | $10,000 |
| Drawn (A2: 50%) | $5,000 |
| Interest at 10% APR for 6 months | $250 |
| Expected loss (A1 x A5: 8% x $5,000, prorated to 6 months = 4%) | $200 |
| **Contribution before fixed cost** | **$50** |

Fifty dollars on a $10,000 approval. Every additional assumption that is even slightly worse
than assumed turns this negative: a 7-month term, a 9% default rate, a 40% draw rate. The
model has essentially **no margin of safety**, and that is the honest headline.

Two details worth noting because they are easy to miss:

- The borrower's Sepolia deposit is not revenue. It is held by `SepoliaPayment` and
  recoverable only by the treasury, so it is a real asset to the protocol but not a
  lendable one, and it does not reduce expected loss.
- Interest is simple, not compounding. A longer term therefore does not compound the
  lender's return the way a credit card would, which is why the break-even rate scales
  linearly with term rather than accelerating.

---

## What this analysis changed

Writing this down produced one finding that changes the product rather than describing it:

**10% APR is not viable pricing for this risk, and the fix is not a bigger LTV.**

The deposit-backed generation sizes a line at up to 95% of a proven Sepolia payment. If the
deposit were held as collateral on Creditcoin, that would be defensible. It is not held on
Creditcoin, so the "collateral" is a demonstrated willingness to pay and nothing more, and the
exposure is unsecured at 95%.

That leaves three honest options, and the repository should be read as needing one of them:

1. **Price the risk.** Raise the rate to where an 8% default rate is survivable: at a 6-month
   term and 100% LGD, that is roughly 16% APR before any margin, so 20% or more.
2. **Take the collateral for real.** Bridge the Sepolia deposit, or size from a position the
   protocol can actually reach on Creditcoin. This is the largest engineering item on the
   roadmap and the most honest reading of "RWA collateral".
3. **Add enforcement.** A guarantee, an insurance pool, or a vetted group's mutual liability,
   which is what `GroupCredit` gestures at but does not yet price.

The `openCreditFromBalance` path at 20% LTV is the most defensible of the deployed paths,
because 20% against a freshly attested balance is a far smaller exposure than 95% against a
payment. That is a real argument for making it the default rather than an alternative.

---

## What would replace this document

This page exists because there is nothing better to put here yet. It is replaced by, in
order of value:

1. One funded pilot book with observed defaults.
2. Observed draw rate and term from any live cohort, which would fix A2 and A3.
3. A recovery function, which would change A5 from 0% and is the only assumption here whose
   falsification would make the product fundamentally stronger.

Until then, treat every number above as a labelled guess. The facts are checkable; the
assumptions are not, and the difference is stated on purpose.
