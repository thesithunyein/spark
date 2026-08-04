# Security Policy

## Status

Spark is a **testnet** product for BUIDL CTC / CEIP diligence.

- **Not audited**
- **Testnet only.** Do not send mainnet value
- No deployer or admin private keys are stored in the Vercel app

## What we protect

| Control | Location |
|---|---|
| Attestcoin verify before credit open/repay | `CreditLine.sol` |
| One-time `txHash` (replay guard) | `CreditLine.sol` |
| Payer binding (`tx.from` / claimed payer) | `CreditLine.sol` |
| No custodial keys in the web app | `app/` |

## Reporting

Open a GitHub issue with the `[security]` label, or contact the maintainers privately if you discover a vulnerability that could affect users after a mainnet deploy.

Do not file public issues that include private keys or seed phrases.
