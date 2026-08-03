<p align="center">
  <img src="brand/logo-on-orange.svg" width="72" height="72" alt="Spark" />
</p>

<h1 align="center">Spark</h1>

<p align="center"><strong>Pay once. Unlock credit.</strong></p>

<p align="center">
  We verify your payment so credit can open—no paperwork chase.
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue" />
  <img alt="network" src="https://img.shields.io/badge/network-Sepolia%20%2B%20Creditcoin%20testnet-7c3aed" />
  <img alt="attestcoin" src="https://img.shields.io/badge/Attestcoin-required-ff6600" />
  <img alt="ui" src="https://img.shields.io/badge/UI-Next.js-black" />
  <img alt="contracts" src="https://img.shields.io/badge/contracts-Foundry-grey" />
  <img alt="status" src="https://img.shields.io/badge/status-testnet-yellow" />
  <img alt="vercel" src="https://img.shields.io/badge/deploy-Vercel%20Hobby-black" />
</p>

## What it is

Other credit apps can’t trust a payment that happened somewhere else without paperwork or a middleman. **Spark** verifies the payment with **Attestcoin**, then unlocks or clears credit on **Creditcoin**.

- Track: **DeFi** (BUIDL CTC 2026 Fall)
- No AI demo — rules, proofs, balances only
- Demo funds on testnets

## Architecture

```mermaid
flowchart TB
  Retail[Borrower] --> UI[Spark_App]
  UI --> Pay[SepoliaPayment]
  UI --> Verifier[Attestcoin_Verifier]
  Verifier --> Credit[CreditLine]
```

User flow: **Pay deposit → Confirming → Credit ready → Repay → Closed**

See [docs/architecture.md](docs/architecture.md) and [docs/attestcoin.md](docs/attestcoin.md).

## Quickstart

```bash
# contracts
cd contracts
forge test

# app
cd ../app
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you should understand Spark in **3 seconds**: *Pay once. Unlock credit.*

## Deploy

- Contracts: `forge script` (see `contracts/script/Deploy.s.sol`) → fill [docs/addresses.md](docs/addresses.md)
- App: free Vercel — [docs/deploy-vercel.md](docs/deploy-vercel.md) (Root Directory = `app`)

## Security

Not audited. See [SECURITY.md](SECURITY.md). No private keys on Vercel.

## Hackathon

DoraHacks sector: **DeFi**. Attestcoin integration summary: [docs/attestcoin.md](docs/attestcoin.md).
