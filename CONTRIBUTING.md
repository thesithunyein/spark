# Contributing

Thank you for helping improve Spark.

## Rules

- Testnet only — never commit private keys or `.env` files
- Keep the repo lean — no unused packages or fake TVL docs
- Attestcoin must remain required for credit open and repay
- No AI agent features in this product

## Dev

```bash
# contracts
cd contracts && forge test

# app
cd app && pnpm install && pnpm dev
```

## PRs

1. One clear change per PR
2. Include `forge test` / app build green notes
3. Update `docs/addresses.md` if you redeploy
