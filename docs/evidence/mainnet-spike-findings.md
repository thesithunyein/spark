# Mainnet spike findings (Day 1)

Feasibility work for extending Spark from Sepolia to Ethereum mainnet as a proven
source chain. Everything below was run against live mainnet and live CC3, and is
reproducible with the two scripts in `app/scripts/`.

## Spike 1: a real mainnet transaction can be proven

Script: `app/scripts/spike-mainnet.mjs`
Evidence: `docs/evidence/mainnet-spike-proof.json`

| Field | Value |
|---|---|
| Prover | `https://proof-gen-api.cc3-testnet.creditcoin.network` |
| chainKey | **3 (Ethereum mainnet)** |
| Source tx | `0x46efa06823d4b99d2d22223fd97f24438bb9c9e2d152034426a5d2adc6d5c2c3` |
| Source block | 25,969,869 |
| Event | Aave V3 `Repay`, reserve WBTC, third-party wallet `0xb05c9ca8...3180` |
| Merkle root | `0x68ff8aba95df681780cd9e0457a59ace8b6882bcaee8dee8248e6cc99f97c4a3` |
| Merkle siblings | 8 |
| Continuity roots | 32 |
| Proven payload | 3,232 bytes |
| Attestation wait | **6.4 seconds** (block already attested) |

Findings:

1. **Ethereum mainnet is a supported source chain.** Confirmed by the returned
   payload, not by documentation alone.
2. **Historical mainnet proofs are effectively instant.** 6.4 s versus the 8 to
   20 minute waits the Sepolia flow expects, because the source block is already
   attested. A mainnet ingestion worker can batch without long waits.
3. **Proving existing mainnet transactions costs nothing.** No funds, no gas, no
   faucet spend. The capital constraint on mainnet data does not exist.

## Spike 2: facts are extractable and bound

Script: `app/scripts/spike-position.mjs`

The proven payload was checked field by field against the real mainnet receipt:

| Assertion | Result |
|---|---|
| `Repay` topic0 present in proven payload | PASS |
| Aave V3 Pool emitter present | PASS |
| reserve (topic1) present | PASS |
| user (topic2) present | PASS |
| repayer (topic3) present | PASS |
| amount data word present | PASS |

So the exact emitter, payer and amount are recoverable from proven bytes, and the
amount is bound rather than trusted from the claim.

## Correction found by running it

**The proven payload is not canonical Ethereum RLP.** It is Attestcoin's own
word-aligned EvmV1 layout: transaction fields, signature, then the receipt with
logs, packed as 32-byte words (101 words here). `ethers.decodeRlp` rejects it,
because it is not a single RLP item.

Consequence for the plan: fact extraction must follow the official decoder
semantics (`EvmV1Decoder`, mainnet decoder `0x9D094C9f22B10FCf842c2fC6A0981630A4F94B5C`,
CC3 testnet decoder `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f`) or replicate that
layout. Any design that assumed canonical receipts would have needed rework, which
is exactly what this spike was for.

## Open problem: position drift

The target wallet's real position, read live from the Aave V3 Pool:

| Field | Value |
|---|---|
| Collateral (base) | 116,353 USD |
| Debt (base) | 54,228 USD |
| LTV | 78% |
| Health factor | 1.748 |

Rebuilding those numbers from events alone (Supply minus Withdraw, Borrow minus
Repay) only works if interest is accounted for, because aTokens rebase
continuously and interest accrues into the token balance rather than as a discrete
event.

Measuring the gap requires **the complete event history for a wallet**, which
public RPC `eth_getLogs` block ranges cannot return reliably.

**Day 2 task 1 is therefore an indexer, not a contract.** Proof of Net Position
cannot be claimed until that drift is measured and either bounded and disclosed,
or eliminated by tracking aToken `Transfer` events.

## What Day 1 changed

- Removed the biggest unknown: mainnet proving works from this repo, for free, fast.
- Corrected one architectural assumption (payload encoding) before any contract work.
- Identified the first real Day-2 task (indexer) rather than discovering it late.
- Did **not** produce a competitive advantage on its own: the leading entries
  already operate on mainnet data. This is the prerequisite, not the win.
