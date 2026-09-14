# Running the Spark loop yourself

Spark's on-chain record was produced by **two wallets**, one of which is mine. That is enough
to prove the loop works and nowhere near enough to prove anyone wants it, so this document
exists to make running it yourself as cheap as possible.

Read the honest part first, because it decides whether this is worth your twenty minutes.

## What you actually get

**Nothing of value.** Spark is on testnet. The ETH you deposit is Sepolia ETH, the credit
you receive is test sCREDIT, and neither is worth anything. What you get is a working
cross-chain credit line that you opened with a cryptographic proof instead of a credit
check, and a permanent entry in a public on-chain record.

**And you keep your deposit.** The 0.01 ETH you pay is not a fee. You repay on Sepolia and
close the line, and the repayment is proven by a second Attestcoin proof.

## What you need

| | Detail |
|---|---|
| Two networks | Ethereum **Sepolia** (chain `11155111`) and **Creditcoin testnet** (chain `102031`) |
| Sepolia ETH | ~0.012 ETH: a 0.01 deposit plus gas |
| Testnet CTC | A small amount, for gas on Creditcoin |
| A wallet | MetaMask or any injected wallet |
| Your time | **20–30 minutes**, most of it waiting on attestation |

Where to get the testnet funds:

- **Creditcoin CTC** — the faucet is a Discord bot command in `#token-faucet` on the
  Creditcoin Discord: `/faucet address:0xYourAddress`. There is no web API for it.
- **Sepolia ETH** — any public Sepolia faucet. Alchemy and Google Cloud both run one; search
  for the current URL rather than trusting a link in a document.

## The flow

1. **Connect your wallet** at [spark.sithunyein.com](https://spark.sithunyein.com). If it
   offers to switch networks, let it.
2. **Pay the deposit** on the *Pay deposit* page: 0.01 ETH on Sepolia, plus a reference
   string. This is an ordinary Sepolia transaction and costs ordinary Sepolia gas.
3. **Hit Verify.** Spark asks for **two Attestcoin proofs in parallel** — one that your
   deposit happened, one that your wallet holds funds. Both wait on the same attestation
   window rather than two sequential ones, which is why this takes roughly one wait, not two.
   **Expect 8–20 minutes.** This is the long part and it is not a bug: Attestcoin deliberately
   attests a number of blocks behind the chain head so a reorg cannot invalidate a proof.
4. **Approve and confirm `openCredit`** on Creditcoin. Your line opens, sized by the policy
   published at [spark.sithunyein.com/help](https://spark.sithunyein.com/help).
5. **Withdraw** sCREDIT, and optionally **redeem** it back against your debt.
6. **Repay and close**: pay on Sepolia, verify the repayment on Creditcoin, and the line
   closes. If only dust debt remains, 0.001 ETH on Sepolia is enough.

If anything stalls, the *Help* page has the same steps with the specific failure modes, and
your deposit is not lost: the line stays open until you close it.

## What I am asking you not to do

**Do not run this with wallets you control as separate "users".** The on-chain record lists
wallet addresses. Ten addresses from one person is one user wearing ten hats, and the whole
point of publishing that record is that it is checkable.

An honest second wallet is worth more to this project than ten faked ones, because a second
real person is true and is already counted. The record currently reads two distinct wallets,
and one of them is mine.

## A message you can send

> I'm building Spark for a Creditcoin hackathon: it turns a payment on Sepolia into a credit
> line on Creditcoin using cryptographic proofs instead of a credit check. Testnet only, no
> real money, nothing you keep — you deposit 0.01 Sepolia ETH, get a credit line, repay, and
> close it. Takes about 25 minutes, mostly waiting on a proof. It needs two testnet faucets,
> which I'll walk you through. Would you run it once and tell me where it confused you?

The last sentence is the useful part. Someone telling you where it broke is worth more than
the transaction itself.
