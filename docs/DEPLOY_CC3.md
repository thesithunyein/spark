# Deploying the position stack to CC3

Three commands. The only input is a private key, and it belongs in a file, not in a shell
history or a chat window.

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

This deploys four contracts and then runs the whole proof against real Ethereum mainnet
facts: it anchors coverage at a provably zero balance, ingests the real aToken ledger,
reconciles against the real attested balance, and submits the real Chainlink answer. It is
the same code path that was executed end to end against a local chain, where independent
reads of the deployed contracts returned `netPosition = 433033874843288486772`.

Expect 9 transactions. Anything else means the script changed and the evidence artifacts are
now stale.

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
