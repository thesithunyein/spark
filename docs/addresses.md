# Deployed addresses

| Contract | Network | Address |
|---|---|---|
| SepoliaPayment | Ethereum Sepolia | `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` |
| AttestcoinPaymentVerifier | Creditcoin testnet | `0xB8d175f48cbeCc70448639000F749463734C08d0` |
| CreditLine | Creditcoin testnet | `0x336bF0cF045048f7a17efE6eD50671f304B4E815` |
| BlockProver (USC precompile) | Creditcoin | `0x0000000000000000000000000000000000000FD2` |

Previous MockPaymentVerifier deploy (retired for live Attestcoin path): `0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F` (same address as SepoliaPayment by coincidence on Creditcoin).

Set on Vercel: `NEXT_PUBLIC_PAYMENT_ADDRESS`, `NEXT_PUBLIC_VERIFIER_ADDRESS`, `NEXT_PUBLIC_CREDITLINE_ADDRESS`, `NEXT_PUBLIC_ATTESTCOIN=true`.
