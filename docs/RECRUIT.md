# Recruiting real wallets

> **A working document, not a submission artifact.** It exists because the single weakest
> number on this project is how few wallets have produced its on-chain events, and no amount of
> code changes that. This is the part a solo builder cannot do from a repository.

**The goal is ten to thirty people who run the loop with their own wallets.** Ten real
participants takes the measured funnel from four wallets to fourteen, which is a genuine result.
Inflating that number with wallets we control would be worse than leaving it at one, because
the addresses are public and a reviewer can count them.

---

## What to tell people, in one line

> Spark gives you a credit line on one chain by proving a payment and a balance on another,
> with no bank, no forms and no credit check. It is a testnet prototype, it costs nothing,
> and it takes about ten minutes.

---

## What a participant needs

| | Detail |
|---|---|
| **A wallet** | MetaMask, Rainbow, Rabby, or anything WalletConnect. Can be a brand-new one |
| **Sepolia ETH** | Free, ~0.01 ETH. Link: <https://cloud.google.com/application/web3/faucet/ethereum/sepolia> |
| **Creditcoin testnet CTC** | Free, for gas. Discord command in `#token-faucet`: `/faucet address:0xYourAddress` |
| **Time** | About ten minutes, most of it waiting for the two faucets |
| **Money** | **None.** Testnet only. No real value is involved at any point |

The app now does the tedious part for them: connect a wallet on `/overview` and it shows a
copy-ready faucet command with their own address already in it, plus live balances for both
chains so they can see when they are ready.

---

## The message to send

### Discord, one-to-one or a friendly channel

```
Hey — I built a thing for a hackathon and I need a handful of real people to try it, because
"one user" is currently my weakest number and I would rather ask than fake it.

It's a credit line: you make a small testnet payment on Sepolia, the protocol proves it on
another chain called Creditcoin, and a credit line opens against it. No bank, no forms.

What you'd need: a wallet, and two free faucets (about ten minutes of waiting, no money).
It is testnet only — nothing is real, nothing can be lost, and you can use a throwaway wallet.

If you're up for it: <LINK>/overview — connect a wallet and it walks you through the faucets.
If not, no worries at all.
```

### Shorter, for a group chat

```
I need ~10 real wallets to test a cross-chain credit demo for a hackathon.
Testnet only, costs nothing, ~10 min, throwaway wallet is fine.
Connect here and it pre-fills the faucet command: <LINK>/overview
```

### If you want to post publicly

```
Looking for testers for a cross-chain credit prototype (Creditcoin testnet).

The idea: prove a payment on one chain, get a credit line on another — no oracle, no bank,
no paperwork. Built on Attestcoin proofs.

Want: ~10 people with a wallet and 10 minutes.
Cost: nothing. Testnet only. Throwaway wallet welcome.
Link: <LINK>/overview

What I'm measuring is honest and small: how many distinct wallets complete the loop.
```

---

## The walkthrough, for someone who has never used a testnet

Send this to anyone who says yes and seems unsure.

1. **Open the site and connect a wallet.** Any wallet works. A fresh one is fine and is
   arguably better, since nothing about the test involves real funds.
2. **Get Sepolia ETH.** The page shows your address with a copy button and a link to a free
   faucet. Paste the address there. You need roughly 0.01 ETH, and the faucet may ask you to
   sign in with a Google account.
3. **Get Creditcoin CTC.** This one is a Discord command. The page builds the exact command
   with your address already in it — copy it, join the Creditcoin Discord, go to
   `#token-faucet`, paste and send. It has a cooldown, so do it before you need it.
4. **Wait for both.** The page shows both balances live and tells you when you are ready.
5. **Run the loop.** Pay the deposit on Sepolia, then verify. Credit opens on Creditcoin.
   Withdraw it, then repay on Sepolia to close the line.
6. **Done.** Your wallet now appears in the public record at `/onchain`, next to everyone
   else who has run it.

**If something breaks, that is genuinely useful information.** The app surfaces the failing
step rather than a generic error, and a real failure report is worth more than a success.

---

## What this does and does not prove

**Does prove:** the loop works for wallets other than the one the author controls, and the
measured funnel on `/onchain` reflects distinct addresses rather than one address repeating.

**Does not prove:** that anyone wants the product, that the credit model prices risk
correctly, or that a market exists. Ten testnet participants is a working demonstration, not
traction, and the page will keep saying so.

**Also worth saying out loud:** this is a testnet prototype with no audit. Nobody should put
anything of value anywhere near it, and participants should use a throwaway wallet rather than
one holding real assets.

---

## Where to ask

- **People who already know you.** Friends, classmates, colleagues, group chats. Highest
  response rate by a wide margin, and they will actually finish.
- **The Creditcoin Discord.** People already in the ecosystem, already have testnet CTC, and
  already understand what is being built. `#buidl-ctc-qna` and general channels.
- **Other builders in the hackathon.** They understand the exercise and many will return the
  favour.
- **X / Twitter.** Lowest conversion, but a public post creates a timestamped record that a
  test was attempted regardless of how many respond.

---

## Tracking

The funnel at <https://spark.sithunyein.com/onchain> is the record, counted from the chain's
own indexed actor field. Refresh it after participants finish with:

```bash
cd app && npm run gen:activity
```

Then update the funnel stage counts by deploying, or simply read them from the page — the
numbers are computed, not typed, so there is nothing to keep in sync by hand.
