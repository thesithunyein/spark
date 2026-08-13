# Deployed addresses

## Production (live site — keep until credit-score run succeeds)

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9` |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0x372BF96DFfa019A03E861d57CfC8a129172C8A3C` |
| CreditLine (dual-proof + interest) | Creditcoin testnet | `0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319` |
| SparkCredit (sCREDIT) | Creditcoin testnet | `0xFa18A5458a973a4E8a3eF327A88262683B64b02b` |
| BlockProver (USC precompile) | Creditcoin | `0x0000000000000000000000000000000000000FD2` |

## Credit-score stack (deployed 2026-08-13 — staging; switch Vercel only after live re-run)

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4` |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0xF13205Bdf48A3159d4A46309C639930aE8faC130` |
| CreditLine (history + score + LTV bonus) | Creditcoin testnet | `0x2C3585019B957b16459C409f34973b583267C742` |
| SparkCredit (sCREDIT) | Creditcoin testnet | `0x1BaDE07F2F3295528a2F7316119813b6846dFfaD` |

## Previous (retired)

| Contract | Address |
|---|---|
| SepoliaPayment (pre-balance) | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| AttestcoinPaymentVerifier | `0xB8d175f48cbeCc70448639000F749463734C08d0` |
| CreditLine (withdraw-enabled) | `0xCDcD81aE09b7742319Cb3e1aa8FeE6b1C4322171` |
| SparkCredit | `0x03bE0d28A26Dca214461D1BC4f04b6b04C3B1b20` |
| CreditLine (no withdraw) | `0x336bF0cF045048f7a17efE6eD50671f304B4E815` |

## Verified sources (production Aug 13)

| Contract | Explorer |
|---|---|
| SepoliaPayment | [eth-sepolia.blockscout.com](https://eth-sepolia.blockscout.com/address/0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9?tab=contract) |
| AttestcoinPaymentVerifier | [creditcoin-testnet.blockscout.com](https://creditcoin-testnet.blockscout.com/address/0x372BF96DFfa019A03E861d57CfC8a129172C8A3C?tab=contract) |
| CreditLine | [creditcoin-testnet.blockscout.com](https://creditcoin-testnet.blockscout.com/address/0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319?tab=contract) |
| SparkCredit | [creditcoin-testnet.blockscout.com](https://creditcoin-testnet.blockscout.com/address/0xFa18A5458a973a4E8a3eF327A88262683B64b02b?tab=contract) |

Set on Vercel (production until switch): `NEXT_PUBLIC_PAYMENT_ADDRESS`, `NEXT_PUBLIC_VERIFIER_ADDRESS`, `NEXT_PUBLIC_CREDITLINE_ADDRESS`, `NEXT_PUBLIC_CREDIT_TOKEN_ADDRESS`, `NEXT_PUBLIC_ATTESTCOIN=true`.
