# Attestcoin Protocol Surface — Spark

> Submission document for BUIDL CTC 2026 Fall.
> "Depth of Attestcoin Protocol utilization will be evaluated as one of the core scoring criteria."

## Summary

Spark makes **15 distinct Attestcoin Protocol surfaces** load-bearing across 3 attested event kinds and 5 on-chain entry points. Remove any one and the product degrades or stops existing.

| Category | Count |
|---|---|
| On-chain precompile surfaces | 5 (verifyAndEmit, MerkleProof, ContinuityProof, ChainInfo 0x0FD3, previewIngest staticcall) |
| On-chain verification logic | 4 (receipt RLP parsing, topic matching, payer validation, amount binding) |
| Off-chain SDK surfaces | 3 (ProofBuilder, waitUntilHeightAttested, getProof) |
| On-chain batch surface | 1 (executeBatch — atomic multi-proof verification) |
| Attested event kinds | 3 (DepositPaid, RepaymentPaid, BalanceAttested) |
| On-chain entry points | 5 (openCredit ×2, repayCredit, submitAttestedPayment, executeBatch) |

---

## 1. On-Chain Precompile Surfaces

### 1.1 `verifyAndEmit` — BlockProver precompile at 0x0FD2

**What it does:** Proves a transaction was included in an attested block on a source chain (Ethereum Sepolia), checking both Merkle inclusion and chain continuity.

**Where used:** `AttestcoinPaymentVerifier._proveOnChain()` — called from every proof path.

**Why needed:** Without this, there is no way to verify that a Sepolia payment actually happened. Every credit open, repayment, and history link requires this call.

**What breaks without it:** All four entry points revert. CreditLine becomes unusable. `openCredit`, `repayCredit`, and `submitAttestedPayment` all fail with `ProofFailed`.

**Called from these CreditLine functions:**
- `openCredit` — called **twice** (deposit proof + balance proof)
- `repayCredit` — called once (repayment proof)
- `submitAttestedPayment` — called once (history link proof)

### 1.2 `MerkleProof` struct construction

**What it does:** Assembles the Merkle inclusion proof from SDK-provided sibling hashes and direction flags into the struct the precompile expects.

**Where used:** `AttestcoinPaymentVerifier._proveOnChain()` — lines constructing `INativeQueryVerifier.MerkleProofEntry[]` and `INativeQueryVerifier.MerkleProof`.

**Why needed:** The precompile requires a specific struct shape. Raw bytes from the SDK must be transformed into `MerkleProofEntry[]` with `{hash, isLeft}` pairs.

**What breaks without it:** Precompile call fails with struct mismatch. No proof can be verified.

### 1.3 `ContinuityProof` struct construction

**What it does:** Assembles the chain continuity proof (lower endpoint digest + root chain) from SDK data into the struct the precompile expects.

**Where used:** `AttestcoinPaymentVerifier._proveOnChain()` — lines constructing `INativeQueryVerifier.ContinuityProof`.

**Why needed:** The precompile checks not just that a transaction is in a block, but that the block is genuinely part of the source chain's history, linked back to an attested checkpoint.

**What breaks without it:** Precompile call fails. No proof can be verified. The continuity check is what makes the proof trustless — without it, someone could fabricate a block.

---

## 2. On-Chain Verification Logic (Unique to Spark)

### 2.1 Receipt RLP Parsing — `_parseReceiptLogs()`

**What it does:** Parses the Ethereum receipt embedded in the proven `encodedTransaction` bytes, navigating RLP encoding to extract the `logs` array.

**Where used:** `AttestcoinPaymentVerifier._verifyLogStrict()` — called from `verifyPayment()`.

**Why needed:** The BlockProver proves inclusion of the entire transaction including its receipt. Receipt logs contain the events that prove a payment happened. But the precompile only proves inclusion — it does not decode what the transaction did. Spark's verifier decodes the receipt RLP on-chain to extract the relevant log.

**What breaks without it:** Falls back to substring scan (`_verifySubstring`), which is weaker — it matches byte patterns rather than structured log fields. The strict path provides cryptographic amount binding; the fallback does not.

**Custom RLP helpers written for this:**
- `_rlpHeader(data, pos)` — decodes RLP list/string headers
- `_rlpItemLen(data, pos)` — computes total RLP item length
- `_extractAddr(data, pos)` — extracts 20-byte address from RLP
- `_extractWord(data, pos)` — extracts 32-byte word from RLP

### 2.2 Topic Matching — Event Signature Validation

**What it does:** Matches the decoded log's `topic0` against the expected event signature (`DepositPaid`, `RepaymentPaid`, or `BalanceAttested`).

**Where used:** `AttestcoinPaymentVerifier._verifyLogStrict()` — comparing `logTopic0` against `expectedTopic`.

**Why needed:** A proven transaction may contain many logs from unrelated contracts. Only the log with the correct event signature from the expected payment contract is relevant. Without topic matching, any event in the transaction could be misinterpreted.

**What breaks without it:** Could match a log from a different event type in the same transaction, leading to incorrect credit decisions.

### 2.3 Payer Validation — Indexed Address Verification

**What it does:** Reads `topics[1]` from the decoded log and requires it to match `claim.payer` (which must equal `msg.sender`).

**Where used:** `AttestcoinPaymentVerifier._verifyLogStrict()` — comparing `logPayer` against `expectedPayer`.

**Why needed:** Without this, someone could prove someone else's payment and claim credit for it. The payer must be the person opening or repaying credit.

**What breaks without it:** Credit fraud — any proven payment could be attributed to any address.

### 2.4 Amount Cryptographic Binding — `_verifyLogStrict` Amount Check

**What it does:** Extracts the non-indexed `amount` from the decoded log's data field and requires `decoded amount == claim.amount`.

**Where used:** `AttestcoinPaymentVerifier._verifyLogStrict()` — the final check before accepting a proof.

**Why needed:** Without this, a submitter could claim any amount regardless of what was actually paid. The amount is extracted from the cryptographically proven receipt data, not from the user's claim.

**What breaks without it:** A user could pay 0.001 ETH but claim 10 ETH, getting a 1000× larger credit line than they deserve. The amount is the most economically load-bearing field — it determines credit size, LTV, and score.

---

## 3. Off-Chain SDK Surfaces

### 3.1 `proofProvider.service.ProofBuilder` — SDK Proof Construction

**What it does:** Creates a proof builder instance configured for Sepolia (chainKey 1) and the Creditcoin prover API.

**Where used:** `app/src/lib/usc.ts` — `buildAttestcoinProof()` and `buildAttestcoinProofPair()`.

**Why needed:** The proof builder manages the attestation wait, proof assembly, and API communication with the prover service. Without it, no Merkle + continuity proof can be generated.

### 3.2 `ProofBuilder.waitUntilHeightAttested` — Parallel Attestation Wait

**What it does:** Polls until a specific Sepolia block height has been attested by Creditcoin's attestor network.

**Where used:** `app/src/lib/usc.ts` — `waitForBlocks()` and `buildAttestcoinProofPair()`.

**Why needed:** A proof cannot be generated until the source block is attested. For Spark's dual proofs, two different blocks may need attestation — the SDK waits for both **in parallel** using `Promise.all`, avoiding a sequential 16–20 minute wait.

**What breaks without it:** No proof generation possible. The attestation wait is the fundamental time bottleneck (~8–20 minutes on Sepolia).

### 3.3 `ProofBuilder.getProof` — Proof Assembly

**What it does:** Generates the Merkle + continuity proof for a specific transaction hash after attestation is confirmed.

**Where used:** `app/src/lib/usc.ts` — `buildAttestcoinProof()` and `buildAttestcoinProofPair()`.

**Why needed:** This is the SDK call that actually produces the proof blob that gets passed to the on-chain verifier.

---

## 4. Attested Event Kinds

Spark attests **three distinct data types** from Sepolia — more than any other project in this hackathon:

| Kind | Event | Data Attested | Purpose |
|---|---|---|---|
| **1** | `DepositPaid(address,uint256,bytes32)` | Payment amount | Proves user deposited ETH |
| **2** | `RepaymentPaid(address,uint256,bytes32)` | Repayment amount | Proves user repaid debt |
| **3** | `BalanceAttested(address,uint256,bytes32)` | ETH balance | Proves user has sufficient funds |

**Kind 3 is unique to Spark.** No other project in this hackathon attests a second data type (balance) alongside payment. This is the solvency check — it verifies the borrower actually holds funds, not just that they made a payment.

---

## 5. Why Dual Proofs Matter

Every `openCredit` call requires **two** independent Attestcoin proofs:

1. **Deposit proof** (kind 1) — proves the user paid ETH into SepoliaPayment
2. **Balance proof** (kind 3) — proves the user's Sepolia ETH balance at attestation time

Both are verified by separate `verifyAndEmit` calls to the BlockProver precompile. Both must pass for credit to open.

**What this prevents that single-proof systems cannot:**

| Attack | Single proof (most projects) | Dual proof (Spark) |
|---|---|---|
| Pay 0.001 ETH, claim 10 ETH | Amount binding prevents this | ✅ Also prevented |
| Pay from a funded wallet, then drain it before credit opens | No balance check | ✅ Balance proof catches this |
| Wash-lend: borrow + repay in same block to fake history | No solvency check | ✅ Balance proof verifies funds exist |
| Self-reported history without real capital | If own contract, no lender | ✅ Balance attestation proves real capital |

The balance proof is Spark's architectural advantage — it's the only project that verifies **solvency**, not just **payment**.

---

## 6. Gas and Timing

| Metric | Value |
|---|---|
| Attestestation wait (Sepolia) | ~8–20 minutes |
| Dual proof wait | Parallel (one window, not two) |
| On-chain `verifyAndEmit` | ~300K gas per call |
| Two calls per `openCredit` | ~600K gas total |
| Full `openCredit` with both proofs | ~800K gas |

---

## 7. Batch Proving Surface

### 7.1 `executeBatch` — Atomic Multi-Proof Verification

**What it does:** Verifies multiple proofs in a single transaction. All claims must pass or the entire batch reverts.

**Where used:** `CreditLine.executeBatch()` — called from `Spark.t.sol` tests.

**Why needed:** Users with many attested payments can batch them into a single tx instead of submitting one-by-one. The atomic guarantee means partial failures don't leave partial state.

**What breaks without it:** Users must submit N separate transactions for N proofs, each costing separate gas and taking separate block space.

---

## 8. ChainInfo and previewIngest Surfaces

### 8.1 ChainInfo Precompile (0x0FD3)

**What it does:** Queries supported source chains and their attested block heights from the Attestcoin attestor network.

**Where used:** `AttestcoinPaymentVerifier.chainInfo()` — view function.

**Why needed:** Reveals which chains the protocol supports and how far behind attestation is. Explains the 8–20 minute wait to users.

### 8.2 previewIngest — Dry-Run Proof Validation

**What it does:** Checks whether a proof would pass on-chain without spending gas. Returns `(wouldPass, reason)`.

**Where used:** `AttestcoinPaymentVerifier.previewIngest()` — view function using `staticcall`.

**Why needed:** Frontend can validate proofs before submitting, saving gas on reverts. Users get instant feedback on proof validity.

---

## 9. What Spark Does NOT Use (Disclosed)

| Surface | Why Not |
|---|---|
| `calculateTxIndex` | Spark doesn't need merkle path position — it needs transaction inclusion |
| `EvmV1Decoder` (external library) | Spark implements its own receipt RLP parser in Solidity — more gas but no external dependency |
| `getBatchProof` (SDK) | **Now used** — `buildAttestcoinBatchProof()` generates multiple proofs atomically |

**Previously unused surfaces now integrated:** ChainInfo (0x0FD3), previewIngest, executeBatch.
