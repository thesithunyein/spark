# DoraHacks BUIDL submission (paste-ready)

**Event:** BUIDL CTC 2026 Fall  
**Track:** DeFi  
**Tag:** Attestcoin Protocol

---

## Project name

Spark

## One-liner

Pay once. Unlock credit.

## Short description (≈500 chars)

Spark opens collateralized credit on Creditcoin only after a payment is verified through Attestcoin Protocol. Users pay a deposit on Sepolia, Spark confirms the payment with a cryptographic proof, then a credit line opens on Creditcoin. Repay closes the line. No paperwork chase, no manual reconciliation. Live testnet demo with on-chain contracts and a product UI.

## Problem

Lending and credit systems struggle when payment happens on one network or system but credit should open on another. Banks and apps rely on receipts, emails, or middlemen. That is slow, opaque, and easy to dispute.

## Solution

Spark ties payment proof to credit state on Creditcoin. `CreditLine.openCredit` and `repayCredit` call a payment verifier. No valid proof means no state change. Each payment transaction hash can only be used once. The payer must match the wallet signing the credit action.

## Why Creditcoin

Credit positions, debt, and lifecycle events live on Creditcoin testnet. Attestcoin Protocol (formerly USC) connects external payment truth to on-chain credit without a centralized oracle. That matches Creditcoin’s role as a transparent on-chain financial layer.

## What is live

| Item | URL / value |
|---|---|
| App | https://spark-defi.vercel.app |
| GitHub | https://github.com/thesithunyein/spark |
| Help (onboarding) | https://spark-defi.vercel.app/help |
| SepoliaPayment | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| CreditLine (Creditcoin) | `0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9` |
| Verifier (testnet) | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |

## Honest limits

- Testnet only (Sepolia + Creditcoin testnet). Not mainnet. Not audited.
- Production UI uses MockPaymentVerifier for demo stability. `AttestcoinPaymentVerifier.sol` and USC docs are in the repo for the full Attestcoin path.
- Users need a wallet and test tokens from public faucets.

## Demo steps (for judges)

1. Open https://spark-defi.vercel.app/help for context.
2. Connect wallet (browser wallet or WalletConnect).
3. Get Sepolia ETH: https://cloud.google.com/application/web3/faucet/ethereum/sepolia
4. Get Creditcoin gas: Creditcoin Discord `#token-faucet`
5. Pay deposit → wait for confirm → credit opens on Overview.
6. Check Payments for transaction history.
7. Repay → line closes.

## Tech stack

- Contracts: Foundry (Solidity)
- App: Next.js 15, wagmi, viem
- Deploy: Vercel (app), Creditcoin + Sepolia testnets

## Attestcoin integration

See [docs/attestcoin.md](attestcoin.md).

---

## GitHub topics (suggested)

`defi`, `creditcoin`, `attestcoin`, `ethereum`, `sepolia`, `nextjs`, `foundry`, `solidity`, `hackathon`, `dorahacks`, `web3`

## Website field

https://spark-defi.vercel.app
