# Attestcoin integration (Spark)

Spark uses the **Attestcoin Protocol** (formerly USC) so a payment on Ethereum Sepolia can unlock or clear credit on Creditcoin **without a centralized oracle**.

## Why Attestcoin is required

| Action | Without proof | With Attestcoin |
|---|---|---|
| Open credit | Reverts | Opens after verify |
| Repay / close | Reverts | Updates after verify |

`CreditLine.openCredit` and `CreditLine.repayCredit` call `IPaymentVerifier.verifyPayment`. Invalid or missing proofs revert (`ProofFailed`). `txHash` can only be used once. `claim.payer` must equal `msg.sender`.

## Flow

1. User calls `SepoliaPayment.payDeposit` / `payRepayment` (Sepolia)
2. App waits for attestation / builds proof (USC SDK + Proof Builder API)
3. User calls `CreditLine.openCredit` / `repayCredit` on Creditcoin with claim + proof
4. Verifier checks proof; credit state updates

## Contracts

- `SepoliaPayment.sol` — payment events on Sepolia
- `CreditLine.sol` — positions gated by verifier
- `MockPaymentVerifier.sol` — local / early testnet
- `AttestcoinPaymentVerifier.sol` — production-shaped USC adapter (swap in for submission depth)

## SDK / docs

- USC SDK: https://docs.creditcoin.org/usc/dapp-builder-infrastructure/usc-sdk
- Environments: https://docs.creditcoin.org/creditcoin-usc/usc-chains-environments
- Prover (CC3 testnet): `NEXT_PUBLIC_PROVER_URL`

## DoraHacks blurb (paste)

> Spark is DeFi credit that only unlocks after Attestcoin verifies a Sepolia payment. Deposit and repay both require cryptographic payment proofs bound to the payer, with one-time txHash replay protection. The product is trust-minimized cross-system credit—not an AI demo.
