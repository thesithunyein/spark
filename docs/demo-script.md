# Spark demo script (2–3 minutes)

Use this for a live demo or recording. Speak in plain language. Show the screen, not the terminal.

---

## Before you start (5 min setup, not in video)

- Fresh wallet or one you control
- Sepolia ETH from Google Cloud faucet
- tCTC from Creditcoin Discord `#token-faucet`
- Browser: https://spark-defi.vercel.app
- Hard refresh (Ctrl+Shift+R)

---

## 0:00–0:25 — Problem

**Say:**

> Credit apps often cannot trust a payment that happened somewhere else without paperwork or a middleman. Spark fixes that on Creditcoin: we verify the payment, then credit opens automatically.

**Show:** Home page — “Pay once. Unlock credit.”

---

## 0:25–0:40 — Product

**Say:**

> Spark is collateralized credit on Creditcoin. You pay a deposit, we confirm it with Attestcoin Protocol, then your credit line opens. Repay closes it. Everything is on-chain and visible.

**Show:** Click **Help** in sidebar (optional 5 sec) or skip to connect.

---

## 0:40–0:55 — Connect

**Say:**

> Your wallet is your account. No separate signup.

**Do:** Connect wallet (top right). Show address chip.

---

## 0:55–1:35 — Pay deposit

**Say:**

> First I pay a small deposit on Sepolia. Spark will confirm the payment and open credit on Creditcoin.

**Do:**

1. **Pay deposit**
2. Amount: `0.01` ETH
3. Confirm in wallet (Sepolia)
4. Wait for “Payment confirmed” and auto verify (or tap **Verify payment & open credit**)

**Say while waiting:**

> Spark switches to Creditcoin and opens the line after verification. No manual proof upload in this demo build.

---

## 1:35–2:05 — Overview

**Say:**

> Here is the credit line: deposit locked, credit available, status active. This all lives on Creditcoin.

**Do:** Open **Overview**. Point at metrics and position bars.

---

## 2:05–2:25 — Payments

**Say:**

> Every step is tied to real transactions. Judges can open the explorer links.

**Do:** **Payments** → show deposit row with **View tx**.

---

## 2:25–2:50 — Repay (optional if time)

**Say:**

> To close the line, I repay on Sepolia. Spark verifies again and updates credit on Creditcoin.

**Do:** **Repay** → confirm flows → back to Overview (status Closed or repaid).

---

## 2:50–3:00 — Close

**Say:**

> Spark is DeFi lending on Creditcoin with Attestcoin-gated credit. Testnet today, but the flow is the same product logic we would ship. Repo and contracts are on GitHub. Thank you.

**Show:** Home or GitHub link in README.

---

## If something breaks

| Issue | What to say / do |
|---|---|
| Wrong network | “Spark will ask to switch. I approve in the wallet.” |
| Insufficient gas | “Need a little test ETH or tCTC from the faucets in Help.” |
| User rejected tx | “I cancelled in the wallet. I’ll try again.” |
| Site asks for Vercel login | Deployment protection is on. Disable in Vercel → Project → Deployment Protection (see [deploy-vercel.md](deploy-vercel.md)). |

---

## Recording tips

- 1080p browser window, dark mode matches app
- Zoom sidebar + main content, not full desktop
- Keep wallet popups in frame
- End with Overview + live URL on screen
