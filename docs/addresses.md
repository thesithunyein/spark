# Deployed addresses

## Production (live site — credit-score stack)

| Contract | Network | Address | Verified |
|---|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4` | Yes (Blockscout) |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0xF13205Bdf48A3159d4A46309C639930aE8faC130` | Yes |
| CreditLine (history + score + LTV bonus) | Creditcoin testnet | `0x2C3585019B957b16459C409f34973b583267C742` | Yes (Blockscout) |
| SparkCredit (sCREDIT) | Creditcoin testnet | `0x1BaDE07F2F3295528a2F7316119813b6846dFfaD` | Yes |
| BlockProver (USC precompile) | Creditcoin | `0x0000000000000000000000000000000000000FD2` | n/a |

## Legacy (Aug 13 dual-proof — finish open repay via Repay page)

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9` |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0x372BF96DFfa019A03E861d57CfC8a129172C8A3C` |
| CreditLine (dual-proof + interest) | Creditcoin testnet | `0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319` |
| SparkCredit (sCREDIT) | Creditcoin testnet | `0xFa18A5458a973a4E8a3eF327A88262683B64b02b` |

Set legacy env on Vercel so users can call `repayCredit` on the old line after the flip:

- `NEXT_PUBLIC_LEGACY_CREDITLINE_ADDRESS=0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319`
- `NEXT_PUBLIC_LEGACY_PAYMENT_ADDRESS=0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9`

## Previous (retired)

| Contract | Address |
|---|---|
| SepoliaPayment (pre-balance) | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| AttestcoinPaymentVerifier | `0xB8d175f48cbeCc70448639000F749463734C08d0` |
| CreditLine (withdraw-enabled) | `0xCDcD81aE09b7742319Cb3e1aa8FeE6b1C4322171` |
| SparkCredit | `0x03bE0d28A26Dca214461D1BC4f04b6b04C3B1b20` |
| CreditLine (no withdraw) | `0x336bF0cF045048f7a17efE6eD50671f304B4E815` |

## Vercel env (production)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_PAYMENT_ADDRESS` | `0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4` |
| `NEXT_PUBLIC_VERIFIER_ADDRESS` | `0xF13205Bdf48A3159d4A46309C639930aE8faC130` |
| `NEXT_PUBLIC_CREDITLINE_ADDRESS` | `0x2C3585019B957b16459C409f34973b583267C742` |
| `NEXT_PUBLIC_CREDIT_TOKEN_ADDRESS` | `0x1BaDE07F2F3295528a2F7316119813b6846dFfaD` |
| `NEXT_PUBLIC_ATTESTCOIN` | `true` |
| `NEXT_PUBLIC_LEGACY_CREDITLINE_ADDRESS` | `0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319` |
| `NEXT_PUBLIC_LEGACY_PAYMENT_ADDRESS` | `0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9` |
