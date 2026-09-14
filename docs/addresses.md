# Deployed addresses

## Production (live site — credit-score stack)

| Contract | Network | Address | Verified |
|---|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4` | Yes (Blockscout) |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0xF13205Bdf48A3159d4A46309C639930aE8faC130` | Yes |
| CreditLine (history + score + LTV bonus) | Creditcoin testnet | `0x2C3585019B957b16459C409f34973b583267C742` | Yes (Blockscout) |
| SparkCredit (sCREDIT) | Creditcoin testnet | `0x1BaDE07F2F3295528a2F7316119813b6846dFfaD` | Yes |
| BlockProver (USC precompile) | Creditcoin | `0x0000000000000000000000000000000000000FD2` | n/a |

## Generation 2 + CEIP stack (deployed after the submission deadline)

Not part of the judged entry. The deck and the DoraHacks text describe the deposit-backed
generation at `0x2C35…C742`. This deployment closes the "built, not broadcast" gap named in
that text, and is recorded here rather than in the frozen artifacts.

| Contract | Network | Address |
|---|---|---|
| CreditLine (generation 2, balance-sized) | Creditcoin testnet | `0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682` |
| AttestedStanding | Creditcoin testnet | `0x8Cc493C539767788eB5a89fe55a7b47FF46D3383` |
| GroupCredit | Creditcoin testnet | `0x4accC2C22B0D497FBB9274DF310Fd89CCd0b11Ff` |
| MainnetPositionRegistry | Creditcoin testnet | `0x8c718d733Eb3149d25A9aA0cc1487FA6eCFcE0Dd` |
| MainnetTokenRegistry | Creditcoin testnet | `0x5B35f79C5aDFbB765dfFB522857a0c6C5a0d1E9f` |
| AttestedPriceFeed | Creditcoin testnet | `0xFE16ea120848D75caCbc69BfCee8cb32ec7916c2` |
| PositionValuer | Creditcoin testnet | `0x95847A47248BA848Fc1Bd43bB8C1F733A4845282` |
| PositionSizedCredit | Creditcoin testnet | `0xD19E758C30bD97fe1CFA4d023a4016f2741e9A04` |
| AttestcoinPaymentVerifier (reused) | Creditcoin testnet | `0xF13205Bdf48A3159d4A46309C639930aE8faC130` |

All nine addresses are **verified on Blockscout**, source published and constructor arguments
matched, so each reads as a contract rather than raw bytecode. Verification was submitted
the same day as the deploy and confirmed against the Blockscout API (`is_verified: true`
for all eight newly deployed contracts; the reused verifier was already verified).

Deployed with `script/deploy-all-cc3.sh` from deployer
`0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2`.

Verified read-backs from the deploy: `openCreditFromBalance` (selector `9a689526`) is
present in the generation-2 bytecode and absent from generation 1; the position engine
returned a $1,086,828.42 net worth and a $217,365.68 limit at 20% LTV, priced from a live
mainnet ETH/USD answer (2509.80, block 25973626).

The live site still points at generation 1 (`NEXT_PUBLIC_CREDITLINE_ADDRESS`), which is
what the frozen submission describes.

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
