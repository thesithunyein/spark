# Deploying to CC3

Two deploys live here, and they are independent:

| | What it ships | Blocker |
|---|---|---|
| **1. The position stack** | Four contracts that size a credit limit from a proven Ethereum mainnet net worth | the key |
| **2. Generation 2 of `CreditLine`** | The path that sizes a line from an attested balance with **no deposit** | the key, plus a decision covered under [generation 1 stays visible](#generation-1-stays-visible) |

The only input for either is a private key, and it belongs in a file, not in a shell history or
a chat window. **Do the position stack first** — it is additive and touches nothing that is
already live. Generation 2 replaces a live contract, so read that section's consequences
before running it.

---

> ### ⚠️ Read this first: `forge script` cannot run against CC3
>
> **Verified 2026-09-14.** CC3 block headers omit `mixHash` (prevRandao), and Foundry 1.7.1
> validates that field when it forks a chain for a script run. Every `forge script`
> invocation against CC3 therefore fails before it reaches the broadcast:
>
> ```
> Error: Failed to deploy script:
> EVM error; header validation error: `prevrandao` not set
> ```
>
> This is not specific to Spark's scripts — a read-only script fails identically. It also
> means the commands previously written in this document and in `PROOF_OF_NET_POSITION.md`
> **have never been executed against CC3**, which the broadcast records confirm: every
> `broadcast/*/run-latest.json` in this repo is chain **31337**, the local rehearsal chain.
> The deployed contracts on CC3 were placed with `forge create`, which does not fork and so
> does not hit the problem.
>
> Confirmed against both public CC3 RPCs
> (`rpc.cc3-testnet.creditcoin.network` and `creditcoin-testnet.rpc.thirdweb.com`); neither
> returns `mixHash`, so this is a property of Creditcoin's headers rather than one node.
>
> **Consequence:** part 2 below works as a single `forge create` and is verified. Part 1 is
> a five-contract deploy followed by eight state-changing calls, which `forge create` cannot
> express on its own, so it needs to be run as `forge create` per contract plus `cast send`
> per step. That rewrite is described below and is **not yet executed**.

---

## Part 1 — the position stack

Five contract deploys plus eight calls. See the note above: this cannot be run as one
`forge script` on CC3, so it is a sequence of `forge create` and `cast send` commands.

## What is actually blocking this

**Not funds.** The deployer used for the rest of the stack,
`0x7CEC5b3F9dA312072Aa987c7266f02A8Fca1bFF6`, holds testnet CTC and has already deployed
`AttestcoinPaymentVerifier` and `CreditLine` on CC3. It is funded.

**The key.** This repository does not contain it, deliberately. `.gitignore` excludes
`.env*`, so a local `.env` is the safe place for it.

If the address ever needs more testnet CTC, the faucet is a Discord bot command in the
`#token-faucet` channel of the Creditcoin Discord: `/faucet address:0x7CEC5b3F9dA312072Aa987c7266f02A8Fca1bFF6`.
There is no faucet API; it is a manual command.

## 1. Put the key in a file

```bash
cd contracts
cp .env.example .env
# then edit .env and set PRIVATE_KEY=<the deployer key>
```

`contracts/.env` is gitignored. Confirm that before anything else:

```bash
git check-ignore -v contracts/.env    # must print a match
```

The deploy script logs `vm.addr(pk)` before it broadcasts, so the derived address is visible
in the output and can be checked against the funded address above before any gas is spent.
No script in this repo prints the key itself.

## 2. Broadcast

Foundry loads `contracts/.env` automatically, so no exporting is needed.

```bash
cd contracts && forge script script/ProveMainnetPosition.s.sol:ProveMainnetPosition \
  --rpc-url https://rpc.cc3-testnet.creditcoin.network --broadcast
```

This deploys five contracts and then runs the whole proof against real Ethereum mainnet
facts: it anchors coverage at a provably zero balance, ingests the real aToken ledger,
reconciles against the real attested balance, submits the real Chainlink answer, and sizes a
credit limit from the resulting net worth. It is the same code path that was executed end to
end against a local chain, where independent reads of the deployed contracts returned
`netPosition = 433033874843288486772` and a limit of `21727648749879`.

Expect 10 transactions (5 deploys, then register, anchor, ledger, reconcile and price).
Anything else means the script changed and the evidence artifacts are now stale.

## 3. Verify, which is the part that matters

```bash
cd app && node scripts/verify-cc3-position-stack.mjs
```

This reads the deployment straight off CC3 and asserts it reproduces the mainnet facts the
engine was built from, including that the attested balance still equals the value read at the
recorded block. It writes `docs/evidence/cc3-position-stack.md` **only if every assertion
passes**; on any mismatch it prints what disagreed and exits non-zero without writing. A
missing artifact is therefore a meaningful signal, not an oversight.

Rehearse it without deploying at all, against a local chain:

```bash
# after broadcasting to a local anvil
cd app && DRY_RUN=1 EXPECTED_CHAIN_ID=31337 CC3_RPC_URL=http://127.0.0.1:8545 \
  BROADCAST_PATH=contracts/broadcast/ProveMainnetPosition.s.sol/31337/run-latest.json \
  node scripts/verify-cc3-position-stack.mjs
```

`DRY_RUN=1` prints the verdict and writes nothing, so a rehearsal cannot be mistaken for a
real deployment.

## Done looks like

- `docs/evidence/cc3-position-stack.md` exists and lists four Blockscout links.
- The assertions section in that file is all PASS.
- The four addresses are verifiable on the CC3 explorer.

Then the project has moved from "the engine runs locally" to "the engine is deployed and
independently verified", which is the claim the submission needs.

---

## Part 2 — generation 2 of `CreditLine`

Generation 1 of `CreditLine` has no way to lend against anything but the borrower's own
deposit: `credit = deposit x LTV`. That is the deployed product, and the four mainnet-sized
contracts in Part 1 cannot fix it, because they are a different contract. Generation 2 adds
`openCreditFromBalance`, which sizes the line at 20% of an **attested Sepolia balance** and
requires no deposit at all, using the kind-3 balance attestation the deployed verifier already
verifies.

This is a policy change to the product, not an upgrade to it. Nothing already on chain is
replaced in place, so here is exactly what does and does not survive.

### It is one contract, and it reuses the verifier you already have

`forge create` rather than `forge script`, because of the header issue described at the top.
This is the **verified** form — dry-run on 2026-09-14 it built the transaction correctly
(chainId `0x18e8f` = 102031, constructor args the verifier plus 8000 and 1000, gas 2,401,631)
and stopped only at "add `--broadcast`".

```bash
cd contracts
forge create --rpc-url https://rpc.cc3-testnet.creditcoin.network \
  --private-key $PRIVATE_KEY --broadcast \
  src/CreditLine.sol:CreditLine \
  --constructor-args 0xF13205Bdf48A3159d4A46309C639930aE8faC130 8000 1000
```

The constructor arguments are the deployed verifier, `collateralFactorBps` = 8000, and
`interestPerYearBps` = 1000 — the same policy as generation 1. The verifier is **confirmed
to hold code on CC3**, so the reuse is real rather than assumed.

The script `script/DeployGeneration2CreditLine.s.sol` is kept because it documents the
intent, checks, and expected output in readable Solidity, and it works against a local
chain. Do not expect it to run against CC3 until the Foundry header issue is resolved.

The script deploys **only** `CreditLine`. `DeployCreditcoin` would also mint a second
`AttestcoinPaymentVerifier` with identical code, leaving two contracts making the same claim
and making the verified one ambiguous. Reusing the deployed verifier keeps one verifier, one
Blockscout verification page, and one proof path. The script refuses to broadcast if
`VERIFIER_ADDRESS` is unset or has no code on the chain, and it prints `vm.addr(pk)` before
broadcasting so the deployer address can be checked against the funded one first.

Rehearsed on a local chain, which is where these numbers come from:

```
  deployer 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  reusing verifier 0x5FbDB2315678afecb367f032d93F642f64180aa3
  CreditLine (generation 2) 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  SparkCredit (new token) 0x75537828f2ce51be7289709686A69CbFDbB714F1
  BALANCE_LTV_BPS 2000
  MIN_BALANCE_LINE_WEI 100000000000000
```

### What generation 2 does not inherit

Read this before broadcasting, because both consequences are visible to anyone who looks.

1. **It starts with an empty record.** The live contract carries the 46-event record: 4 lines
   opened, 2 closed, 6 attested payments. A new contract starts at zero. The record does not
   vanish — it stays on generation 1's address forever — but the address a judge lands on when
   they click through the app stops having it.
2. **It has its own sCREDIT.** `CreditLine`'s constructor deploys a fresh `SparkCredit`, so
   generation 2's credit token is a different address with the same name and symbol. The demo
   video shows generation 1's token. This is visible, and the deployment log above shows it
   happening, so it is stated rather than discovered.

### Generation 1 stays visible

The app already supports a superseded line: `NEXT_PUBLIC_LEGACY_CREDITLINE_ADDRESS` exists, and
the on-chain record page indexes a legacy source alongside the production one. So the flip is a
configuration change, not a rewrite, and generation 1's history stays on the record page.

```bash
# app/.env — pointing the product at generation 2
NEXT_PUBLIC_LEGACY_CREDITLINE_ADDRESS=<generation 1 CreditLine>   # keeps the 46-event record
NEXT_PUBLIC_LEGACY_PAYMENT_ADDRESS=<the existing SepoliaPayment>
NEXT_PUBLIC_CREDITLINE_ADDRESS=<generation 2 CreditLine>
NEXT_PUBLIC_CREDIT_TOKEN_ADDRESS=<generation 2 SparkCredit>
```

Then, so the record page shows both generations instead of silently dropping one:

1. Add generation 2's two addresses to `SOURCES` in `app/scripts/gen-chain-activity.mjs`,
   labelled generation 2, and keep generation 1's entries as `role: "legacy"`.
2. `npm run gen:chain-activity` and re-read the page. New addresses with no events yet will
   simply contribute nothing, which is honest; what must not happen is generation 2's first
   events going unindexed.
3. Run the loop once on generation 2 so the new contract has its own record. A generation-2
   address with zero events is a worse look than either generation alone, so the flip and the
   first run belong together, not months apart.
4. Rebuild and redeploy the app. The addresses are inlined in the bundle at build time, so an
   env change alone does not take effect until the app is rebuilt.

### Done looks like

- `BALANCE_LTV_BPS()` reads `2000` and `MIN_BALANCE_LINE_WEI()` reads `1e14` on the new
  CreditLine address, read with `cast call`. The script prints both.
- Generation 2 appears on the CC3 explorer, and the verifier address it points at is the same
  one that was already verified.
- `spark.sithunyein.com/onchain` lists both generations, and generation 2 has real events.
- `docs/ROADMAP.md` M2b moves from "needs a `CreditLine` redeploy" to the deployment address.

If step 3 has not happened, generation 2 is deployed but has nothing to show, and the honest
status is still "built, tested, deployed, unproven" — which is worth saying in the submission
rather than leaving the reader to notice an empty page.
