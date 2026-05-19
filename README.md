# Transcriby

Real-time speech transcription with AI word-level corrections for language learners.

**Stack:** Node.js + Express · Speechmatics RT API · Anthropic Claude · Supabase (auth + DB) · Stripe (subscriptions) · Vanilla HTML/CSS/JS

---

## How it works

1. User speaks into the microphone.
2. Raw PCM audio is streamed via WebSocket to **Speechmatics** — every word appears on screen verbatim as you speak (disfluencies kept, standard operating point).
3. Each finalised sentence is sent to **Claude** which returns a JSON array of word-level corrections `[{word, error, fix}]`.
4. Wrong words are underlined in red; the correction appears in green directly below.
5. Every sentence and its corrections are saved to **Supabase** for review later.

---

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in all values in `.env`:

| Variable | Where to get it |
|---|---|
| `SPEECHMATICS_API_KEY` | [portal.speechmatics.com](https://portal.speechmatics.com/) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| `SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API |
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_PUBLISHABLE_KEY` | Same page |
| `STRIPE_PRICE_ID` | Create a recurring product at [dashboard.stripe.com/products](https://dashboard.stripe.com/products) |
| `STRIPE_WEBHOOK_SECRET` | See webhook setup below |

### 3. Set up Supabase database

In your Supabase project, go to **SQL Editor** and run the contents of `supabase/schema.sql`.

### 4. Set up Stripe webhook (local dev)

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook signing secret it prints and put it in `STRIPE_WEBHOOK_SECRET`.

For production, create a webhook in the Stripe Dashboard pointing to `https://yourdomain.com/api/stripe/webhook` with these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 5. Run

```bash
# Development (auto-restarts on change)
npm run dev

# Production
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project structure

```
Transcriby/
├── server/
│   └── server.js          Express API server
├── js/
│   ├── auth.js            Supabase auth helpers
│   ├── transcribe.js      Speechmatics WebSocket + audio capture
│   ├── ui.js              Transcript rendering with corrections
│   └── app.js             App page orchestration
├── css/
│   └── style.css          All styles
├── supabase/
│   └── schema.sql         Database schema
├── audio-processor.js     AudioWorklet PCM processor
├── index.html             Landing page + auth
├── app.html               Main transcription app
├── package.json
└── .env.example
```

---

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/config` | — | Public Supabase + Stripe config for the client |
| GET | `/api/speechmatics-jwt` | ✓ + sub | Short-lived RT JWT for WebSocket auth |
| POST | `/api/correct` | ✓ + sub | Get Claude corrections for a sentence |
| GET | `/api/sessions` | ✓ | Fetch user's session history |
| GET | `/api/subscription-status` | ✓ | Check if subscription is active |
| POST | `/api/stripe/create-checkout` | ✓ | Create Stripe Checkout session |
| POST | `/api/stripe/webhook` | Stripe sig | Handle subscription lifecycle events |
