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
