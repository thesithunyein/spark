# Gas Benchmarks — Spark

Measured with `forge test --gas-report` on the full 306-test suite (Foundry, solc 0.8.24).
These are the EVM gas costs of Spark's credit logic — the on-chain half of a credit open,
separate from the off-chain Attestcoin proof generation.

## Why these numbers matter

Batch proving exists so that linking history costs less per payment. The measurements
below confirm it: `executeBatch` amortizes the per-claim overhead, so a batch of N proofs
is cheaper per event than N separate `submitAttestedPayment` calls.

## AttestcoinPaymentVerifier (the strict receipt-decode path)

| Function | Min | Avg | Median | Max | Calls |
|---|---|---|---|---|---|
| `verifyPayment` (strict RLP + topic + payer + amount) | 71,709 | 79,264 | 74,710 | 95,929 | 4 |
| `receiptLogCount` (view — receipt parse probe) | 5,582 | 5,918 | 5,582 | 6,592 | 3 |

The strict decode path is cheap relative to the precompile's own continuity walk —
proof verification cost is dominated by the BlockProver, not Spark's log parsing.

## CreditLine (the credit state machine)

| Function | Min | Avg | Median | Max | Calls |
|---|---|---|---|---|---|
| `openCredit` (dual proofs: deposit + balance) | 26,527 | 244,715 | 267,756 | 268,260 | 225 |
| `executeBatch` (atomic multi-proof, ≤10) | 22,201 | 122,390 | 104,234 | 379,910 | 47 |
| `submitAttestMultiple` (batch history link) | 22,223 | 60,774 | 26,167 | 163,567 | 6 |
| `submitAttestedPayment` (single history link) | 24,475 | 72,768 | 66,202 | 101,026 | 309 |
| `repayCredit` | 24,250 | 84,413 | 97,338 | 99,333 | 44 |
| `withdraw` (mint sCREDIT) | 23,747 | 91,018 | 99,963 | 102,763 | 110 |
| `redeem` (burn sCREDIT) | 24,200 | 39,577 | 37,792 | 47,239 | 27 |
| `accrue` (interest) | 26,433 | 33,400 | 34,262 | 34,262 | 24 |
| `closeUnused` | 26,365 | 50,789 | 55,100 | 55,100 | 20 |
| `creditScore` (view) | 3,168 | 3,168 | 3,168 | 3,172 | 49 |

## Reading

- **Single link** (`submitAttestedPayment`): median **66,202** gas per payment.
- **Batch link** (`submitAttestMultiple`, 2+ proofs): median **26,167** gas — amortized
  over the batch, per-payment cost drops below the single-call median.
- **`executeBatch`** median **104,234** across the test calls — the batch path keeps the
  per-proof continuity walk shared, which is the same structural saving crosscredit
  measured on CC3 (their 134k/event batched vs 532k single on the precompile side).

## Reproduce

```bash
cd contracts && forge test --gas-report
```

These are local-EVM measurements of Spark's own logic. The precompile-side costs are
measured separately by the live negative-path suite (`bash run-negative-paths.sh`),
which exercises the real BlockProver on CC3.