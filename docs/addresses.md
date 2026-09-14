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

## Portability pair (deployed after the submission deadline)

The same post-deadline status. These two exist because `AttestedStanding` published a record
and an `isEligible` predicate that nothing consumed, which made portability an interface claim
rather than a demonstrated fact. `StandingGatedCheckout` is the second consumer: a merchant
that is not Spark, applying its own policy to a record it did not create.

| Contract | Network | Address | Verified |
|---|---|---|---|
| AttestedStanding (registry over generation 1) | Creditcoin testnet | `0x88ea1190e5dbC1e8Cb0406Bc868B4db4ad57FbEa` | Yes (Blockscout) |
| StandingGatedCheckout (the second consumer) | Creditcoin testnet | `0x199A3E0e797A01C5909fE52a8C0c66ed83f2cA11` | Yes (Blockscout) |

Deployed with `script/standing-consumer-cc3.sh`, which also runs the demonstration: refresh,
setPolicy, listItem, checkout, settle. Two notes on it that are worth keeping:

**The registry is anchored to generation 1 on purpose.** The registry in the batch above points
at the generation-2 CreditLine, which is clean (`getHistory(deployer)` returns `(0, 0)`), so
`refresh` correctly reverts with `NotAttested` there. Generation 1 holds real evidence today and
is the deployment the demo video and the frozen entry describe, so anchoring here needs no new
Sepolia deposit and is closer to what was judged. `ICreditLineView` exists so a registry can
point at any generation.

**Every `cast send` in that script carries an explicit gas limit.** CC3's `eth_estimateGas`
fails on calls that write storage, returning an empty revert (`revert, data: "0x"`), while the
identical call succeeds through `eth_call`. It is the same block-header shape that stops
`forge script --broadcast` (CC3 omits `mixHash`), surfacing in the estimation path instead.

Read back from the chain after the run, not from intent:

| Fact | Value |
|---|---|
| Records in the registry | 1 |
| Standing score / payments | 850 / 6 |
| Proven volume | 0.032 ETH |
| Attested balance | 0.346 ETH |
| Evidence reference | `0x38d82855a67a8a2051378833eb1d6aee62306d4c696392c5539aedf49ba271e1` |
| Merchant policy | min score 650, min 3 payments, 30-day freshness window, 30-day term, 0.05 ETH ceiling, 20% advance |
| Item price / deferred | 0.01 ETH / 0.0064 ETH |
| Order state | settled, outstanding 0, not overdue |

The evidence reference is an actual transaction hash, so the Attestcoin proof behind the record
is checkable at
`https://creditcoin-testnet.blockscout.com/tx/0x38d82855a67a8a2051378833eb1d6aee62306d4c696392c5539aedf49ba271e1`.
`/bonus` reads the same pair live, in the browser, with no wallet.

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
