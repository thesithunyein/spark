# Deployed addresses

In-window Fall 2026 deploys (2026-08-13):

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9` |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0x372BF96DFfa019A03E861d57CfC8a129172C8A3C` |
| CreditLine (dual-proof + interest) | Creditcoin testnet | `0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319` |
| SparkCredit (sCREDIT) | Creditcoin testnet | `0xFa18A5458a973a4E8a3eF327A88262683B64b02b` |
| BlockProver (USC precompile) | Creditcoin | `0x0000000000000000000000000000000000000FD2` |

## Previous (retired)

| Contract | Address |
|---|---|
| SepoliaPayment (pre-balance) | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| AttestcoinPaymentVerifier | `0xB8d175f48cbeCc70448639000F749463734C08d0` |
| CreditLine (withdraw-enabled) | `0xCDcD81aE09b7742319Cb3e1aa8FeE6b1C4322171` |
| SparkCredit | `0x03bE0d28A26Dca214461D1BC4f04b6b04C3B1b20` |
| CreditLine (no withdraw) | `0x336bF0cF045048f7a17efE6eD50671f304B4E815` |

Set on Vercel: `NEXT_PUBLIC_PAYMENT_ADDRESS`, `NEXT_PUBLIC_VERIFIER_ADDRESS`, `NEXT_PUBLIC_CREDITLINE_ADDRESS`, `NEXT_PUBLIC_CREDIT_TOKEN_ADDRESS`, `NEXT_PUBLIC_ATTESTCOIN=true`.
