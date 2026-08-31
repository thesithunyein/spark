# Credit Score & LTV Model — Spark

> How Spark computes creditworthiness from Attestcoin-verified payment history.

## Overview

Spark's credit score is computed **entirely on-chain** from Attestcoin-verified Sepolia payment history. No oracle, no off-chain model, no API. Anyone can recompute the score by reading `CreditLine.creditScore(user)` and `CreditLine.getHistory(user)`.

Three properties are deliberate:

1. **Deterministic.** Same history always produces the same score. No owner-tunable weights.
2. **Transparent.** Every constant is in `CreditLine.sol`. Anyone can audit the formula.
3. **Cryptographically anchored.** Every payment counted has been proven by the BlockProver precompile. Self-reported history is impossible — only proven transactions increase score.

---

## Credit Score Formula

```
score = min(650 + (history.count × 40), 850)
```

| Component | Value | Source |
|---|---|---|
| Base score | 650 | `SCORE_BASE` constant |
| Per attested payment | +40 | `SCORE_PER_PAYMENT` constant |
| Cap | 850 | `SCORE_CAP` constant |

**Implementation:** `CreditLine.creditScore(address user)` — pure on-chain view function.

### Why 650 base?

650 is the traditional FICO "fair" threshold. A new Spark user starts with a baseline that represents "unknown but not risky." This matches real-world credit scoring where new borrowers start in the middle of the scale.

### Why +40 per payment?

Each attested payment is a cryptographically verified event. 40 points per payment means 5 payments reach the cap (650 + 5×40 = 850). This is calibrated to reward consistent usage without making the score trivially farmable — each payment requires a real Sepolia transaction with real gas cost, proven by Attestcoin.

### Why cap at 850?

850 is the traditional FICO "perfect" score. Capping at 850 prevents infinite score inflation and aligns with user expectations. The cap is reached after 5 attested payments — achievable in a reasonable timeframe but not trivially.

---

## LTV Bonus from Payment History

Payment history increases the loan-to-value ratio, allowing borrowers to access more credit per unit of deposit.

| History Count | Bonus | Effective LTV (with 90% base) |
|---|---|---|
| 0 payments | +0 bps | 90% |
| ≥1 payment | +250 bps (+2.5%) | 92.5% |
| ≥3 payments | +500 bps (+5.0%) | 95% |

**Implementation:** `CreditLine.historyBonusBps(address user)` — on-chain view function.

**Cap:** `MAX_FACTOR_BPS = 9,500` (95%). History bonus cannot push LTV above 95%.

### Why these tiers?

- **+250 bps at ≥1:** A single proven payment demonstrates the user has made a real transaction through the system. This is the "foot in the door" bonus.
- **+500 bps at ≥3:** Three payments demonstrate consistency. This is the "trusted borrower" bonus.
- **Cap at 95%:** Even the most trusted borrower must maintain 5% collateral. 100% LTV would mean zero collateral — unacceptable for a testnet credit system.

---

## Balance-Based LTV (Solvency Check)

The attested Sepolia ETH balance determines the base LTV before history bonus is applied.

| Balance vs Deposit | Base LTV |
|---|---|
| ≥ 2× deposit | 90% |
| ≥ 1× deposit | 85% |
| < 1× deposit | `collateralFactorBps` (80% default) |

**Implementation:** `CreditLine._factorFor(deposit, attestedBalance, user)` — internal function combining balance factor + history bonus.

### Why balance matters

A borrower with 10 ETH attested balance depositing 1 ETH is more solvent than a borrower with 1.1 ETH depositing 1 ETH. The balance attestation (kind 3) proves the borrower has real capital — it's a solvency signal, not just a payment signal.

### Why this is unique

No other project in this hackathon verifies solvency. Most projects prove a payment happened. Spark proves the borrower can afford the credit.

---

## Full LTV Computation

```solidity
function _factorFor(uint256 deposit, uint256 attestedBalance, address user)
    internal view returns (uint256)
{
    uint256 base;
    if (attestedBalance >= deposit * 2) base = 9_000;      // 90%
    else if (attestedBalance >= deposit) base = 8_500;      // 85%
    else base = collateralFactorBps;                         // 80%

    uint256 withBonus = base + historyBonusBps(user);
    if (withBonus > MAX_FACTOR_BPS) return MAX_FACTOR_BPS;  // 95% cap
    return withBonus;
}
```

**Example:** User deposits 0.01 ETH, has 0.03 ETH balance (3×), and 3 linked payments:
- Base: 90% (balance ≥ 2× deposit)
- History bonus: +500 bps (≥3 payments)
- Total: 95% (capped at MAX_FACTOR_BPS)
- Credit: 0.01 × 95% = 0.0095 ETH

This matches the on-chain proof: `CreditOpened` event with `factorBps = 9500` for the Aug 14 open.

---

## Tier System

| Score Range | Description | LTV |
|---|---|---|
| 650 | New borrower (base) | 80–90% + bonus |
| 690–770 | Growing history | 80–90% + bonus |
| 770–850 | Established borrower | 80–95% |

Note: Spark does not have discrete tiers (Bronze/Silver/Gold/Platinum). The score is continuous and the LTV scales smoothly. This avoids cliff effects where a user is incentivized to farm exactly to a threshold.

---

## Interest Model

| Parameter | Value |
|---|---|
| APR | 10% (configurable per deployment) |
| Accrual | Continuous, on every state-changing call |
| Implementation | `CreditLine._accrue()` — simple interest |

**Formula:**
```
interest = debt × interestPerYearBps × dt / (10_000 × 365 days)
```

Interest is added to `pos.debt` on every `withdraw`, `redeem`, `repayCredit`, `getPosition`, and `availableCredit` call. This ensures the reported debt is always current.

---

## What Makes This Trustworthy

1. **Every payment is Attestcoin-proven.** The BlockProver precompile verified the transaction on-chain. No self-reported history.
2. **Amount is cryptographically bound.** The verifier extracts amount from proven receipt logs, not from user claims.
3. **Replay protection.** Each `txHash` can only be used once across all entry points.
4. **On-chain computation.** Score, history bonus, and LTV are computed inside the EVM. No off-chain oracle, no API, no admin override.
5. **Deterministic.** Same inputs always produce the same output. Anyone can verify by reading contract state.
