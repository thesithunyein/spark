# Security findings

Spark was attacked during the build, not after it. This document records what was found, what was fixed, and what remains open. Nothing here is aspirational: every claim below is enforced by code and covered by tests.

## Finding 1: amount-binding bypass in `verifyPayment` (fixed)

**Severity:** critical in any mainnet deployment. The verifier would accept a proof for a payment of *any* amount, as long as the claimed amount's log could not be strictly decoded.

**Location:** `contracts/src/AttestcoinPaymentVerifier.sol`, `verifyPayment`

**The bug.** The strict path (`_verifyLogStrict`) decoded the proven transaction receipt and compared the decoded amount against `claim.amount`. On any strict-path failure, execution fell through to `_verifySubstring`, which only checked that the contract address, the event topic and the payer appeared as substrings of the proven bytes. Those three appear in *any* genuine receipt from that contract, so on the fallback path **the amount was never enforced at all**.

**Consequence.** A borrower could pay 0.001 ETH, claim 10 ETH, and the proof would pass and open credit. The headline claim "the amount is cryptographically bound" was not true on-chain. This is precisely the wash-lending surface the protocol exists to remove: pay little, claim much, farm a credit score.

**Root causes.** Three defects in the hand-written RLP parser, all of which pushed real receipts onto the weak path:

1. single-byte RLP items were measured with the wrong length;
2. long-form length prefixes (`0xb8` / `0xf8` and above) computed the length-of-length byte as 0 instead of 1;
3. indexed-address topics (`topics[1]`, the payer) were extracted from the wrong offset.

Because of (1) to (3), a real Ethereum receipt almost never parsed. A 256-byte `logsBloom` forces long-form encoding, so production proofs took the substring fallback and the amount went unchecked. The strict path had never run against a real-shaped receipt, and no test exercised it.

**The fix.**

- The strict path is now **mandatory** once a receipt parses. It reverts on a missing matching log, on a wrong payer, and on an amount mismatch. There is no fall-through to the substring path for a parseable receipt.
- The substring fallback is retained only for receipts that cannot be decoded at all (legacy and mock encodings), and is documented as such. It binds contract, topic and payer. It never binds amount.
- All three RLP parser defects are corrected.

**Tests added: `contracts/test/VerifierStrict.t.sol`**

These are the first tests in the project to exercise the real `AttestcoinPaymentVerifier` rather than the mock. Each builds a crafted RLP receipt.

| Test | What it proves |
|---|---|
| `testStrictPathParsesReceiptLogs` | a real-shaped receipt decodes into logs |
| `testStrictPathAcceptsMatchingAmount` | decoded amount equal to the claim succeeds |
| `testStrictPathRevertsOnAmountMismatch` | a 0.001 ETH payment claimed as 10 ETH **reverts** |
| `testStrictPathRejectsWrongPayer` | a `topics[1]` payer mismatch reverts |
| `testStrictPathParsesLongFormBloom` | a 256-byte bloom (long-form RLP) parses correctly |
| `testStrictPathMultipleLogsFindsCorrectOne` | the correct event is selected from several logs |

## Finding 2: ChainInfo interface used the wrong selectors (fixed)

`IChainInfo` declared camelCase method names. The 0x0FD3 precompile on CC3 uses **snake_case** selectors: `get_supported_chains` and `get_latest_attestation_height_and_hash`. With the wrong selectors the calls returned "Unknown selector", which had been recorded as an unexplained protocol observation. The interface was corrected and verified live on CC3:

```text
get_supported_chains() -> chainKey 1 (Sepolia), chainKey 3 (Ethereum mainnet)
```

So Ethereum mainnet is attested on CC3 and addressable by any Creditcoin contract. `get_latest_attestation_height_and_hash` also explains the attestation lag described in the AMA.

## Test coverage

| | Before | After |
|---|---|---|
| Contract tests | 300 | **306** |
| Tests exercising the real verifier | 0 | **6** |
| Live forged-proof rejections against the real precompile | 8 | 8 |

## Known limits

- **Testnet only.** No mainnet value should be sent to these contracts.
- **Sepolia is what the product proves.** Mainnet attestation is *possible* (chainKey 3 is attested and ChainInfo reports it) and is **not implemented** in the product. The `/bonus` page is a UI mock, not a proof.
- **The substring fallback still exists** for receipts that cannot be decoded. It binds contract, topic and payer, never amount.
- **Single-emitter trust.** A proof shows that contract `Y` emitted an event. It does not prove that `Y` is an honest counterparty. A borrower paying a contract they control produces a genuine proof of a real transfer with no real counterparty. The balance proof (kind 3) mitigates this for capital that is actually present, but it does not eliminate it for the borrower's own funds.
- **Not audited.** See [SECURITY.md](SECURITY.md).
