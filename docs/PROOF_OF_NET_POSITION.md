# Proof of Net Position

Turning a verified cross-chain payment history into a **verified cross-chain net worth**.

This document describes work that is built and measured, on top of Spark's existing
dual-proof credit flow. Every number here comes from a script in this repo that anyone
can re-run, and every claim that is *not* yet verified is labelled as such.

---

## The thesis

Spark already proves two things about a borrower on Sepolia: that they paid, and that
they hold a balance. Both are **event** facts. A credit decision wants a **position**
fact, and those are not the same thing:

> A payment history describes what someone *did*. A net position describes what
> someone *is worth*, net of what they owe, right now.

Net position is the strictly stronger primitive because it cannot be farmed. A history
score can be inflated by borrowing and repaying your own money repeatedly. A current
net worth cannot: you either hold the assets or you do not.

The hard part is not the idea, it is that no oracle is allowed to assert any of it. So
the whole pipeline is built from proven mainnet facts.

---

## What is built

Five contracts in `contracts/src/`, on top of the existing credit contracts:

| Contract | Role |
|---|---|
| `MainnetPositionRegistry.sol` | Reconstructs a per-account, per-token position from an attested **token ledger**, anchored at a **proven-zero** balance. |
| `AttestedPriceFeed.sol` | Stores BlockProver-verified Chainlink `AnswerUpdated` values. No price operator. |
| `MainnetTokenRegistry.sol` | Attested mainnet token metadata: decimals, protocol, and whether holding it is an asset or a liability. |
| `PositionValuer.sol` | Composes the three above into signed USD net worth, in Aave's 8-decimal base units. |
| `MainnetTopics.sol` | Every mainnet event topic the engine relies on, with its verification status recorded. |

Plus four read-only scripts in `app/scripts/` that produce the measurements below.

---

## The two findings that shaped the design

### 1. Aave's own events cannot reconstruct a position

Measured on a real mainnet borrower (`docs/evidence/position-reconstruction.md`):

| measure | value |
|---|---|
| Σ Supply (WETH) | 97.389029 |
| Σ Withdraw (WETH) | **0** |
| real aWETH balance | 32.324944 |
| error | **−66.81%** |

A wallet with **zero withdrawals** holding a third of its recorded deposits. aTokens
are ordinary ERC20s, so a position moves by a `Transfer` that emits no Aave event at
all. A second, subtler failure exists too: liquidations and `repayWithATokens` burn
aTokens while emitting no `Withdraw`, so even the mint/burn half of the sum drifts.

**Consequence:** the engine indexes the token's own `Transfer` ledger — mints, burns,
and peer-to-peer moves — and never protocol-specific events.

### 2. Interest cannot come from events at all

aToken balances rebase continuously. Across 40 real wallets with positions from 2 wei to 13,005 aWETH
(`docs/evidence/position-scale.json`):

| | |
|---|---|
| wallets reconstructed | **40** |
| ledger matched **exactly** | 1/40 |
| ledger within 10 bps | **38 of 38** measurable (2 excluded as sub-dust) |
| largest residual | **4.36 bps** |
| median residual | 1.98 bps |
| had peer-to-peer movement | 7/40 (**288 to 1,715 aWETH**) |

So the ledger does not reproduce a live balance to the wei — it understates it by a
sub-basis-point residual that is interest. That is not a bug to hide, it is a quantity
to bound.

**The dust finding, which only the larger sample produced.** One of the 40 wallets holds
2 wei of aEthWETH and its ledger nets to 2 wei, so a one-wei difference printed as
-5000 bps and briefly *became* the largest-residual headline. A percentage against a
two-wei denominator is an artifact rather than a measurement, so `position-scale.mjs` now
applies a dust floor of 1e14 wei and counts excluded wallets explicitly instead of dropping
them. The raw `balance`, `ledgerNet` and `residual` fields in the evidence file are
unchanged, so the underlying measurement is intact; only the derived percentage statistics
were recomputed, and the file records that recomputation. Scaling the sample from eight to
forty is what surfaced this, which is the argument for a corpus over an anecdote. `MainnetPositionRegistry` therefore refuses to advance a position except
against an **attested state balance**, records the gap as an explicit
`interestResidual`, and **reverts** if that gap exceeds a configured cap, because a
large residual means the ledger is missing history rather than that interest is huge.

And one wallet in eight had 288 aWETH of peer-to-peer movement, which no event-only
reconstruction could have captured. That is the finding, in one number.

---

## Architecture: event proofs for history, state proofs for current position

```
   Ethereum mainnet                      Creditcoin
   ─────────────────                     ───────────────────────────────────────
   token Transfer logs  ──┐
                          ├─ BlockProver ─► MainnetPositionRegistry
   attested state balance ┘   (0x0FD2)      ├── ledgerNet        (from transfers)
                                            ├── interestResidual (from state, capped)
                                            └── netPosition      = ledgerNet + residual
   Chainlink AnswerUpdated ──────────────► AttestedPriceFeed ──┐
   attested token decimals ──────────────► MainnetTokenRegistry┤
                                                               ▼
                                                        PositionValuer
                                                        └── netWorthUsd (signed, 8dp)
```

Three rules make this sound rather than merely plausible:

1. **A ledger sum needs an anchor.** `setZeroAnchor` fixes the start at a block where
   the balance is *attested zero*, so coverage forward is complete by construction:
   anything earlier had already netted to zero. Rows at or below the anchor are
   **rejected**, not ignored, so a gap in the feed fails loudly.
2. **Interest must be proven, not assumed.** No function fabricates interest from a
   timestamp or a rate. The only path that moves a position ahead of the ledger is an
   attested balance, and the residual is capped.
3. **Liabilities subtract.** A debt token is registered as a liability and contributes
   negatively, so the output is what the borrower is worth, not what they hold. A
   negative result is returned, never clamped.

---

## Protocol-surface findings (measured, not assumed)

**Chainlink: attest the aggregator, never the proxy.** The ETH/USD proxy
`0x5f4eC3Df…8419` emitted **zero logs in 300 blocks**; its aggregator
`0x7d4E7420…6Fb5` emitted **36** `AnswerUpdated` logs in 10,000. The proxy is the
address everyone knows, so an implementation that attests it proves no price while
appearing to succeed. A proxy phase change can also swap the aggregator, so whichever
aggregator was live at the source block must be the one attested.

**Topic hashes are silent when wrong.** A wrong topic0 returns an empty list, not an
error — an indexer reporting "no activity" with full confidence. During development a
`Repay` topic was used while labelled `Supply`, and only a live probe caught it.
`scripts/protocol-topics.mjs` therefore checks every declared topic against real
mainnet logs and pairs each with a **negative control that must return zero**:

| topic | contract | logs in window | status |
|---|---|---|---|
| Aave v3 Supply | Pool | 1,845 | CONFIRMED |
| Aave v3 Withdraw | Pool | 1,925 | CONFIRMED |
| Aave v3 Borrow | Pool | 1,197 | CONFIRMED |
| Aave v3 Repay | Pool | 953 | CONFIRMED |
| ERC20 Transfer | aEthWETH | 2,486 | CONFIRMED |
| Chainlink AnswerUpdated | aggregator | 36 | CONFIRMED |
| Comet Supply / Withdraw | cWETHv3 | 9 / 1 | CONFIRMED (thin) |
| Morpho SupplyCollateral | Morpho Blue | 320 | CONFIRMED |
| Morpho WithdrawCollateral | Morpho Blue | 0 | **UNVERIFIED** |

Negative controls, all returning zero: a wrong Supply shape, a wrong `AnswerUpdated`
arity, and `AnswerUpdated` against the proxy.

**Free infrastructure cannot run this.** Full-history indexing needs both historical
`eth_getLogs` and historical `eth_call`. Measured: `publicnode` refuses historical logs
outright, `drpc` throttles hard, `1rpc` allows 50-block ranges, `blastapi` ~10, merkle
has no `getLogs`, Blockscout rate-limits sustained use. `mevblocker` was the only free
endpoint found serving both, at 10,000 blocks per call — roughly 970 calls per token
per direction for one borrower's full Aave lifetime. A production engine needs paid
archive access.

---

## Honest limits

- **Not yet broadcast to CC3.** The stack does deploy and prove a real mainnet position
  in one command (`contracts/script/ProveMainnetPosition.s.sol`), and that command was
  **executed end to end against a local chain: 10 transactions**, after which independent
  reads of the deployed contracts returned the real mainnet values. Full transcript:
  `docs/evidence/position-stack-e2e.txt`. What has *not* happened is the CC3 broadcast,
  because this workspace contains no funded deployer key. That step is one command away
  and is the deployer's to run; until it runs, treat the on-chain proof as
  locally-executed rather than testnet-live.
- **The scale sample is aETHWETH only**, 40 wallets, and it selects recent depositors.
  Other reserves, other protocols, and long-lived positions are not covered.
- **64 candidates were skipped for having no provable-zero anchor and 23 for a zero
  balance** within the 300,000-block search budget. Skipped is reported, not dropped, but
  it is a coverage limit rather than a clean sample: the 40 reconstructed wallets are the
  slice of the candidate pool that happens to hold a recent zero balance, which correlates
  with recent depositors rather than sampling Aave depositors at random.
- **`MORPHO_WITHDRAW_COLLATERAL` is unverified** — zero logs in the window.
- **The exponent guard in `PositionValuer` is defensive and currently unreachable**,
  given the registries cap decimals at 18. It is not covered by a test because no
  registered input can reach it.
- **The attestor is trusted to submit already-verified values.** The registry enforces
  accounting invariants, ordering, replay protection and bounds; it does not itself
  call the precompile. That wiring is the next step and is not implied to exist.
- **No credit policy is set here.** LTV against a net position is a separate decision,
  deliberately not made in these contracts.

---

## Deploy and prove in one command

`script/ProveMainnetPosition.s.sol` performs the whole flow as separate transactions:
deploy the four contracts, register aEthWETH as an attested asset, anchor at a
provably-zero balance, ingest the real token ledger, reconcile against the real attested
balance, submit the real Chainlink answer, and read back the net worth.

```bash
# Against a local chain (what was executed and recorded here):
cd contracts
PRIVATE_KEY=<any funded dev key> forge script \
  script/ProveMainnetPosition.s.sol:ProveMainnetPosition \
  --rpc-url http://127.0.0.1:8545 --broadcast

# Against CC3 testnet: the command above DOES NOT WORK. CC3 block headers omit mixHash, so
# Foundry 1.7.1 fails the fork with
#   Error: EVM error; header validation error: `prevrandao` not set
# For CC3 use the forge create + cast send equivalent, which runs:
#   cd contracts && DRY_RUN=0 bash script/deploy-position-cc3.sh
# Verified end to end against a local chain on 2026-09-14: 5 deploys, 5 calls, decoded
# read-backs, exit 0. Details and the warning: DEPLOY_CC3.md.
```

Measured on the local run: **3,572,773 gas used** across 10 transactions, and the deployed
contracts read back `netPosition = 433033874843288486772`,
`valueUsd8 = 108638243749398` ($1,086,382), and a credit limit of `21727648749879`
($217,276) at a 20% policy LTV, matching the off-chain computation exactly.

An earlier revision of this document said 7 transactions and 3,782,968 gas. Both were
wrong: the broadcast artifact lists 10 transactions (5 deploys plus register, anchor, ledger,
reconcile and price), and 3,572,773 is their measured `gasUsed` sum. An even earlier revision
stamped the attested balance with block 25,970,424, which is the ledger's last row block;
archive reads show the balance equals `ATTESTED_BALANCE` at block 25,970,521, and the
constant has been corrected. That mismatch was found by re-reading the chain, so it is worth
stating plainly: the numbers in this repo are checked against the chain, not against each
other.

## Reproduce

```bash
cd contracts && forge test                    # 518 tests, 0 failures (417 of them the submitted suite)

cd ../app
node scripts/protocol-topics.mjs              # topic parity + negative controls
WALLET=0x76f30e3f75437fb862b8d2c4d80a671bceba5b1a node scripts/aave-drift-window.mjs
TARGET=40 DISCOVERY_CHUNKS=8 node scripts/position-scale.mjs  # 40 wallets, reconciliation stats
```

And the end-to-end execution transcript, with the independent on-chain reads and the
mainnet re-verification of every input, is committed at
`docs/evidence/position-stack-e2e.txt`.

All read-only: no keys, no gas, no transactions.
