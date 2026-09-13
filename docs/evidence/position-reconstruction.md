# Day 2: Reconstructing an Aave position from logs

**Question.** Can a borrower's cross-protocol position be rebuilt from proven events
alone? This is the load-bearing question for the Proof of Net Position design: if
event sums do not reproduce reality, the primitive is not sound and the plan changes.

**Answer.** Not from Aave's own events. Yes from the token's own ERC20 `Transfer`
ledger, with rebasing interest left as a bounded residual. Both halves are measured
below on live Ethereum mainnet state.

---

## Test 1: naive reconstruction on a real borrower is wrong by 66%

Wallet `0xb05c9ca8123b6ba84c767c4ee8f9ae66b0733180`, a real third-party Aave V3
borrower (EOA, nonce 713). Supplies and withdrawals indexed from `Aave V3 Pool` events.

| measure | value |
|---|---|
| Σ Supply (WETH) | 97.389029 |
| Σ Withdraw (WETH) | **0** |
| naive net supplied | 97.389029 |
| real aWETH `balanceOf` | 32.324944 |
| drift | **−65.064086 (−66.81%)** |

The wallet never withdrew, yet holds less than a third of what its Supply events
record. The missing 65 WETH did not burn or leave through the pool. aTokens are
ordinary ERC20s, so the position moved by a plain `Transfer` that emits **no Aave
event at all**. Any engine summing `Supply − Withdraw` inherits this error silently,
and it grows with every wallet-to-wallet aToken move.

Raw output: `position-drift.json`. Reproduce: `node scripts/aave-indexer.mjs`.

**Disclosure.** In that run the `Repay` query was rate-limited, so the *debt* columns
in `position-drift.json` are incomplete and must not be quoted. The WETH supply row
above is unaffected, because that wallet carried no WETH debt. Treat the debt rows as
proof of the rate-limit problem, not as measurements.

---

## Test 2: the ledger reconstructs the position exactly

The replacement primitive, on wallet `0x76f30e3f75437fb862b8d2c4d80a671bceba5b1a`:

```
ledger = Σ Transfer(to = wallet) − Σ Transfer(from = wallet)
```

on the reserve's aToken, over the wallet's complete history. "Complete" is not
assumed. The start block is **provably zero**: the most recent block `B` where
`balanceOf` returns 0, read from archive state via `eth_call` at a historical block
tag. If the balance was zero at `B`, every earlier action had already netted to zero
and cannot contribute to today's position, so coverage of `[B, latest]` is complete
by construction. A wrong anchor fails the assertion below, loudly.

| measure | value |
|---|---|
| zero anchor block | 25,592,380 |
| blocks covered | 378,062 (38 chunks) |
| Aave events | 4,606 Supply, 4,909 Withdraw |
| token transfers | 8,508 |
| real aWETH `balanceOf` | **3 wei** |
| ledger (transfers) | **3 wei** — exact match |
| naive (Aave events) | 5,113 wei — off by 5,110 |
| wallet-to-wallet moves | in 0, out 0 |

**This is the decisive comparison.** The ledger reproduces the balance to the wei.
The Aave-event sum does not, and the gap is *not* explained by token transfers,
because there were none.

Raw output: `ledger-drift-window.json`.
Reproduce: `WALLET=0x76f30e3f75437fb862b8d2c4d80a671bceba5b1a node scripts/aave-drift-window.mjs`

**Honest limit on this test.** That wallet is a high-throughput contract (nonce 1),
not a personal borrower, and its closing balance is 3 wei. It establishes the
*mechanism* rigorously, because the anchor is provable and the match is exact. The
*large* position with a large error is Test 1. Neither test alone is complete; taken
together they settle the question.

---

## Finding: burns are not 1:1 with `Withdraw`

Test 2's 5,110 wei gap had zero token transfers behind it, so the difference must be
in the mint/burn half of the naive sum. Two Aave paths reduce aToken balance and
emit **no `Withdraw` event**:

- **liquidation**, which burns collateral
- **`repayWithATokens`**, which burns the borrower's aTokens to settle debt and emits
  `Repay`, not `Withdraw`

So `Σ Supply − Σ Withdraw` is unreliable even for pure mints and burns, not only for
plain transfers. There are therefore **two independent** reasons to reject naive
reconstruction, and the second one is easy to miss because it looks like a rounding
error.

---

## Finding: free infrastructure cannot serve this, and that is a real constraint

Both historical `eth_getLogs` and historical `eth_call` are required. Measured on
Ethereum mainnet, this date:

| endpoint | historical logs | historical state |
|---|---|---|
| `rpc.mevblocker.io` | yes, ≤10,000 blocks and ≤10,000 results | **yes** |
| `ethereum-rpc.publicnode.com` | no, requires a paid token | — |
| `eth.drpc.org` | 10,000 blocks, then throttles hard | — |
| `1rpc.io/eth` | 0–50 block ranges only | — |
| `eth-mainnet.public.blastapi.io` | ~10 block ranges | — |
| `eth.merkle.io` | no `eth_getLogs` | — |
| `eth.blockscout.com` | works, then rate-limits sustained use | — |

A full-history position engine over a borrower's whole Aave lifetime spans roughly
9.7M blocks. At 10,000 blocks per call that is about 970 calls **per token per
direction**, so production indexing needs a paid archive provider or a self-hosted
indexer. This is a design input, not an obstacle to route around.

---

## Consequence for the design

1. **Index the token `Transfer` ledger, not Aave events.** Per reserve, per token
   (aToken and debt token), both directions: mints, burns, and wallet-to-wallet moves.
2. **Anchor coverage at a proven-zero balance**, read from state, rather than trusting
   a quiet gap in activity. Sparse activity makes quiet gaps meaningless — the first
   attempt at this script did exactly that and mis-measured a wallet by 51% before the
   anchor was introduced.
3. **Interest cannot come from events.** It accrues continuously into a rebasing
   index. Either bound it explicitly and disclose the error, or cover it with a proven
   *state* value. This is the strongest argument for the architecture Spark should
   adopt: **event proofs for history, state proofs for current position.**
4. **Assert, do not assume.** The final check is `ledgerDelta == balanceOfNow`. An
   engine that cannot state that assertion in its own tests is not reconstructing a
   position, it is estimating one.

---

## Reproduce

```bash
cd app
node scripts/aave-indexer.mjs                     # Test 1 method (explorer-based)
WALLET=0x76f30e... node scripts/aave-drift-window.mjs   # Test 2, anchored
```

Both are read-only: no keys, no gas, no transactions.
