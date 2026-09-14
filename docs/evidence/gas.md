# Gas Benchmarks — Spark

Measured with `forge test --gas-report` on the full **417-test** suite (Foundry, solc 0.8.24).
These are the EVM gas costs of Spark's credit logic — the on-chain half of a credit open,
separate from the off-chain Attestcoin proof generation.

Re-measure with `cd contracts && forge test --gas-report`.

## Why these numbers matter

Batch proving exists so that linking history costs less per payment. The measurements
below confirm it: a batched history link is cheaper per payment than a separate
`submitAttestedPayment` call.

## AttestcoinPaymentVerifier (the strict receipt-decode path)

Deployment: 1,633,277 gas / 7,855 bytes.

| Function | Min | Avg | Median | Max | Calls |
|---|---|---|---|---|---|
| `verifyPayment` (strict RLP + topic + payer + amount) | 71,709 | 79,264 | 74,710 | 95,929 | 4 |
| `receiptLogCount` (view — receipt parse probe) | 5,582 | 5,918 | 5,582 | 6,592 | 3 |

The strict decode path is cheap relative to the precompile's own continuity walk —
proof verification cost is dominated by the BlockProver, not Spark's log parsing.

## CreditLine (the credit state machine)

Deployment: 2,316,485 gas / 11,121 bytes.

| Function | Min | Avg | Median | Max | Calls |
|---|---|---|---|---|---|
| `openCredit` (dual proofs: deposit + balance) | 26,549 | 244,277 | 268,060 | 268,564 | 228 |
| `openCreditFromBalance` (balance-sized, no deposit) | 24,447 | 116,602 | 173,826 | 173,826 | 25 |
| `executeBatch` (atomic multi-proof, ≤10) | 22,201 | 122,390 | 104,234 | 379,910 | 47 |
| `submitAttestMultiple` (batch history link) | 22,223 | 60,774 | 26,167 | 163,567 | 6 |
| `submitAttestedPayment` (single history link) | 24,519 | 72,812 | 66,246 | 101,070 | 309 |
| `repayCredit` | 24,272 | 85,482 | 97,360 | 131,562 | 45 |
| `withdraw` (mint sCREDIT) | 23,747 | 91,256 | 99,963 | 102,763 | 113 |
| `redeem` (burn sCREDIT) | 24,244 | 39,891 | 37,827 | 47,283 | 28 |
| `accrue` (interest) | 26,455 | 33,422 | 34,284 | 34,284 | 24 |
| `closeUnused` | 26,387 | 51,203 | 55,122 | 55,122 | 22 |
| `creditScore` (view) | 3,234 | 3,234 | 3,234 | 3,238 | 51 |
| `currentDebt` (view) | 18,055 | 18,256 | 18,274 | 18,518 | 79 |
| `availableCredit` (view) | 17,865 | 18,102 | 18,048 | 18,421 | 24 |

## Reading

- **Single history link** (`submitAttestedPayment`): median **66,246** gas per payment.
- **Batched history link** (`submitAttestMultiple`): median **26,167** gas per payment —
  roughly **2.5× cheaper per payment** than linking one at a time.
- **A full credit open with both proofs** (`openCredit`): median **268,060** gas. The second
  proof is not free, but the precompile's continuity walk dominates the two calls, so the
  marginal cost of the solvency check is small relative to the open itself.

These are test-suite measurements against a `MockPaymentVerifier` where the precompile is
stubbed by the test harness, so they isolate Spark's own logic. The `verifyAndEmit` calls to
the real precompile on CC3 cost more and are not included here.
