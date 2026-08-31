# On-Chain Evidence — Spark

Proof artifacts from live testnet deployment. Every claim is verifiable on Blockscout.

## Deployed Contracts

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Sepolia | 0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4 |
| AttestcoinPaymentVerifier | CC3 | 0xF13205Bdf48A3159d4A46309C639930aE8faC130 |
| CreditLine | CC3 | 0x2C3585019B957b16459C409f34973b583267C742 |
| SparkCredit | CC3 | 0x1BaDE07F2F3295528a2F7316119813b6846dFfaD |

## Two Complete Closed Loops

### Loop 1 — Aug 13 (factorBps = 9000, credit 0.009 ETH)

| Step | Tx |
|---|---|
| Open | 0xe5ec5506ccdc54851e6c08674b2649d7efa1033220ef768dcc0583f1bf1da9c1 |
| Withdraw | 0xbf411c5aeba0dc7b4105b4fdc992ca09b22bb289aa008ee58690d6c575601f3d |
| Redeem | 0x48980365b9366b32b608f5945f16744c69cb1d31b091c0f0bc94120d8d8cfb01 |
| Repay+Close | 0x5092e5165c0fedaf85b53a8c20b9710d4b60a79b3ccaa3e815ec5fda42c18eb4 |

### Loop 2 — Aug 14 (factorBps = 9500, credit 0.0095 ETH)

| Step | Tx |
|---|---|
| Open | 0xbbec27e622b18d21bdedb24fabc072041aa0fe3ad7419b952a1e2b8754bba618 |
| Withdraw | 0x3bc160b1a2a1e3c0b1e5065387f15c0383fcad9f2c0566b8653a41fddf232789 |
| Redeem | 0x9177c4107aae3189926653fb7e9c8c2d24b9770c75b40cb56fb72574f081d34d |
| Repay+Close | 0x5fc0b4fb25493606c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122 |

## Score Record

5 AttestedPaymentLinked events. On-chain creditScore = 850 (650 + 5 x 40).

## Attestcoin Proofs

All Creditcoin transactions above contain BlockProver TransactionVerified events confirming real USC proofs.
