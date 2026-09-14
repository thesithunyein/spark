# Why Creditcoin, and who this is actually for

> **Written after the BUIDL CTC 2026 Fall submission deadline.** This is positioning and
> analysis of work that already exists in this repository. It adds no capability and
> claims none. Where it describes something not yet live, it says so.

Two questions a judge is entitled to ask about any entry: *why does this need this chain*,
and *who is this for*. This document answers both, and it is written so every factual
claim in it can be checked without trusting this file.

---

## 1. The underwriting inputs live on other chains

Credit is a decision made from facts. For the borrower Spark targets, the facts that
decide the loan are:

| Fact | Where it lives |
|---|---|
| The borrower repaid | Sepolia receipt |
| The borrower holds funds | Ethereum mainnet `balanceOf` |
| The borrower's position is real | Ethereum mainnet token `Transfer` ledger |
| That position is worth something | Chainlink answer on mainnet |

Every one of them is **off Creditcoin**. So the only question that matters is how they
arrive.

There are three ways to get a foreign fact onto a chain, and Spark's thesis is that two of
them are the reason cross-chain credit has not worked:

- **An oracle.** A third party asserts the fact. It can be wrong, censored, or offline, and
  the contract has no way to tell. This is the model almost every cross-chain lending
  product uses.
- **A bridge.** Move the asset instead of the fact. Bridges have been drained repeatedly,
  and the failure is total.
- **An attestation of the source chain's own blocks.** Creditcoin's Attestcoin Protocol
  attests the source chain's block headers and transactions. The fact is not asserted;
  the *source chain's own record* is proven, and the contract reads the fact out of it.

Spark is built on the third. `AttestcoinPaymentVerifier` calls `verifyAndEmit` on the
BlockProver precompile at `0x0FD2`, which proves transaction inclusion and chain
continuity, and then decodes the **proven receipt's** RLP on-chain to bind the payer and
the amount. The amount is not read from a claim; a decoded amount that disagrees with the
claim reverts (`contracts/src/AttestcoinPaymentVerifier.sol`, `_parseReceiptLogs`).

### Why this is not a generic "use the chain" argument

The distinction is checkable. A design that reads a foreign fact from an oracle will have
some address the contract trusts. Spark's verifier trusts a **precompile** — an EVM
address provided by the protocol, not an operator — to decide whether a source-chain
transaction is included. Remove the attestation and the payment check cannot be performed
at all, because Creditcoin has no other route to a Sepolia receipt. The dependency is
structural, not decorative.

That is also what the brief names as the core criterion: *"Depth of Attestcoin Protocol
utilization will be evaluated as one of the core scoring criteria."* Spark's integration
is documented surface by surface in `docs/ATTESTCOIN_SURFACE.md`, including what breaks
without each one.

---

## 2. What it puts on Creditcoin

Attested data that is only read is a demo. Spark's is consumed, and the consumption is
denominated on Creditcoin:

- **Credit is issued on Creditcoin** as `sCREDIT` (`contracts/src/SparkCredit.sol`), minted
  by the `CreditLine` against a verified proof. The asset exists here and nowhere else.
- **Credit is sized on Creditcoin** from proven inputs. `PositionSizedCredit` derives a
  limit from a proven net worth, and the credit score (`650 base + 40 per linked payment`,
  capped at 850) is computed in the EVM, not submitted.
- **The record is on Creditcoin.** Repayment history is an attested fact on this chain,
  which is what makes it portable rather than self-reported.

So the flow pushes demand in one direction: facts from Sepolia and mainnet come in, and
credit denominated on Creditcoin goes out. A chain that underwrites from external facts
attracts exactly the applications whose inputs are external — which is most of real
lending, and almost none of what currently happens on-chain.

### The honest gap in this section

`MainnetPositionRegistry`'s own header states it plainly: a single `attestor` submits rows
that are *already* verified by the BlockProver, and the registry enforces the accounting
invariants without re-verifying proofs itself. Wiring the registry to call the precompile
directly is the next step and is called out as such in the source rather than implied. The
**deployed credit flow** (`AttestcoinPaymentVerifier` → `CreditLine`) does call the
precompile directly, twice per credit open, and has produced real transactions on both
testnets. Do not read the section above as claiming the position stack is equally trustless
today; it is not yet, and the contract says so.

---

## 3. The borrow is a proof of solvency, and that has a policy implication

Every `openCredit` requires **two independent `verifyAndEmit` calls** — one for the
payment, one for the balance (kind 3, `BalanceAttested`). The second is a solvency check:
the wallet must hold funds at the moment of the decision.

This matters for a reason beyond correctness. **A payment history is farmable.** A borrower
can open and repay their own loan repeatedly and manufacture a perfect record — the
problem statement lists exactly this. A **current balance cannot be farmed**: it is a
state, not a history, and it cannot be bought with a transaction that nets to zero. So
Spark's underwriting input is resistant to the specific attack that makes self-reported
credit worthless.

**State that honestly:** the deployed generation sizes the line as `deposit × factor`,
where the factor is *selected* by proven wealth (90% at balance ≥ 2× deposit, 85% at ≥ 1×,
80% otherwise) and raised by verified history (+250 bps at 1+ payments, +500 bps at 3+,
capped at 9500 bps). So the deployed model is **bridgeless cross-chain liquidity with a
proven-wealth gate** — it removes the bridge, and it also removes the borrower with no
deposit. The answer to that is built and tested but not broadcast:
`openCreditFromBalance` sizes from the attested balance alone and needs no deposit, and
`PositionSizedCredit` sizes from proven mainnet net worth. Both require a redeploy to go
live. This is the most important thing a reader of this document should not be told
otherwise about.

---

## 4. The beachhead, named

Not "2.5 billion unbanked." That sentence is the most discounted line in DeFi, and — more
importantly — **the deployed contract does not serve that borrower**, because it requires
a Sepolia deposit. Naming them would be a claim the code contradicts.

The borrower the built system actually serves:

> **A DeFi borrower who already holds a verifiable position on Ethereum mainnet, and needs
> liquidity on Creditcoin without selling the position or bridging it.**

Why this is the right first customer, and not a compromise:

- **Their facts already exist on-chain, verifiably.** No bureau, no paperwork, no
  off-chain attestation of identity. The underwriting input is the thing that makes
  oracles necessary today, which is the problem being solved.
- **Their alternative today is bad and specific.** Sell the position and realise the gain,
  or bridge it and accept bridge risk — both named failure modes. This is a concrete,
  articulable pain, not an abstract lack of access.
- **It is measurable.** `PositionValuer` reconstructs the position from the token
  `Transfer` ledger and totals it against an attested price. On a sample of real wallets
  the reconstruction reconciled within **0.51 bps across 8/8**, where the obvious method —
  summing Aave's own protocol events — was wrong by up to **66.8% on a single position**,
  because aTokens are transferable and a wallet-to-wallet move emits no Aave event. Method
  and measurements: `docs/PROOF_OF_NET_POSITION.md`.

The unbanked borrower is the *destination*, and it is reachable from here — but it is
reachable through the deposit-free path that is built and not yet deployed, not through the
one that is live. Ordering matters, and the roadmap in `docs/ROADMAP.md` orders it that
way.

---

## 5. What a reviewer can check, without trusting this document

| Claim | Check |
|---|---|
| Verifier calls the BlockProver precompile twice per open | `contracts/src/AttestcoinPaymentVerifier.sol`; `docs/ATTESTCOIN_SURFACE.md` |
| Amount is bound to the proven receipt and reverts on mismatch | `_parseReceiptLogs`; 6 strict-path tests in `contracts/test/Spark.t.sol` |
| 15 Attestcoin surfaces, split 10 critical / 5 integrated | `docs/ATTESTCOIN_SURFACE.md` |
| Position reconstruction beats protocol-event summing | `docs/PROOF_OF_NET_POSITION.md`, `docs/evidence/position-*.json` |
| Every on-chain event, publicly, no wallet | <https://spark.sithunyein.com/onchain> |
| The deployed model sizes from the deposit | `contracts/src/CreditLine.sol`; README, credit-sizing section |
| The position stack uses one attestor, not direct precompile calls | header comment of `MainnetPositionRegistry.sol` |
| 417 tests pass | `cd contracts && forge test` |

The last four rows are the uncomfortable ones. They are included because a reviewer will
find them anyway, and a claim you can check is worth more than one you cannot.
