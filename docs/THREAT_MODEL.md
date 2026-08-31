# Threat Model — Spark

> What Spark prevents, what it does not, and what is still open.

## What the precompile proves and does not prove

The BlockProver precompile at `0x0FD2` proves:

- ✅ A transaction was **included** in a specific block on the source chain
- ✅ That block is **genuinely part** of the source chain's history (continuity proof)
- ✅ The receipt data (logs, status) is part of the proven transaction

The precompile does **not** prove:

- ❌ That the transaction **succeeded** (receipt status)
- ❌ Which **contract** emitted a log (address)
- ❌ What a log **means** (event semantics)
- ❌ That the **caller** is entitled to credit for it

Every check the precompile skips is enforced by `AttestcoinPaymentVerifier` and `CreditLine`.

---

## Attacks Spark Prevents

### 1. Replay Attack

**Attack:** Submit the same proof twice to get double credit.

**Defense:** `CreditLine.usedTx[txHash]` mapping. Once a `txHash` is consumed (by `openCredit`, `repayCredit`, or `submitAttestedPayment`), any second submission reverts with `TxAlreadyUsed`.

**Shared map:** `usedTx` is shared across all entry points. A `txHash` used in `submitAttestedPayment` cannot be reused in `openCredit`, and vice versa.

**Test:** `testReplayRejected`, `testSubmitAttestedPaymentReplayRejected`, `testOpenDepositCannotReuseLinkedHistoryTx`

### 2. Wrong Payer / Credit Theft

**Attack:** Prove someone else's payment and claim credit for it.

**Defense:** `claim.payer == msg.sender` check in `CreditLine`. The payer in the proof must be the person calling the function. Additionally, the verifier reads the payer from `topics[1]` of the decoded log — a proven, immutable field — not from the claim.

**Test:** `testWrongPayerReverts`

### 3. Amount Forgery

**Attack:** Pay 0.001 ETH but claim 10 ETH to get a larger credit line.

**Defense:** `_verifyLogStrict()` in `AttestcoinPaymentVerifier` extracts the amount from the decoded receipt log data and requires `decoded amount == claim.amount`. The amount is cryptographically bound to the proven transaction — it cannot be altered without invalidating the Merkle proof.

**Fallback:** If strict RLP parsing returns 0 logs (backward compatibility), substring scan matches the topic and payer but does not bind amount. The strict path is always preferred.

**No test yet** — this is the highest-value test to add.

### 4. Fake Contract / Lookalike Event

**Attack:** Deploy a contract on Sepolia that emits the same event signature, prove that instead of the real SepoliaPayment.

**Defense:** `AttestcoinPaymentVerifier` checks `expectedPaymentContract` — only logs from the registered SepoliaPayment address are accepted. The verifier extracts the log address from the RLP-decoded receipt and compares it against `expectedPaymentContract` (set at construction).

### 5. Wrong Chain

**Attack:** Submit a proof from a different chain (e.g., Ethereum mainnet) pretending it's Sepolia.

**Defense:** `chainKey != expectedChainKey` check in the verifier. The expected chain key (Sepolia = 1) is set at construction. The precompile itself also validates chain consistency via the continuity proof.

### 6. Invalid Proof / Fabricated Merkle Root

**Attack:** Submit a proof with a fake Merkle root or incorrect siblings.

**Defense:** The precompile's `verifyAndEmit` validates the Merkle proof against the attested block header. A fabricated root fails the precompile check and reverts with `ProofFailed`.

### 7. Negative Amount

**Attack:** Submit a proof with amount = 0 to open credit with no deposit.

**Defense:** `claim.amount == 0` check in `CreditLine` reverts with `BadAmount`. Applied in `openCredit`, `repayCredit`, and `submitAttestedPayment`.

### 8. Duplicate History Link

**Attack:** Link the same payment multiple times to inflate credit score.

**Defense:** `usedTx[txHash]` prevents reuse. `testSubmitAttestedPaymentReplayRejected` verifies this.

### 9. Withdraw More Than Available

**Attack:** Withdraw more credit than the position allows.

**Defense:** `line.withdraw(amount > available)` reverts with `ExceedsAvailable`. `available = credit - debt`.

**Test:** `testWithdrawExceedsReverts`

### 10. Redeem More Than Debt

**Attack:** Burn more sCREDIT than the outstanding debt.

**Defense:** `line.redeem(amount > debt)` reverts with `ExceedsDebt`.

---

## What Spark Does NOT Prevent (Honest Limits)

### 1. No Liquidation

Interest accrues at 10% APR, but there is no on-chain enforcement if a position becomes underwater. If the attested Sepolia balance drops after credit opens, the position is not automatically liquidated.

**Impact:** Low on testnet (no real value). Critical on mainnet.

**Roadmap:** Re-attest balance on a cadence; liquidate when attested health falls below threshold.

### 2. Balance Is a Snapshot

Kind 3 (`BalanceAttested`) proves the Sepolia ETH balance at the moment `attestBalance` was mined. It does not prove the balance is current when credit is opened (~8–20 minutes later).

**Impact:** A user could drain their wallet between `attestBalance` and `openCredit`. The balance proof would still pass.

**Mitigation:** The 8–20 minute attestation window makes this hard to exploit in practice. The balance is used for LTV sizing, not as a live collateral check.

### 3. No External Protocol History

Spark proves payments made through its own `SepoliaPayment` contract. It does not read external protocols (Aave, Compound, etc.).

**Impact:** Credit history is self-reported through a known contract. A judge might question whether this is "real" creditworthiness.

**Counter-argument:** The balance attestation (kind 3) proves real capital exists. A user with 10 ETH attested balance has demonstrated solvency regardless of which contract received the payment.

### 4. History Bonus Is Static at Open

Linking attested payments after `openCredit` updates `creditScore` but does not resize the active credit line. The LTV bonus is computed once at open time.

**Impact:** A user who links history after opening does not get a larger credit line until they close and reopen.

**Roadmap:** `boostCredit` function to apply history bonus to active lines.

### 5. Single Lender Model

There is no lending pool or depositor. Spark's credit is created from the deposit itself (up to 95% LTV). This is closer to a CDP than a lending market.

**Impact:** No yield for depositors. No external capital risk.

### 6. No Identity Verification

Any address can open credit. There is no KYC, soulbound identity, or sybil resistance beyond the balance attestation.

**Impact:** One person can open multiple positions with multiple wallets. Balance attestation limits the damage (each position requires proven capital), but does not prevent it.

---

## Test Coverage of Prevented Attacks

| Attack | Test | Status |
|---|---|---|
| Replay | testReplayRejected | ✅ |
| Double history link | testSubmitAttestedPaymentReplayRejected | ✅ |
| History + open reuse | testOpenDepositCannotReuseLinkedHistoryTx | ✅ |
| Wrong payer | testWrongPayerReverts | ✅ |
| Bad proof | testBadProofReverts | ✅ |
| Wrong amount (withdraw) | testWithdrawExceedsReverts | ✅ |
| Amount forgery (verifier) | — | ❌ **Missing** |
| Wrong chain key | — | ❌ **Missing** |
| Malformed proof (too short) | — | ❌ **Missing** |
| Zero logs in receipt | — | ❌ **Missing** |
| Wrong event topic | — | ❌ **Missing** |
| Negative amount | — | ❌ **Missing** |

The missing tests are the highest-priority additions — they cover the verifier's security-critical paths.
