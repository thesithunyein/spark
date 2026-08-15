# Attestcoin integration (Spark)

Spark uses the **Attestcoin Protocol** (formerly USC) so data on Ethereum Sepolia can unlock or clear credit on Creditcoin **without a centralized oracle**.

## Why Attestcoin is required

| Action | Without proof | With Attestcoin |
|---|---|---|
| Open credit | Reverts | Opens after **two** BlockProver verifies |
| Repay / close | Reverts | Updates after BlockProver verify |

`CreditLine.openCredit` requires:

1. **Deposit payment** proof (`DepositPaid`) — kind 1  
2. **Sepolia ETH balance** proof (`BalanceAttested`) — kind 3 (second attested data type)

Both call `AttestcoinPaymentVerifier.verifyPayment` → Creditcoin **BlockProver** (`0x…0FD2`) via `verifyAndEmit`. Invalid proofs revert. Each `txHash` can only be used once. Claim payer must equal `msg.sender`.

Attested balance **sizes LTV**: ≥2× deposit → 90%, ≥1× → 85%, else base factor (80%). **Payment history** adds +250 bps (≥1 linked payment) or +500 bps (≥3). **creditScore** = 650 + 40 × history count (cap 850). Debt accrues **10% APR**. `redeem` burns sCREDIT against debt; attested Sepolia repayment closes the line.

## Flow

1. User calls `SepoliaPayment.payDeposit` (Sepolia)
2. App calls `SepoliaPayment.attestBalance` (Sepolia) — snapshots wallet ETH
3. App waits for attestation on both txs (`ProofBuilder.waitUntilHeightAttested`)
4. App builds two USC proofs (`ProofBuilder.getProof`)
5. User calls `CreditLine.openCredit` with deposit claim+proof and balance claim+proof
6. Verifier calls BlockProver twice in one open; credit state updates

## Contracts

- `SepoliaPayment.sol` — deposit, repay, **balance attest** events on Sepolia
- `CreditLine.sol` — dual-proof open, interest, redeem, repay
- `AttestcoinPaymentVerifier.sol` — USC BlockProver adapter (kinds 1/2/3)
- `MockPaymentVerifier.sol` — local unit tests only

## Live addresses (CC3 testnet)

See [addresses.md](addresses.md).

## SDK / docs

- USC SDK: https://docs.creditcoin.org/usc/dapp-builder-infrastructure/usc-sdk
- Environments: https://docs.creditcoin.org/creditcoin-usc/usc-chains-environments
- Prover API: `NEXT_PUBLIC_PROVER_URL` (default `https://proof-gen-api.cc3-testnet.creditcoin.network`)
- App helper: `app/src/lib/usc.ts`

## Honest limits (Fall 2026)

- Kind 3 (`BalanceAttested`) is a BlockProver-verified **snapshot** of Sepolia ETH at the moment `attestBalance` was mined. `openCredit` sizes LTV from that snapshot; there is no on-chain check that the balance is still current. The 8-20 minute attestation wait is a reorg-safety/UX choice, not an on-chain freshness bound.
- After open, there is **no liquidation or health factor**. Interest accrues, but a position that goes underwater relative to a later Sepolia balance is not enforced on-chain in this version.

**Roadmap:** bind kind 3 proof `height` to the deposit proof window, re-attest balance on a cadence, and liquidate when attested health falls below a threshold.

## DoraHacks blurb

> Spark is DeFi credit that only unlocks after Attestcoin verifies **two** Sepolia facts via Creditcoin BlockProver: the deposit payment and the borrower’s on-chain ETH balance. Balance attestation sizes LTV trustlessly. Debt accrues interest; repayments are Attestcoin-gated. No oracle — verified payment history and solvency drive the credit decision.
