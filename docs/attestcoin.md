# Attestcoin integration (Spark)

Spark uses the **Attestcoin Protocol** (formerly USC) so a payment on Ethereum Sepolia can unlock or clear credit on Creditcoin **without a centralized oracle**.

## Why Attestcoin is required

| Action | Without proof | With Attestcoin |
|---|---|---|
| Open credit | Reverts | Opens after BlockProver verify |
| Repay / close | Reverts | Updates after BlockProver verify |

`CreditLine.openCredit` and `CreditLine.repayCredit` call `AttestcoinPaymentVerifier.verifyPayment`, which calls Creditcoin **BlockProver** (`0x…0FD2`) via `verifyAndEmit`. Invalid proofs revert. `txHash` can only be used once. `claim.payer` must equal `msg.sender`.

## Flow

1. User calls `SepoliaPayment.payDeposit` / `payRepayment` (Sepolia)
2. App waits for attestation (`ProofBuilder.waitUntilHeightAttested`)
3. App builds USC proof (`ProofBuilder.getProof` via Proof Builder API)
4. User calls `CreditLine.openCredit` / `repayCredit` on Creditcoin with claim + USC proof
5. Verifier calls BlockProver; credit state updates

## Contracts

- `SepoliaPayment.sol` — payment events on Sepolia
- `CreditLine.sol` — positions gated by verifier
- `AttestcoinPaymentVerifier.sol` — USC BlockProver adapter (live)
- `MockPaymentVerifier.sol` — local unit tests only

## Live addresses (CC3 testnet)

See [addresses.md](addresses.md).

## SDK / docs

- USC SDK: https://docs.creditcoin.org/usc/dapp-builder-infrastructure/usc-sdk
- Environments: https://docs.creditcoin.org/creditcoin-usc/usc-chains-environments
- Prover API: `NEXT_PUBLIC_PROVER_URL` (default `https://proof-gen-api.cc3-testnet.creditcoin.network`)
- App helper: `app/src/lib/usc.ts`

## DoraHacks blurb

> Spark is DeFi credit that only unlocks after Attestcoin verifies a Sepolia payment via Creditcoin BlockProver. Deposit and repay require USC inclusion proofs bound to the payer, with one-time txHash replay protection.
