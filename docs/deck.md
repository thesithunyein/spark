# Spark — pitch deck outline (export to PDF for DoraHacks)

## Slide 1 — Title
**Spark**  
Pay once. Unlock credit.  
Logo (orange flame) · DeFi · BUIDL CTC 2026 Fall

## Slide 2 — Problem
Credit apps can’t trust a payment that happened somewhere else without paperwork, delays, or a middleman.

## Slide 3 — Solution
Spark verifies Sepolia facts with **Attestcoin**, then unlocks or clears credit on **Creditcoin**. Dual proofs: deposit + ETH balance.

## Slide 4 — How it works
1. Pay deposit + attest Sepolia balance  
2. Attestcoin proves both txs  
3. Credit opens on Creditcoin (LTV sized by balance)  
4. Repay the same way → closed  

## Slide 5 — Attestcoin depth
- Open needs deposit + balance verify; repay needs verify  
- One-time txHash  
- Payer must match msg.sender  
- Attested balance sizes LTV  
- **Testnet note:** BlockProver proves inclusion; adapter matches event topics in tx bytes — production would strict-decode logs and bind amounts  

## Slide 6 — Product
Live testnet app · spark.sithunyein.com · github.com/thesithunyein/spark  
Not audited · Honest testnet economics (interest + redeem)  

## Slide 7 — Ask
Grand prize / CEIP fast-track · Grow Spark on Creditcoin mainnet  
