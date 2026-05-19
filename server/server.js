require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Lazy singletons — initialised on first use so missing env vars surface as
// clear per-request errors instead of crashing the process at startup.
let _stripe = null;
let _anthropic = null;
let _supabaseAdmin = null;

function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set in .env');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function getOpenAI() {
  if (!_anthropic) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set in .env');
    _anthropic = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _anthropic;
}

function getSupabase() {
  if (!_supabaseAdmin) {
    if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is not set in .env');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in .env');
    _supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabaseAdmin;
}

// Stripe webhook needs raw body — register before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '..')));

// Log every API request + response status
app.use('/api', (req, res, next) => {
  const t = new Date().toLocaleTimeString();
  console.log(`[${t}] ${req.method} ${req.path}`);
  const orig = res.json.bind(res);
  res.json = (body) => {
    console.log(`[${t}] → ${res.statusCode} ${req.path}`, JSON.stringify(body).slice(0, 120));
    return orig(body);
  };
  next();
});

// ── Auth middleware ──────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await getSupabase().auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = user;
  next();
}

async function requireSubscription(req, res, next) {
  const { data } = await getSupabase()
    .from('subscriptions')
    .select('status')
    .eq('user_id', req.user.id)
    .single();

  if (!data || data.status !== 'active') {
    return res.status(403).json({ error: 'Active subscription required', code: 'NO_SUBSCRIPTION' });
  }
  next();
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/log  — browser sends errors here so they appear in the server terminal
 */
app.post('/api/log', (req, res) => {
  console.error(`[BROWSER ERROR] ${req.body?.message}`);
  if (req.body?.stack) console.error(req.body.stack);
  res.json({ ok: true });
});

/**
 * GET /api/config
 * Returns public client-side configuration (safe to expose).
 */
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:          process.env.SUPABASE_URL,
    supabaseAnonKey:      process.env.SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

/**
 * GET /api/subscription-status
 * Returns the current user's subscription status.
 */
app.get('/api/subscription-status', requireAuth, async (req, res) => {
  const { data } = await getSupabase()
    .from('subscriptions')
    .select('status, stripe_subscription_id')
    .eq('user_id', req.user.id)
    .single();

  res.json({
    active: data?.status === 'active',
    status: data?.status ?? 'none',
  });
});

/**
 * GET /api/speechmatics-jwt
 * Issues a short-lived Speechmatics RT JWT so the client can open a WebSocket
 * without exposing the permanent API key in the browser.
 */
app.get('/api/speechmatics-jwt', requireAuth, requireSubscription, async (req, res) => {
  try {
    const response = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 3600 }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Speechmatics error ${response.status}: ${text}`);
    }

    const data = await response.json();
    res.json({ jwt: data.key_value });
  } catch (err) {
    console.error('[speechmatics-jwt]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/correct
 * Body: { sentence: string }
 * Sends the finalised sentence to Claude and returns word-level corrections.
 * Also persists the session entry to Supabase.
 */
app.post('/api/correct', requireAuth, requireSubscription, async (req, res) => {
  const { sentence } = req.body ?? {};
  if (!sentence?.trim()) return res.json({ corrections: [] });

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a language teaching assistant. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Analyse this sentence spoken by a language learner and identify grammar or vocabulary errors. Do not correct natural hesitations or regional accents — only clear grammatical or lexical mistakes.

Return a JSON object with a single key "corrections" whose value is an array. Each element:
{"word": "<exact word as spoken>", "error": "<brief error type>", "fix": "<corrected word or phrase>"}

Only include words that contain errors. If there are no errors return {"corrections": []}.

Spoken sentence: "${sentence.replace(/"/g, '\\"')}"`,
        },
      ],
    });

    let corrections = [];
    try {
      const parsed = JSON.parse(completion.choices[0].message.content);
      corrections = Array.isArray(parsed.corrections) ? parsed.corrections : [];
    } catch {
      corrections = [];
    }

    // Persist session (non-blocking — fire and forget)
    getSupabase().from('sessions').insert({
      user_id: req.user.id,
      sentence,
      corrections,
    }).then(({ error }) => {
      if (error) console.error('[sessions insert]', error.message);
    });

    res.json({ corrections });
  } catch (err) {
    console.error('[correct]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stripe/create-checkout
 * Creates a Stripe Checkout Session for a monthly subscription and returns the URL.
 */
app.post('/api/stripe/create-checkout', requireAuth, async (req, res) => {
  try {
    let customerId;
    const { data: existing } = await getSupabase()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.user.id)
      .single();

    if (existing?.stripe_customer_id) {
      customerId = existing.stripe_customer_id;
    } else {
      const customer = await getStripe().customers.create({
        email: req.user.email,
        metadata: { supabase_uid: req.user.id },
      });
      customerId = customer.id;
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.APP_URL}/app.html?checkout=success`,
      cancel_url: `${process.env.APP_URL}/app.html?checkout=cancelled`,
      metadata: { supabase_uid: req.user.id },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stripe/webhook
 * Listens for Stripe events to keep subscription status in sync.
 */
app.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook]', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const uid = obj.metadata?.supabase_uid;
    if (uid) {
      await getSupabase().from('subscriptions').upsert(
        {
          user_id: uid,
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.subscription,
          status: 'active',
        },
        { onConflict: 'user_id' }
      );
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const status = obj.status === 'active' ? 'active' : 'inactive';
    await getSupabase()
      .from('subscriptions')
      .update({ status })
      .eq('stripe_subscription_id', obj.id);
  }

  if (event.type === 'customer.subscription.deleted') {
    await getSupabase()
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('stripe_subscription_id', obj.id);
  }

  res.json({ received: true });
});

/**
 * GET /api/sessions
 * Returns the authenticated user's 50 most recent session entries.
 */
app.get('/api/sessions', requireAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from('sessions')
    .select('id, sentence, corrections, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ sessions: data });
});

// ── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n🎙  Transcriby running → http://localhost:${PORT}\n`);
});

