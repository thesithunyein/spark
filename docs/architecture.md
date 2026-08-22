# Architecture

## System

```mermaid
flowchart TB
  subgraph users [Users]
    Retail[Retail_borrower]
  end
  subgraph appLayer [Spark_App_Vercel]
    UI[Nextjs_UI]
    LogoBrand[Orange_flame_S]
  end
  subgraph eth [Ethereum_Sepolia]
    Pay[SepoliaPayment]
  end
  subgraph proofs [Attestcoin]
    Prover[Proof_Builder]
    Verifier[PaymentVerifier]
  end
  subgraph ctc [Creditcoin_Testnet]
    Credit[CreditLine]
  end
  Retail --> UI
  UI --> Pay
  UI --> Prover
  Prover --> Verifier
  Verifier --> Credit
  UI --> Credit
```

## Security

1. Verify before state change
2. One-time `txHash` (replay guard)
3. Payer must be `msg.sender`
4. **Amounts verified from decoded receipt logs** (not trusting claim.amount — strict RLP log decoding in verifier)
5. No private keys on Vercel

## Sequence — open credit

```mermaid
sequenceDiagram
  participant U as User
  participant App as App
  participant S as SepoliaPayment
  participant A as Attestcoin
  participant C as CreditLine
  U->>App: Pay_deposit
  App->>S: lock_tx
  App->>S: attest_balance
  App->>A: parallel_wait_and_prove
  A->>C: openCredit_dual_proof
  C-->>U: credit_ready
```

## Sequence — credit score

Link past Sepolia payments via `submitAttestedPayment` (Attestcoin proof each). History raises `creditScore` and `historyBonusBps` before the next `openCredit`.
