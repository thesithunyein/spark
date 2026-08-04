<p align="center">
  <img src="brand/logo.png" width="88" height="88" alt="Spark" />
</p>

<h1 align="center">Spark</h1>

<p align="center"><strong>Pay once. Unlock credit.</strong></p>

<p align="center">
  We verify your payment so credit can open. No paperwork chase.
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue" />
  <img alt="network" src="https://img.shields.io/badge/network-Sepolia%20%2B%20Creditcoin%20testnet-ff6600" />
  <img alt="attestcoin" src="https://img.shields.io/badge/Attestcoin-path-ff6600" />
  <img alt="ui" src="https://img.shields.io/badge/UI-Next.js-black" />
  <img alt="contracts" src="https://img.shields.io/badge/contracts-Foundry-grey" />
  <img alt="status" src="https://img.shields.io/badge/status-testnet-yellow" />
  <img alt="live" src="https://img.shields.io/badge/live-spark--defi.vercel.app-22c55e" />
</p>

<p align="center">
  <a href="https://spark-defi.vercel.app"><strong>spark-defi.vercel.app</strong></a>
  ·
  <a href="https://github.com/thesithunyein/spark">GitHub</a>
  ·
  <a href="LICENSE">MIT License</a>
</p>

## What it is

Other credit apps cannot trust a payment that happened somewhere else without paperwork or a middleman. **Spark** verifies the payment, then unlocks or clears credit on **Creditcoin**.

- DeFi credit on Creditcoin (BUIDL CTC 2026 Fall)
- Rules, proofs, and on-chain balances only
- Runs on testnets today (Sepolia + Creditcoin testnet)
- Live app uses **MockPaymentVerifier**; contracts include an **Attestcoin** verifier path for USC proofs when wired

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

Open [http://localhost:3000](http://localhost:3000). In-app **Help** explains the flow for new users.

Live: [https://spark-defi.vercel.app](https://spark-defi.vercel.app)

## Deployed contracts (testnet)

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Sepolia | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| MockPaymentVerifier | Creditcoin testnet | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| CreditLine | Creditcoin testnet | `0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9` |

Details: [docs/addresses.md](docs/addresses.md)

## Deploy

- Contracts: Foundry (`contracts/script/Deploy.s.sol`) → update [docs/addresses.md](docs/addresses.md)
- App: Vercel — [docs/deploy-vercel.md](docs/deploy-vercel.md) (Root Directory = `app`)

## Roadmap

| Phase | Focus |
|---|---|
| **Now** | Testnet demo: pay → verify → credit → repay on Creditcoin |
| **Next** | Wire live Attestcoin USC proofs (replace mock verifier path) |
| **Later** | Mainnet readiness, audit, clearer single-network UX |

## Security

Not audited. Testnet only. See [SECURITY.md](SECURITY.md). No private keys on Vercel.

## License

MIT. See [LICENSE](LICENSE).
