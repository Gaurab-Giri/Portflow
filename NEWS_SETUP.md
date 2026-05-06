# Live World News Setup

The News section fetches headlines (NewsAPI or RSS) and can summarize articles via Claude.

## 1. News headlines
Works without setup via RSS fallback. For NewsAPI (better images, sources):
- Sign up at [newsapi.org](https://newsapi.org)
- Add env var `NEWS_API_KEY` in Vercel

## 2. AI Summarize (optional)
To enable the "✦ Summarize" button on each card:
- Get an API key at [console.anthropic.com](https://console.anthropic.com)
- Add env var `ANTHROPIC_API_KEY` in Vercel

## 3. Deploy to Vercel
Both `/api/news` and `/api/summarize` run server-side.
1. Push your repo to GitHub
2. Import the project at [vercel.com](https://vercel.com)
3. **Project → Settings → Environment Variables** — add `NEWS_API_KEY` and/or `ANTHROPIC_API_KEY`

## 4. Local development
Run `npx vercel dev` to test API routes locally.
