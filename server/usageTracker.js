// ─────────────────────────────────────────────────────────────────────────────
// USAGE / COST TRACKER — logs one row per paid AI call (Anthropic, ElevenLabs,
// Deepgram, OpenAI TTS) to the Supabase `usage_events` table, tagged with the
// learner's email and the site action that triggered it.
//
// How it works, in plain terms:
//  - The Next.js route wrapper (lib/parisly-route.ts) stores { email, action }
//    in an AsyncLocalStorage context for the duration of each request.
//  - installUsageTracker() patches global fetch ONCE: any call to a paid AI
//    domain is passed through untouched, but its usage (tokens / characters /
//    seconds) is read on the side and priced.
//  - Logging is fire-and-forget: a failed insert can never break a request.
//
// The table (run once in the Supabase SQL editor):
//   create table if not exists usage_events (
//     id bigint generated always as identity primary key,
//     created_at timestamptz not null default now(),
//     user_email text,
//     action text,
//     provider text not null,
//     model text,
//     input_tokens integer,
//     output_tokens integer,
//     characters integer,
//     seconds real,
//     cost_usd numeric(12,6) not null default 0
//   );
//   alter table usage_events enable row level security;  -- service key bypasses
// ─────────────────────────────────────────────────────────────────────────────
import { AsyncLocalStorage } from 'node:async_hooks';
import { getSupabaseAdmin } from './supabase.js';

const als = new AsyncLocalStorage();

/** Run fn with { email, action } attached — every AI call inside is attributed. */
export function runWithUsageContext(ctx, fn) {
  return als.run(ctx || {}, fn);
}

// ── Pricing (USD). Adjust to your actual plans; these are standard rates. ────
const ANTHROPIC_PER_MTOK = {
  // model prefix → [input $/MTok, output $/MTok]
  'claude-haiku-4-5': [1.0, 5.0],
  'claude-sonnet': [3.0, 15.0],
  'claude-opus': [15.0, 75.0],
};
const ELEVENLABS_PER_CHAR = 0.00015; // ≈ $0.15 / 1k chars — set to your plan's rate
const DEEPGRAM_PER_MIN = 0.0043;     // nova-2 pay-as-you-go
const OPENAI_TTS_PER_CHAR = 0.000015; // tts-1: $15 / 1M chars

function anthropicCost(model, inTok, outTok) {
  const key = Object.keys(ANTHROPIC_PER_MTOK).find((k) => String(model || '').startsWith(k));
  const [pin, pout] = ANTHROPIC_PER_MTOK[key] || [1.0, 5.0];
  return (inTok * pin + outTok * pout) / 1e6;
}

// ── Row writer — fire-and-forget, never throws into the request path ────────
function logEvent(row) {
  const ctx = als.getStore() || {};
  const event = {
    user_email: ctx.email || null,
    action: ctx.action || null,
    ...row,
    cost_usd: Math.round((row.cost_usd || 0) * 1e6) / 1e6,
  };
  // Always visible in Vercel / dev logs, even before the table exists.
  console.log(`[usage] ${event.provider} action=${event.action || '?'} user=${event.user_email || '?'} cost=$${event.cost_usd}`);
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  supabase.from('usage_events').insert([event]).then(({ error }) => {
    if (error) console.warn('[usage] insert failed:', error.message);
  });
}

// ── Per-provider extractors ──────────────────────────────────────────────────
function trackAnthropic(res) {
  res.clone().json().then((d) => {
    const inTok = d?.usage?.input_tokens || 0;
    const outTok = d?.usage?.output_tokens || 0;
    if (!inTok && !outTok) return;
    logEvent({
      provider: 'anthropic', model: d.model || null,
      input_tokens: inTok, output_tokens: outTok,
      cost_usd: anthropicCost(d.model, inTok, outTok),
    });
  }).catch(() => {});
}

function trackElevenLabs(init) {
  try {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const chars = (body?.text || '').length;
    if (!chars) return;
    logEvent({ provider: 'elevenlabs', characters: chars, cost_usd: chars * ELEVENLABS_PER_CHAR });
  } catch {}
}

function trackDeepgram(res) {
  res.clone().json().then((d) => {
    const seconds = d?.metadata?.duration || 0;
    if (!seconds) return;
    logEvent({ provider: 'deepgram', seconds, cost_usd: (seconds / 60) * DEEPGRAM_PER_MIN });
  }).catch(() => {});
}

function trackOpenAiTts(init) {
  try {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const chars = (body?.input || '').length;
    if (!chars) return;
    logEvent({ provider: 'openai-tts', model: body?.model || 'tts-1', characters: chars, cost_usd: chars * OPENAI_TTS_PER_CHAR });
  } catch {}
}

// ── The fetch patch — installed once per process ─────────────────────────────
export function installUsageTracker() {
  if (globalThis.__parislyUsageTrackerInstalled) return;
  globalThis.__parislyUsageTrackerInstalled = true;
  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const res = await origFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (res.ok) {
        if (url.includes('api.anthropic.com')) trackAnthropic(res);
        else if (url.includes('api.elevenlabs.io')) trackElevenLabs(init);
        else if (url.includes('api.deepgram.com')) trackDeepgram(res);
        else if (url.includes('api.openai.com/v1/audio/speech')) trackOpenAiTts(init);
      }
    } catch { /* tracking must never break the call */ }
    return res;
  };
}
