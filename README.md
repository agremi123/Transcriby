# Parisly

Learn real Parisian French — listening, speaking, writing, and grammar challenges with Léa and Jules.

## Stack

- React 18
- Vite 6
- Tailwind CSS 3
- Framer Motion 11

## Development

```bash
cp .env.example .env   # then add your Speechmatics API key
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Speechmatics

Set `SPEECHMATICS_API_KEY` in `.env`. The Vite dev/preview server exposes `/api/speechmatics/jwt`, which mints short-lived tokens so the long-lived key never ships to the browser. The hero demo uses this for live French transcription via the microphone button.

## Build

```bash
npm run build
npm run preview
```

## Design source

The original HTML prototype lives in `.design-extract/2-0/` (from the Anthropic design API bundle). This project ports that design to a production-ready Vite app with ES modules.
