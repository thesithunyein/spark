# Deploy Spark app on free Vercel

1. Push this repo to GitHub
2. [vercel.com/new](https://vercel.com/new) → import repo
3. **Root Directory:** `app`
4. Framework: Next.js (auto)
5. Copy env from `app/.env.example` into Vercel Environment Variables
6. Deploy and set Production URL to `https://spark-defi.vercel.app` (see README badge)

## Notes

- Never add `PRIVATE_KEY` to Vercel
- Contracts deploy separately with Foundry from your machine
- Hobby tier is enough for the Next.js UI

## Deployment protection (judges must open the site)

If strangers see a Vercel login page instead of Spark:

1. Open [Vercel Dashboard](https://vercel.com) → project **spark** → **Settings** → **Deployment Protection**
2. Under **Vercel Authentication**, turn it **off** for Production, or set protection to **Preview only**
3. Save and test https://spark-defi.vercel.app in a logged-out browser

Hackathon submission copy and demo script: [docs/submission.md](submission.md), [docs/demo-script.md](demo-script.md).
