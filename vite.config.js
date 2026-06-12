import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { handleElevenLabsTts } from './server/handlers.js';
import { resolveNarrator, saveNarratorAudio, narratorStoragePath } from './server/narrator-audio-cache.js';
import { getSupabaseAdmin } from './server/supabase.js';
import { sendHandlerResult } from './server/node-response.js';
import { buildCorrectionSystemPrompts } from './server/correctionPrompts.js';
import { sanitizeParisianCorrection, parseCorrectionResponse } from './src/lib/correctionFormat.js';

// ── Dev token tracker ──────────────────────────────────────────────────────
const DEV_COSTS_FILE = new URL('./data/dev-costs.json', import.meta.url).pathname;
let _persisted = { log: [], cacheLog: [] };
try { _persisted = JSON.parse(readFileSync(DEV_COSTS_FILE, 'utf8')); } catch {}

const DEV_LOG   = _persisted.log      || []; // { ts, label, model, inputTokens, outputTokens, cost }
const CACHE_LOG = _persisted.cacheLog || []; // { ts, endpoint, source: 'database'|'generated', level, fields }
const SESSION_START = Date.now(); // used to split all-time vs this-session stats

function persistDevCosts() {
  try { writeFileSync(DEV_COSTS_FILE, JSON.stringify({ log: DEV_LOG, cacheLog: CACHE_LOG })); } catch {}
}

const HAIKU_IN_PER_M     = 0.80;
const HAIKU_OUT_PER_M    = 4.00;
const SONNET_IN_PER_M    = 3.00;
const SONNET_OUT_PER_M   = 15.00;
const DEEPSEEK_IN_PER_M  = 0.27;  // DeepSeek-V3 via OpenRouter
const DEEPSEEK_OUT_PER_M = 1.10;

function modelCost(model, inputTokens, outputTokens) {
  let inRate, outRate;
  if (model.includes('perplexity') || model.includes('sonar')) { inRate = PERPLEXITY_IN_PER_M; outRate = PERPLEXITY_OUT_PER_M; }
  else if (model.includes('deepseek')) { inRate = DEEPSEEK_IN_PER_M; outRate = DEEPSEEK_OUT_PER_M; }
  else if (model.includes('haiku')) { inRate = HAIKU_IN_PER_M; outRate = HAIKU_OUT_PER_M; }
  else { inRate = SONNET_IN_PER_M; outRate = SONNET_OUT_PER_M; }
  return (inputTokens / 1e6) * inRate + (outputTokens / 1e6) * outRate;
}

async function claudeCall(label, apiKey, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const inputTokens  = data.usage?.input_tokens  || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const cost = modelCost(body.model || '', inputTokens, outputTokens);
  DEV_LOG.push({ ts: Date.now(), label, model: body.model || '', inputTokens, outputTokens, cost });
  if (DEV_LOG.length > 2000) DEV_LOG.shift();
  persistDevCosts();
  console.log(`[dev] ${label} — in:${inputTokens} out:${outputTokens} $${cost.toFixed(5)}`);
  return data;
}

// OpenRouter — OpenAI-compatible, supports DeepSeek + Perplexity + others
const DEEPSEEK_MODEL = 'deepseek/deepseek-chat-v3-0324';
const PERPLEXITY_IN_PER_M  = 0.20;
const PERPLEXITY_OUT_PER_M = 0.20;
async function openrouterCall(label, apiKey, { system, messages, max_tokens = 1000, model = DEEPSEEK_MODEL }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://nativa.app',
      'X-Title': 'Nativa',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
    }),
  });
  const data = await res.json();
  const inputTokens  = data.usage?.prompt_tokens     || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = modelCost(model, inputTokens, outputTokens);
  DEV_LOG.push({ ts: Date.now(), label, model, inputTokens, outputTokens, cost });
  if (DEV_LOG.length > 2000) DEV_LOG.shift();
  persistDevCosts();
  console.log(`[dev/openrouter:${model.split('/')[0]}] ${label} — in:${inputTokens} out:${outputTokens} $${cost.toFixed(5)}`);
  // Normalise to Claude-like shape so callers can do data.content?.[0]?.text
  const text = data.choices?.[0]?.message?.content || '';
  return { content: [{ type: 'text', text }], _raw: data };
}

function devStatsMiddleware() {
  return (req, res, next) => {
    if (req.url !== '/api/dev-stats' || req.method !== 'GET') { next(); return; }
    // This-session entries only
    const sessionLog = DEV_LOG.filter(e => e.ts >= SESSION_START);
    const totIn   = sessionLog.reduce((s, e) => s + e.inputTokens,  0);
    const totOut  = sessionLog.reduce((s, e) => s + e.outputTokens, 0);
    const totCost = sessionLog.reduce((s, e) => s + e.cost, 0);
    const byLabel = {};
    for (const e of sessionLog) {
      if (!byLabel[e.label]) byLabel[e.label] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      byLabel[e.label].calls++;
      byLabel[e.label].inputTokens  += e.inputTokens;
      byLabel[e.label].outputTokens += e.outputTokens;
      byLabel[e.label].cost         += e.cost;
    }
    // All-time totals
    const allTimeCost      = DEV_LOG.reduce((s, e) => s + e.cost, 0);
    const allTimeCallCount = DEV_LOG.length;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ totIn, totOut, totCost, byLabel, log: sessionLog.slice(-50), allTimeCost, allTimeCallCount, cacheLog: CACHE_LOG.slice(-100) }));
  };
}
// ────────────────────────────────────────────────────────────────────────────

function readEnvFile(dir) {
  try {
    const content = readFileSync(resolve(dir, '.env'), 'utf8');
    return Object.fromEntries(
      content.split('\n')
        .filter((line) => line.includes('=') && !line.startsWith('#'))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function extractCorrectedFromRaw(raw, fallback = '') {
  if (!raw || typeof raw !== 'string') return fallback;

  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.corrected === 'string' && parsed.corrected.trim()) {
      return parsed.corrected.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    }
  } catch {
    // fall through
  }

  const match = cleaned.match(/"corrected"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
  if (match?.[1]) {
    try {
      return JSON.parse(`"${match[1]}"`).trim();
    } catch {
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    }
  }

  if (cleaned.startsWith('{')) return fallback;
  return cleaned || fallback;
}

function deepgramKeyMiddleware(apiKey) {
  return (req, res, next) => {
    if (req.url !== '/api/deepgram/key' || req.method !== 'GET') {
      next();
      return;
    }
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'DEEPGRAM_API_KEY is not configured' }));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ key: apiKey }));
  };
}

function speechmaticsKeyMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/speechmatics/key' || req.method !== 'GET') {
      next();
      return;
    }
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'SPEECHMATICS_API_KEY is not configured' }));
      return;
    }
    try {
      // Exchange the static API key for a short-lived RT JWT
      const tokenRes = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ttl: 3600 }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        res.statusCode = tokenRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Speechmatics token error: ${err}` }));
        return;
      }
      const { key_value } = await tokenRes.json();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ key: key_value }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
  };
}

function ttsMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/tts' || req.method !== 'POST') { next(); return; }

    let text = '', voice = 'nova';
    try {
      const body = JSON.parse(await readBody(req));
      text = body.text || '';
      // narrator: 'jules' → onyx (deep male), 'lea' → nova (warm female)
      if (body.narrator === 'jules') voice = 'onyx';
      else if (body.voice) voice = body.voice;
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!apiKey || !text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing TTS configuration' }));
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        res.statusCode = response.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err }));
        return;
      }

      const buf = await response.arrayBuffer();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.end(Buffer.from(buf));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  };
}

function correctionMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/correct' || req.method !== 'POST') {
      next();
      return;
    }

    let text = '';
    let register = 'Standard';
    let assessOnly = false;
    let interviewReport = false;
    let dimensionBreakdown = false;
    let claimedLevel = '';
    try {
      const body = JSON.parse(await readBody(req));
      text = body.text || '';
      register = body.register || 'Standard';
      assessOnly = !!body.assessOnly;
      interviewReport = !!body.interviewReport;
      dimensionBreakdown = !!body.dimensionBreakdown;
      claimedLevel = body.claimedLevel || '';
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!apiKey || !text) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected: text }));
      return;
    }

    if (assessOnly) {
      try {
        if (dimensionBreakdown) {
          const dimensionPrompt = `You are a French language expert. Assess this spoken French answer on three dimensions separately. Clarity = how clear and understandable the response is. Grammar = grammatical accuracy (verbs, agreements, tenses). Vocabulary = range and appropriateness of word choice. Return raw JSON only, no markdown: {"clarity":"B1","grammar":"A2","vocabulary":"B1"}. Each value must be exactly one of: A1, A2, B1, B2, C1, C2.`;
          const data = await claudeCall('correct/dimension-assessment', apiKey, {
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 80,
              system: dimensionPrompt,
              messages: [{ role: 'user', content: text }],
          });
          let raw = data.content?.[0]?.text?.trim() || '{}';
          raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          let clarity = null;
          let grammar = null;
          let vocabulary = null;
          try { ({ clarity, grammar, vocabulary } = JSON.parse(raw)); } catch {}
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ clarity, grammar, vocabulary }));
          return;
        }

        const isInterviewReport = interviewReport;
        const data = await claudeCall(isInterviewReport ? 'correct/interview-report' : 'correct/assess', apiKey, {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: isInterviewReport ? 950 : 120,
            system: isInterviewReport
              ? `You are Léa and Jules, Parisian French coaches. A learner claimed CEFR level ${claimedLevel || 'unknown'} and answered interview questions in French. Assess their spoken French holistically. Return raw JSON only, no markdown: {"overallLevel":"B1","overallScore":72,"learnerGender":"woman","summary":"","strengths":[{"label":"Vocabulary Variety","hint":"Range and precision of word choice","score":78},{"label":"Accent & pronunciation","hint":"How natural you sound","score":74},{"label":"Flow and rhythm","hint":"Pace and continuity when you speak","score":68},{"label":"Listening skills","hint":"Following spoken French","score":66}],"weaknesses":[{"label":"Grammar accuracy","hint":"Verb forms, agreements, tenses","score":44},{"label":"Parisian style","hint":"Local register vs textbook French","score":40},{"label":"Conjugation skills","hint":"Verb forms in context","score":46},{"label":"Cultural Understanding","hint":"References, tone, and local context","score":38}]}. Include exactly 4 strengths and 4 weaknesses. Use ONLY these exact labels (do not invent new ones): Grammar accuracy, Vocabulary Variety, Parisian style, Conjugation skills, Accent & pronunciation, Flow and rhythm, Listening skills, Cultural Understanding. Each label may appear at most once in the whole response. Each score is 0-100 (higher is better). Strength scores typically 58-92. Weakness scores typically 28-58. overallScore is 0-100. overallLevel is A1, A2, B1, B2, C1, or C2. learnerGender must be "woman" or "man" — infer from how the learner speaks about themselves (adjective/participle agreement, je suis né/née, je suis content/contente, etc.). summary may be empty. Keep hints under 8 words.`
              : 'You are a French language expert. Assess the overall CEFR level of the spoken French (A1, A2, B1, B2, C1, or C2). Identify one key strength. Then give one concrete actionable tip specifically targeting the NEXT level up (A1→A2, A2→B1, B1→B2, B2→C1, C1→C2). The tip must be relevant to bridging exactly that gap. Respond with raw JSON only, no markdown: {"level":"B1","strength":"...","weakness":"..."}. Keep strength and weakness to max 7 words each. The "weakness" field must be a short positive actionable advice (e.g. "Practise subjunctive mood daily"), never a problem description.',
            messages: [{ role: 'user', content: text }],
        });
        let raw = data.content?.[0]?.text?.trim() || '{}';
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        if (isInterviewReport) {
          let overallLevel = null;
          let overallScore = null;
          let summary = null;
          let learnerGender = null;
          let strengths = [];
          let weaknesses = [];
          try {
            ({ overallLevel, overallScore, summary, learnerGender, strengths, weaknesses } = JSON.parse(raw));
          } catch {}
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            overallLevel,
            overallScore,
            summary,
            learnerGender,
            strengths: Array.isArray(strengths) ? strengths : [],
            weaknesses: Array.isArray(weaknesses) ? weaknesses : [],
          }));
          return;
        }
        let level = null, strength = null, weakness = null;
        try { ({ level, strength, weakness } = JSON.parse(raw)); } catch {}
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ level, strength, weakness }));
      } catch {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(interviewReport
          ? { overallLevel: null, overallScore: null, summary: null, learnerGender: null, strengths: [], weaknesses: [] }
          : { level: null }));
      }
      return;
    }

    const systemPrompts = buildCorrectionSystemPrompts();
    const system = systemPrompts[register] || systemPrompts.Parisien;

    try {
      const data = await claudeCall('correct/correction', apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(1400, 240 + Math.ceil(text.length / 2.5)),
        system,
        messages: [{ role: 'user', content: text }],
      });
      let raw = data.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = parseCorrectionResponse(raw, text);
      const corrected = sanitizeParisianCorrection(parsed.corrected);
      const translation = parsed.translation;
      let level = null;
      try {
        const json = JSON.parse(raw);
        level = json.level || null;
      } catch {
        const levelMatch = raw.match(/"level"\s*:\s*"([A-C][12])"/);
        if (levelMatch) level = levelMatch[1];
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected, translation, level }));
    } catch {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected: text, translation: null, level: null }));
    }
  };
}

// ElevenLabs — Léa & Jules (word discovery voice ids)
const ELEVENLABS_VOICES = {
  lea: 'ebRwkdEFVZIx2A6YucFh',
  alex: 'n1u6R6yj3qEpDLH3liBh',
};

function elevenLabsTtsMiddleware(_apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/elevenlabs-tts' || req.method !== 'POST') { next(); return; }
    try {
      const body = JSON.parse(await readBody(req));
      const result = await handleElevenLabsTts(body);
      sendHandlerResult(res, result);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  };
}

function interviewFeedbackMiddleware() {
  const FILE = resolve(process.cwd(), 'data', 'interview-feedback.json');
  const DEFAULT_FILE = resolve(process.cwd(), 'data', 'interview-feedback.json');

  function readStore() {
    try {
      if (existsSync(FILE)) {
        return JSON.parse(readFileSync(FILE, 'utf8'));
      }
    } catch (err) {
      console.warn('[interview-feedback] read failed:', err.message);
    }
    return null;
  }

  function writeStore(data) {
    try {
      const dir = resolve(process.cwd(), 'data');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn('[interview-feedback] write failed:', err.message);
    }
  }

  function loadStore() {
    let store = readStore();
    if (!store) {
      store = JSON.parse(readFileSync(DEFAULT_FILE, 'utf8'));
      writeStore(store);
    }
    return store;
  }

  return async (req, res, next) => {
    if (req.url !== '/api/interview-feedback') {
      next();
      return;
    }

    if (req.method === 'GET') {
      const store = loadStore();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(store));
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { questionId, judgment } = body;
        if (!questionId || !Array.isArray(judgment) || judgment.length === 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'questionId and judgment[] required' }));
          return;
        }
        const store = loadStore();
        store[questionId] = {
          ...store[questionId],
          judgment,
        };
        writeStore(store);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, questionId }));
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      return;
    }

    next();
  };
}

// The narrator's spoken explanation for a Parisian word (deterministic so its
// TTS audio can be pre-generated and cached in the narrator-audio bucket).
function buildWordIntro(w) {
  return `Voici ton mot parisien du jour : « ${w.word} ». Ça veut dire "${w.meaning}". Par exemple : "${w.example}". Essaie maintenant de l'utiliser dans une phrase !`;
}

// Deterministic narrator per word so the pre-warmed audio always matches.
function narratorForWord(word) {
  let h = 0;
  for (const c of String(word)) h = (h * 31 + c.codePointAt(0)) | 0;
  return Math.abs(h) % 2 === 0 ? 'lea' : 'jules';
}

function wordMiddleware(anthropicKey, elevenLabsKey, supabaseUrl, supabaseKey, openrouterKey) {
  const AUDIO_DIR = resolve(process.cwd(), 'public', 'word-audio');
  let supabase = null;

  // Initialize Supabase if credentials provided
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }

  // Ensure audio dir exists
  try {
    if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  } catch {}

  async function saveEntry(entry) {
    if (!supabase) {
      console.warn('[word] Supabase not configured, skipping save');
      return;
    }
    try {
      let { error } = await supabase
        .from('parisian_words')
        .insert([entry]);
      // Migration 008 not run yet → retry without the new columns
      if (error && /explanation|narratorid/i.test(error.message || '')) {
        const { explanation, narratorid, ...legacy } = entry;
        ({ error } = await supabase.from('parisian_words').insert([legacy]));
      }
      if (error) console.error('[word] Supabase insert error:', error);
    } catch (err) {
      console.error('[word] Failed to save entry to Supabase:', err);
    }
  }

  // Generate one new word (DeepSeek + ElevenLabs audio) and save it to the stock.
  // Used synchronously when the stock is empty, and fire-and-forget to restock.
  async function generateAndSaveWord(avoidWords = []) {
    const avoid = avoidWords.length ? ` Avoid these words already taught: ${avoidWords.slice(0, 60).join(', ')}.` : '';
    const claudeData = await openrouterCall('word/generate', openrouterKey, {
      max_tokens: 250,
      system: 'You are a French language teacher specializing in authentic Parisian French. Pick a vivid, interesting French word or expression — something a Parisian would actually say, not too basic, not too rare. Provide: the word/expression, its short English meaning, one natural example sentence in French, and an English translation of that sentence. Respond with raw JSON only, no markdown: {"word":"...","meaning":"...","example":"...","exampleTranslation":"..."}',
      messages: [{ role: 'user', content: `Give me an interesting Parisian French word to learn today.${avoid}` }],
    });
    let raw = claudeData.content?.[0]?.text?.trim() || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw);
    if (!parsed.word) throw new Error('No word generated');

    let audioUrl = null;
    if (elevenLabsKey && parsed.example) {
      try {
        const elRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICES.lea}`,
          {
            method: 'POST',
            headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({
              text: parsed.example,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true },
            }),
          }
        );
        if (elRes.ok) {
          const audioBuf = Buffer.from(await elRes.arrayBuffer());
          const fileName = `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`;
          writeFileSync(resolve(AUDIO_DIR, fileName), audioBuf);
          audioUrl = `/word-audio/${fileName}`;
        }
      } catch {}
    }

    // Pre-warm the narrator's explanation audio in the narrator-audio bucket
    // so "Discover a Parisian word" plays it with zero loading time.
    const narratorId = narratorForWord(parsed.word);
    const explanation = buildWordIntro(parsed);
    if (elevenLabsKey) {
      try {
        const { slug, voiceId } = resolveNarrator(narratorId);
        const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: explanation,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true },
          }),
        });
        if (elRes.ok) await saveNarratorAudio(slug, voiceId, explanation, Buffer.from(await elRes.arrayBuffer()));
      } catch {}
    }

    // parisian_words columns are all lowercase in Postgres
    const entry = {
      id: Date.now(),
      word: parsed.word,
      meaning: parsed.meaning,
      example: parsed.example,
      exampletranslation: parsed.exampleTranslation || '',
      voiceid: ELEVENLABS_VOICES.lea,
      audiourl: audioUrl,
      createdat: new Date().toISOString(),
      explanation,
      narratorid: narratorId,
    };
    try {
      await saveEntry(entry);
    } catch {}
    return { ...parsed, audioUrl, explanation, narratorId };
  }

  return async (req, res, next) => {
    if (req.url !== '/api/word' || req.method !== 'POST') { next(); return; }
    if (!anthropicKey) {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ word: null })); return;
    }
    try {
      // 1. Try to load cached words from Supabase
      let cachedWords = [];
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('parisian_words')
            .select('*');
          if (!error && data) {
            cachedWords = data;
          }
        } catch (err) {
          console.warn('[word] Failed to fetch cached words from Supabase:', err);
        }
      }

      // 2. Stock-first: always serve instantly from DB, restock in background
      let parsed;

      if (cachedWords.length > 0) {
        const cached = cachedWords[Math.floor(Math.random() * cachedWords.length)];
        parsed = {
          word: cached.word,
          meaning: cached.meaning,
          example: cached.example,
          exampleTranslation: cached.exampletranslation ?? cached.exampleTranslation ?? '',
          audioUrl: cached.audiourl ?? cached.audioUrl ?? null,
          explanation: cached.explanation || buildWordIntro(cached),
          narratorId: cached.narratorid || narratorForWord(cached.word),
        };
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(parsed));
        // Background top-up so the stock keeps growing — never blocks the response
        generateAndSaveWord(cachedWords.map(w => w.word)).catch(() => {});
        return;
      }

      // 3. Empty stock: generate synchronously (first run only)
      parsed = await generateAndSaveWord();
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(parsed));
    } catch {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ word: null }));
    }
  };
}

const FRENCH_RSS_FEEDS = [
  { name: 'Le Monde',    url: 'https://www.lemonde.fr/rss/une.xml' },
  { name: 'France Info', url: 'https://www.francetvinfo.fr/titres.rss' },
  { name: 'Le Figaro',   url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { name: '20 Minutes',  url: 'https://www.20minutes.fr/feeds/rss/actu.xml' },
  { name: 'Libération',  url: 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml' },
  { name: "L'Obs",       url: 'https://www.nouvelobs.com/rss.xml' },
  { name: 'RFI',         url: 'https://www.rfi.fr/fr/rss-podcasts-emissions.xml' },
];

function rssExtractCdata(str) {
  const m = str.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : str.replace(/<[^>]+>/g, '').trim();
}
function rssStripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function rssDecodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
async function fetchArticleBody(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return '';
    const html = await res.text();
    // Extract text from <p> tags — skip nav/script/style noise
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
    const paragraphs = [];
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pRe.exec(bodyMatch)) !== null) {
      const text = rssStripHtml(pm[1]);
      if (text.length > 40) paragraphs.push(text);
    }
    return paragraphs.join(' ').slice(0, 6000);
  } catch { return ''; }
}
function parseRssItems(xml, feedName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const found = block.match(r);
      return found ? rssExtractCdata(found[1]) : '';
    };
    const title       = rssDecodeEntities(get('title'));
    const description = rssDecodeEntities(rssStripHtml(get('description') || get('summary')));
    const content     = rssDecodeEntities(rssStripHtml(get('content:encoded') || get('content')));
    const link        = get('link') || block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
    const pubDate     = get('pubDate') || get('dc:date') || '';
    const author      = rssDecodeEntities(get('dc:creator') || get('author') || '');
    if (title || description) items.push({ title, description, content, link, pubDate, author, feedName });
  }
  return items;
}
async function fetchRssFeed(feed) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml, feed.name);
  } catch { return []; }
}

function readingMiddleware(apiKey, openrouterKey) {
  const DATA_DIR = resolve(process.cwd(), 'data');
  const SESSIONS_FILE = resolve(DATA_DIR, 'reading-sessions.json');

  function loadSessions() {
    try {
      if (existsSync(SESSIONS_FILE)) return JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'));
    } catch {}
    return [];
  }

  function saveSession(session) {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      const sessions = loadSessions();
      sessions.unshift(session);
      writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    } catch (err) {
      console.warn('[reading] save failed:', err.message);
    }
  }

  return async (req, res, next) => {
    if (req.url !== '/api/reading' || req.method !== 'POST') { next(); return; }
    let topic = '';
    try {
      const body = JSON.parse(await readBody(req));
      topic = body.topic || '';
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
    }
    if (!topic) {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ passage: '', source: null, questions: [] })); return;
    }
    try {
      // Step 1: fetch all RSS feeds in parallel
      const feedResults = await Promise.all(FRENCH_RSS_FEEDS.map(fetchRssFeed));
      const allItems = feedResults.flat().filter(i => i.title && (i.description || i.content));
      if (allItems.length === 0) throw new Error('No RSS items fetched');

      // Step 2: pick a relevant article LOCALLY (no slow ~6k-token AI call).
      // Score by how many topic keywords appear in title/description, then pick
      // randomly among the best-scoring (or any substantial item if no match).
      const stop = new Set(['le','la','les','un','une','des','de','du','et','en','à','au','aux','pour','sur','dans','the','a','of']);
      const kw = String(topic).toLowerCase().split(/[^a-zà-ÿ]+/).filter(w => w.length > 2 && !stop.has(w));
      const substantial = allItems.filter(i => (i.description || i.content || '').length > 120);
      const pool = substantial.length ? substantial : allItems;
      const scored = pool.map(i => {
        const hay = `${i.title} ${i.description || ''}`.toLowerCase();
        return { i, score: kw.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
      });
      // Order by topic relevance (best score first), random tie-break.
      const ordered = scored.slice().sort((a, b) => b.score - a.score || Math.random() - 0.5).map(s => s.i);

      // Step 3: fetch the top candidates' bodies IN PARALLEL and pick a FULL one
      // (>= 1500 chars) so we never serve a half-baked / stub article.
      const MIN_BODY = 1500;
      const cands = ordered.slice(0, 5);
      const fetched = await Promise.all(cands.map(async (c) => {
        let body = '';
        if (c.link) { try { body = await fetchArticleBody(c.link); } catch { body = ''; } }
        if (body.length < 200) body = (c.content || c.description || '');
        return { c, body };
      }));
      const fullOnes = fetched.filter(f => f.body.length >= MIN_BODY);
      const picked = fullOnes[0] || fetched.slice().sort((a, b) => b.body.length - a.body.length)[0];
      const chosen = picked.c;
      let rawText = (picked.body || '').slice(0, 6000);

      // Extract a long verbatim passage — enough for 2 reading pages (~400-600 words).
      // Uses fast Claude Haiku (DeepSeek was ~10-15s/call and made reading feel endless).
      const extractData = await claudeCall('reading/extract', apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: 'Extract the most coherent and readable passage from this real French article. Copy sentences verbatim — do NOT rephrase, summarise or add anything. The passage must be at least 15 sentences long (aim for 400-600 words). Organise it into natural paragraphs separated by a blank line (\\n\\n): one short intro paragraph, then 2-3 body paragraphs. Return only the extracted French text with paragraph breaks. If the article is shorter than that, simply extract everything available — NEVER apologize, comment, or add headers/separators; output ONLY French article text.',
        messages: [{ role: 'user', content: `Title: ${chosen.title}\n\n${rawText}` }],
      });
      // Clean the extraction: drop markdown headers, "---" separators, and any
      // English model commentary/refusal ("I apologize, but I cannot…") that
      // would otherwise leak into the article.
      const passage = (extractData.content?.[0]?.text || '')
        .split('\n')
        .filter(line => !/^\s*#/.test(line) && !/^\s*-{3,}\s*$/.test(line))
        .join('\n')
        .replace(/(?:^|\n)[^\n]*\b(?:I apologize|I cannot|I'm sorry|I am sorry|as an AI)\b[\s\S]*$/i, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!passage || passage.length < 100) throw new Error('No passage extracted');

      // Steps 4 & 5: comprehension questions + vocabulary IN PARALLEL
      const [qData, vData] = await Promise.all([
        claudeCall('reading/questions', apiKey, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1600,
          system: `Create exactly 6 multiple-choice comprehension questions (in French) about the French passage. Each has 4 options and one correct answer. For each, add "explanation": one or two clear ENGLISH sentences explaining why the correct answer is right and why the other options are wrong. Return ONLY raw JSON, no markdown: {"questions":[{"question":"Question en français ?","options":["A","B","C","D"],"answer":"A","explanation":"In English: A is correct because…; the others are wrong because…"}]}`,
          messages: [{ role: 'user', content: passage }],
        }),
        claudeCall('reading/vocab', apiKey, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system: `From the given French passage, pick exactly 5 difficult or interesting vocabulary words. For each: "definition" MUST be the English translation/meaning (in English, not French), and write a NEW French sentence with the word replaced by ___. Return ONLY raw JSON: {"vocab":[{"word":"French word","definition":"English meaning","sentence":"...___..."}]}`,
          messages: [{ role: 'user', content: passage }],
        }),
      ]);
      let qRaw = (qData.content?.[0]?.text || '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let questions = [];
      try { ({ questions = [] } = JSON.parse(qRaw)); } catch {}
      let vRaw = (vData.content?.[0]?.text || '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let vocab = [];
      try { ({ vocab = [] } = JSON.parse(vRaw)); } catch {}

      const { title, feedName: source, author, pubDate: date, link } = chosen;
      saveSession({ id: Date.now(), topic, title, passage, source, author, date, link, questions, vocab, createdAt: new Date().toISOString() });

      // Save every generated article to Supabase (fire-and-forget)
      const sb = getSupabaseAdmin();
      if (sb) {
        sb.from('reading_articles')
          .insert([{ title, passage, source, author, date, link, questions, vocab }])
          .then(({ error }) => { if (error) console.error('[reading] Supabase insert error:', error.message); });
      } else {
        console.warn('[reading] Supabase not configured, article not saved to DB');
      }

      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title, passage, source, author, date, link, questions, vocab }));
    } catch (err) {
      console.error('[reading] error:', err.message);
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ passage: '', source: null, questions: [] }));
    }
  };
}

function practiceMiddleware(apiKey, openrouterKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/practice' || req.method !== 'POST') { next(); return; }
    let topic = '';
    try {
      const body = JSON.parse(await readBody(req));
      topic = body.topic || '';
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
    }
    if (!apiKey || !topic) {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ exercises: [] })); return;
    }
    try {
      const data = await openrouterCall('practice/exercises', openrouterKey, {
        max_tokens: 600,
        system: `You are a French language teacher. Generate exactly 4 fill-in-the-blank exercises in French to practice: "${topic}". Each sentence must have exactly one blank marked as "___". For each exercise include a "hint" field: if the answer is a conjugated verb, put the infinitive form (e.g. "aller"); for other words put the base/dictionary form. Respond with raw JSON only, no markdown: {"exercises":[{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."}]}`,
        messages: [{ role: 'user', content: `Generate 4 fill-in-the-blank French exercises for: ${topic}` }],
      });
      let raw = data.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(raw);
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ exercises: parsed.exercises || [] }));
    } catch {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ exercises: [] }));
    }
  };
}

// In-memory store for session-scoped generated audio
const SESSION_AUDIO = new Map();

function sessionAudioMiddleware() {
  return (req, res, next) => {
    if (!req.url.startsWith('/api/audio-session/')) { next(); return; }
    const id = decodeURIComponent(req.url.split('/api/audio-session/')[1] || '');
    const buf = SESSION_AUDIO.get(id);
    if (!buf) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.end(buf);
  };
}

// Max bytes for a ~3-minute audio clip at common podcast bitrates:
// 128kbps → 3MB ≈ 3 min | 64kbps → 3MB ≈ 6 min | 192kbps → 3MB ≈ 2 min
const AUDIO_MAX_BYTES = 3_000_000;

const CLIP_SECONDS = 150; // 2 min 30 sec target clip length
const DOWNLOAD_BYTES = 8_000_000; // download 8 MB — enough for 5+ min at 128 kbps
const LISTENING_TARGET = 5; // episodes kept in stock per level (restocked in background)

/**
 * Downloads the first DOWNLOAD_BYTES of an audio URL and trims it to
 * exactly CLIP_SECONDS using ffmpeg. Returns a Buffer of the MP3 output.
 */
async function makeAudioClip(audioUrl) {
  const r = await fetch(audioUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Range': `bytes=0-${DOWNLOAD_BYTES - 1}` },
    signal: AbortSignal.timeout(25000),
  });
  const rawBuf = Buffer.from(await r.arrayBuffer());

  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const inPath = join(tmpdir(), `nativa-in-${id}`);
  const outPath = join(tmpdir(), `nativa-out-${id}.mp3`);

  writeFileSync(inPath, rawBuf);

  await new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      ['-y', '-i', inPath, '-t', String(CLIP_SECONDS), '-c:a', 'libmp3lame', '-q:a', '5', '-ar', '44100', outPath],
      { timeout: 30000 },
      (err) => { if (err) reject(err); else resolve(); }
    );
  });

  const trimmed = readFileSync(outPath);
  try { unlinkSync(inPath); } catch {}
  try { unlinkSync(outPath); } catch {}
  return trimmed;
}

/**
 * Transcribes an audio buffer using Deepgram nova-2 (French).
 * Returns { transcript: string, wordTimings: [{start, end}] } on success, null on failure.
 */
async function deepgramTranscribe(audioBuffer, deepgramKey) {
  if (!deepgramKey || !audioBuffer) return null;
  try {
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=fr&punctuate=true&smart_format=true', {
      method: 'POST',
      headers: { 'Authorization': `Token ${deepgramKey}`, 'Content-Type': 'audio/mpeg' },
      body: audioBuffer,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    const alt = data?.results?.channels?.[0]?.alternatives?.[0];
    if (!alt?.transcript) return null;
    const words = alt.words || [];
    const wordTimings = words.map(w => ({ start: w.start, end: w.end }));
    const transcript = words.map(w => w.punctuated_word || w.word).join(' ');
    console.log(`[deepgram] Transcribed ${words.length} words`);
    return { transcript, wordTimings };
  } catch (e) {
    console.warn('[deepgram] Transcription failed:', e.message);
    return null;
  }
}

function audioProxyMiddleware() {
  return async (req, res, next) => {
    if (!req.url.startsWith('/api/audio-proxy')) { next(); return; }
    const params = new URL(req.url, 'http://localhost').searchParams;
    const urlParam = params.get('url');
    if (!urlParam) { res.statusCode = 400; res.end('Missing url param'); return; }

    // Allow caller to override max bytes; default caps at 3 min worth
    const maxBytes = parseInt(params.get('maxbytes') || '0', 10) || AUDIO_MAX_BYTES;
    const clientRange = req.headers['range'] || '';

    try {
      // If the client requests a specific range, honour it but still respect maxBytes ceiling
      let upstreamRange = clientRange;
      if (!clientRange) {
        // No client range: request only the first maxBytes bytes
        upstreamRange = `bytes=0-${maxBytes - 1}`;
      }

      const upstream = await fetch(urlParam, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Range': upstreamRange },
      });

      const ct = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');

      let buf = Buffer.from(await upstream.arrayBuffer());

      // Hard-cap: never serve more than maxBytes regardless of what upstream returned
      if (buf.length > maxBytes) buf = buf.subarray(0, maxBytes);

      res.statusCode = clientRange ? (upstream.status === 206 ? 206 : 200) : 200;
      res.setHeader('Content-Length', buf.length);
      // Provide a fake content-range so the player knows the slice boundaries
      res.setHeader('Content-Range', `bytes 0-${buf.length - 1}/*`);
      res.end(buf);
    } catch (err) {
      res.statusCode = 502; res.end('Proxy error: ' + err.message);
    }
  };
}

/**
 * Returns true when `text` looks like a podcast show-intro / promo blurb
 * rather than actual episode content. Used to discard RSS desc fallbacks and
 * scraped UI noise.
 */
function isBoilerplateContent(text) {
  if (!text) return true;
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = clean.split(/\s+/).length;
  if (wordCount < 60) return true; // real episodes are always longer

  const signals = [
    /bienvenue sur\b/i,
    /je (vous invite|t'invite)\b/i,
    /je suis .{2,30}(coach|professeur|formateur|animateur)/i,
    /abonnez[- ]vous/i,
    /abonne[- ]toi/i,
    /\bpodcast pour\b/i,
    /niveaux?\s+(intermédiaire|avancé|débutant)/i,
    /libérer (ta|votre) fluidi/i,
    /trois formats\b/i,
    /log\s*in.*sign\s*up/i,
    /sign\s*up.*log\s*in/i,
    /renforce ta confiance/i,
    /absorbe du vocabulaire/i,
    /apprendre en dormant/i,
    /améliore ton (français|niveau)/i,
    /empowering .{1,20} french learners/i,
    /❤[︎]?/,
    /\bby deborah\b/i,
  ];

  const hits = signals.filter((re) => re.test(clean)).length;
  if (hits >= 2) return true;
  if (hits >= 1 && wordCount < 120) return true;
  return false;
}

// French podcast sources for listening exercises
const FRENCH_PODCAST_SOURCES = [
  { id: 'rfi', name: 'RFI — Journal en Français Facile', level: 'A2-B1', rssUrl: 'https://www.rfi.fr/fr/podcasts/journal-en-francais-facile/feed/' },
  { id: 'innerfrench', name: 'InnerFrench', level: 'B1-B2', rssUrl: 'https://podcast.innerfrench.com/feed.xml' },
  { id: 'littletalk', name: 'Little Talk in Slow French', level: 'A2-B1', rssUrl: 'https://www.spreaker.com/show/6084166/episodes/feed', hasBuiltinTranscript: true },
  { id: 'feelgood', name: 'Feel Good French', level: 'B2-C1', rssUrl: 'https://anchor.fm/s/fbc886b4/podcast/rss' },
  { id: 'francaisauthentique', name: 'Français Authentique', level: 'B1-B2', rssUrl: 'https://www.francaisauthentique.com/feed/podcast/' },
];

function shuffleArray(arr) { return arr.slice().sort(() => Math.random() - 0.5); }

async function fetchPodcastEpisode(learnerLevel = '') {
  // Sort: level-matched sources first, then the rest — both groups shuffled
  const matched = shuffleArray(FRENCH_PODCAST_SOURCES.filter((s) => sourceMatchesLevel(s.level, learnerLevel)));
  const rest = shuffleArray(FRENCH_PODCAST_SOURCES.filter((s) => !sourceMatchesLevel(s.level, learnerLevel)));
  const sources = [...matched, ...rest];
  for (const source of sources) {
    try {
      const r = await fetch(source.rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) { console.log(`[listening] ${source.id} HTTP ${r.status}`); continue; }
      const text = await r.text();
      if (text.length < 300) { console.log(`[listening] ${source.id} too short`); continue; }

      const items = [];
      for (const m of [...text.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].slice(0, 15)) {
        const b = m[1];
        const title = rssDecodeEntities((b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>/) || b.match(/<title>([^<]{3,})<\/title>/))?.[1]?.trim() || '');
        const audioUrl = (b.match(/enclosure[^>]+url="([^"]+\.mp3[^"]*)"/) || b.match(/enclosure[^>]+url="([^"]+)"/))?.[ 1] || '';
        const link = b.match(/<link>(https?:[^<]+)<\/link>/)?.[1]?.trim() || '';
        const pubDate = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
        const desc = (b.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/) || b.match(/<description>([^<]*)<\/description>/))?.[1]?.trim() || '';
        // Spreaker / Podcast Index built-in plain-text transcript
        const transcriptUrl = (b.match(/<podcast:transcript[^>]+type="text\/plain"[^>]+url="([^"]+)"/) || b.match(/<podcast:transcript[^>]+url="([^"]+)"[^>]+type="text\/plain"/))?.[1] || '';
        // Reject items whose RSS description is clearly a show-intro blurb
        const cleanDesc = desc.replace(/<[^>]+>/g, '').trim();
        if (audioUrl && title && !isBoilerplateContent(cleanDesc || title)) {
          items.push({ title, audioUrl, link, pubDate, desc, transcriptUrl });
        } else if (audioUrl && title && !cleanDesc) {
          // No desc at all — still valid (transcript will come from audio/page scrape)
          items.push({ title, audioUrl, link, pubDate, desc, transcriptUrl });
        }
      }

      if (!items.length) { console.log(`[listening] ${source.id} 0 usable items`); continue; }

      // Pick randomly from the 5 most recent episodes
      const episode = items[Math.floor(Math.random() * Math.min(5, items.length))];
      console.log(`[listening] Using source: ${source.name} — "${episode.title}"`);
      return { source, episode };
    } catch (e) { console.log(`[listening] ${source.id} error: ${e.message}`); }
  }
  return null;
}

// Map learner CEFR level to preferred source difficulty range
function sourceMatchesLevel(sourceLevel, learnerLevel) {
  if (!learnerLevel || !sourceLevel) return true;
  const order = ['A1','A2','B1','B2','C1','C2'];
  const li = order.indexOf(learnerLevel);
  // Source level is a range like "A2-B1" — check if learner level is in range
  const parts = sourceLevel.split('-');
  const lo = order.indexOf(parts[0]);
  const hi = order.indexOf(parts[parts.length - 1]);
  if (lo < 0 || hi < 0) return true;
  return li >= lo && li <= hi + 1; // +1 gives some stretch
}

function listeningMiddleware(anthropicKey, deepgramKey, elevenlabsKey, supabaseUrl, supabaseKey, openrouterKey, innerfrenchCookie) {
  let supabase = null;
  if (supabaseUrl && supabaseKey) supabase = createClient(supabaseUrl, supabaseKey);

  return async (req, res, next) => {
    if (req.url !== '/api/listening' || req.method !== 'POST') { next(); return; }
    let topic = '', learnerLevel = '';
    try {
      const body = JSON.parse(await readBody(req));
      topic = body.topic || '';
      learnerLevel = body.learnerLevel || '';
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
    }
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    if (!anthropicKey) {
      res.end(JSON.stringify({ title: '', audioUrl: null, transcript: '', source: '', questions: [], vocab: [], grammar: [] })); return;
    }
    try {
      // Check Supabase cache first — restock requests skip the cache so they
      // always run the full generation pipeline (which saves a new episode).
      const level = learnerLevel || 'B1';
      const isRestock = req.headers['x-restock'] === '1';
      if (supabase && !isRestock) {
        try {
          let { data: cached } = await supabase
            .from('listening_episodes')
            .select('*')
            .eq('level', level)
            .order('created_at', { ascending: false })
            .limit(20);
          const levelStock = cached?.length || 0;
          // No episode for this level yet → serve ANY level instantly rather
          // than making the user wait for a live scrape.
          if (!levelStock) {
            ({ data: cached } = await supabase
              .from('listening_episodes')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(20));
          }
          if (cached && cached.length > 0) {
            const row = cached[Math.floor(Math.random() * cached.length)];
            console.log(`[listening] Cache hit for level=${level}: "${row.title}" (stock: ${levelStock})`);
            // Stream via proxy immediately — the player clips to 3 min itself.
            // (The old path downloaded + ffmpeg-trimmed BEFORE responding.)
            const clipAudioUrl = row.audio_url
              ? `/api/audio-proxy?url=${encodeURIComponent(row.audio_url)}`
              : null;
            CACHE_LOG.push({ ts: Date.now(), endpoint: 'listening', source: 'database', level, title: row.title, fields: { text: !!row.transcript, audio: !!row.audio_url, questions: (row.questions||[]).length, vocab: (row.vocab||[]).length, grammar: (row.grammar||[]).length } });
            if (CACHE_LOG.length > 1000) CACHE_LOG.shift();
            persistDevCosts();
            res.end(JSON.stringify({
              title: row.title,
              audioUrl: clipAudioUrl,
              transcript: row.transcript,
              wordTimings: row.word_timings || null,
              source: row.source_name,
              date: row.pub_date,
              vocabTheme: row.vocab_theme,
              contentLevel: row.content_level || row.level || 'B1',
              questions: row.questions || [],
              vocab: row.vocab || [],
              grammar: row.grammar || [],
            }));
            // Background restock: keep LISTENING_TARGET episodes per level.
            // Self-call so the full generation pipeline runs without blocking.
            if (levelStock < LISTENING_TARGET) {
              const port = req.socket?.localPort || 5173;
              fetch(`http://localhost:${port}/api/listening`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-restock': '1' },
                body: JSON.stringify({ topic, learnerLevel: level }),
              }).catch(() => {});
            }
            return;
          }
        } catch (e) {
          console.warn('[listening] Supabase cache lookup failed:', e.message);
        }
      }
      // Step 1: try podcast sources — prefer level-matched ones first
      const found = await fetchPodcastEpisode(learnerLevel);
      let episode = found?.episode || null;
      const sourceName = found?.source?.name || 'RFI — Journal en Français Facile';
      let generatedAudioUrl = null;

      if (!episode) {
        // All sources failed — generate with Claude + ElevenLabs
        console.log('[listening] All sources unavailable — generating episode with Claude + ElevenLabs');
        const genData = await openrouterCall('listening/generate-episode', openrouterKey, {
            max_tokens: 900,
            system: 'You are a French radio journalist for "Journal en Français Facile" on RFI. Write a short French news bulletin (250-300 words, B1-B2 level) on a current cultural, social, or environmental topic. Use natural spoken French. Return ONLY raw JSON: {"title":"Episode title","transcript":"Full text of the bulletin"}',
            messages: [{ role: 'user', content: `Topic hint: ${topic || 'culture française'}` }],
        });
        let genRaw = (genData.content?.[0]?.text?.trim() || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        let generated = {};
        try { generated = JSON.parse(genRaw); } catch {}
        episode = { title: generated.title || 'Journal en Français Facile', audioUrl: null, link: '', pubDate: new Date().toUTCString(), desc: '', transcriptUrl: '', generatedTranscript: generated.transcript || '' };

        if (elevenlabsKey && episode.generatedTranscript) {
          try {
            const elRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/ebRwkdEFVZIx2A6YucFh', {
              method: 'POST',
              headers: { 'xi-api-key': elevenlabsKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: episode.generatedTranscript, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.75 } }),
            });
            if (elRes.ok) {
              const buf = Buffer.from(await elRes.arrayBuffer());
              const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
              SESSION_AUDIO.set(sid, buf);
              setTimeout(() => SESSION_AUDIO.delete(sid), 60 * 60 * 1000);
              generatedAudioUrl = `/api/audio-session/${sid}`;
            }
          } catch (e) { console.error('[listening] ElevenLabs error:', e.message); }
        }
      }

      // Step 2: trim real audio to exactly CLIP_SECONDS using ffmpeg, store in SESSION_AUDIO
      let clipAudioUrl = generatedAudioUrl; // already set for the Claude+ElevenLabs fallback
      let clipAudioBuf = null;

      if (!clipAudioUrl && episode.audioUrl) {
        try {
          console.log('[listening] Trimming audio with ffmpeg…');
          clipAudioBuf = await makeAudioClip(episode.audioUrl);
          const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
          SESSION_AUDIO.set(sid, clipAudioBuf);
          setTimeout(() => SESSION_AUDIO.delete(sid), 60 * 60 * 1000);
          clipAudioUrl = `/api/audio-session/${sid}`;
          console.log(`[listening] Clip ready: ${clipAudioBuf.length} bytes`);
        } catch (e) {
          console.error('[listening] ffmpeg trim failed:', e.message);
          // Fall back to raw proxy URL so audio still plays (just full length)
          clipAudioUrl = `/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`;
        }
      }

      // Step 3: get transcript for the clip
      let transcript = episode.generatedTranscript || '';
      let wordTimings = null; // [{start, end}] in seconds — set when Deepgram succeeds

      // Step 3-pre: Deepgram word-accurate transcript + timestamps
      if (!transcript && !episode.generatedTranscript && clipAudioBuf) {
        console.log('[listening] Running Deepgram transcription for word timestamps…');
        const dgResult = await deepgramTranscribe(clipAudioBuf, deepgramKey);
        if (dgResult && dgResult.wordTimings.length > 10) {
          transcript = dgResult.transcript;
          wordTimings = dgResult.wordTimings;
          console.log('[listening] Using Deepgram transcript with real timestamps');
        }
      }

      // 3a. Spreaker / Podcast Index built-in plain-text transcript (already time-aligned, truncate by words)
      if (!transcript && episode.transcriptUrl) {
        try {
          const tr = await fetch(episode.transcriptUrl, { signal: AbortSignal.timeout(8000) });
          if (tr.ok) {
            transcript = (await tr.text())
              .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\S+\s*/g, '')
              .replace(/<[^>]+>/g, '').replace(/^\d+\s*$/gm, '').replace(/\s+/g, ' ').trim();
          }
        } catch {}
      }

      // 3b. Scrape article page
      if (!transcript && episode.link) {
        try {
          const pageRes = await fetch(episode.link, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
          const pageHtml = await pageRes.text();
          const bodyMatch = pageHtml.match(/<div[^>]+class="[^"]*(?:article|entry|post)(?:__|-)?content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
          if (bodyMatch) transcript = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (!transcript || transcript.length < 100) {
            const pTexts = [...pageHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
              .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
              .filter((t) => t.length > 40 && /[àâéèêëîïôùûçœ]/i.test(t));
            if (pTexts.length >= 3) transcript = pTexts.slice(0, 12).join(' ').trim();
          }
        } catch {}
      }

      // 3d. RSS description fallback — ONLY if it isn't a show-intro blurb
      if (!transcript || transcript.length < 40) {
        const rawDesc = (episode.desc || '').replace(/<[^>]+>/g, '').trim();
        if (!isBoilerplateContent(rawDesc)) {
          transcript = rawDesc;
        } else {
          console.log('[listening] RSS desc looks like show intro — skipping desc fallback');
        }
      }

      // 3e. Boilerplate guard — if what we have is still promotional noise, generate synthetically
      if (isBoilerplateContent(transcript)) {
        console.log('[listening] Transcript is boilerplate — generating synthetic episode with Claude');
        try {
          const gd = await openrouterCall('listening/boilerplate-fallback', openrouterKey, {
            max_tokens: 700,
            system: `You are a French radio journalist for "Journal en Français Facile" on RFI. Write a short French news or culture bulletin (220-280 words, ${learnerLevel || 'B1'}-level vocabulary) on a real-world topic. Use natural spoken French. Return ONLY raw JSON: {"transcript":"Full text of the bulletin"}`,
            messages: [{ role: 'user', content: `Inspiration: ${episode.title || topic || 'actualité française'}` }],
          });
          let gRaw = (gd.content?.[0]?.text?.trim() || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          const { transcript: genT } = JSON.parse(gRaw);
          if (genT && genT.length > 50) transcript = genT;
        } catch {}
      }

      if (!transcript || transcript.length < 40) throw new Error('No transcript available');

      // Always truncate to ~400 words (≈ 2:30 of speech at 130 wpm) to match the audio clip
      const words = transcript.split(/\s+/);
      if (words.length > 400) transcript = words.slice(0, 400).join(' ') + '…';


      // Step 4: generate 4 MCQ comprehension questions + infer vocab theme — one call
      const qData = await openrouterCall('listening/questions', openrouterKey, {
        max_tokens: 800,
        system: `You are a French language teacher creating a comprehension exercise for a ${level} learner. Based on the transcript, create exactly 4 multiple-choice comprehension questions in French. Also infer: (1) the main vocabulary theme (e.g. "Environnement", "Santé", "Société", "Culture", "Politique", "Technologie", "Voyage"), and (2) the actual CEFR level of the text itself (A1/A2/B1/B2/C1/C2) based on vocabulary complexity, sentence length, and grammar. Respond with raw JSON only, no markdown: {"vocabTheme":"Environnement","contentLevel":"B1","questions":[{"question":"Question?","options":["A","B","C","D"],"answer":"A"},{"question":"...","options":["...","...","...","..."],"answer":"..."},{"question":"...","options":["...","...","...","..."],"answer":"..."},{"question":"...","options":["...","...","...","..."],"answer":"..."}]}`,
        messages: [{ role: 'user', content: `Transcript:\n${transcript.slice(0, 2000)}` }],
      });
      let qRaw = qData.content?.[0]?.text?.trim() || '{}';
      qRaw = qRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let questions = [], vocabTheme = '', contentLevel = level;
      try { const p = JSON.parse(qRaw); questions = p.questions || []; vocabTheme = p.vocabTheme || ''; contentLevel = p.contentLevel || level; } catch {}

      // Step 5: generate vocabulary list targeted to theme + level
      const vData = await openrouterCall('listening/vocab', openrouterKey, {
        max_tokens: 700,
        system: `You are a French language teacher. From the given French transcript, pick exactly 5 vocabulary words relevant to a ${level} learner${vocabTheme ? ` studying the theme "${vocabTheme}"` : ''}. Choose words appropriate for ${level} level — not too easy, not too advanced. For each, write a NEW French sentence with the word replaced by ___. Return ONLY raw JSON: {"vocab":[{"word":"...","definition":"English definition","sentence":"...___..."},{"word":"...","definition":"...","sentence":"...___..."}]}`,
        messages: [{ role: 'user', content: transcript.slice(0, 2000) }],
      });
      let vRaw = vData.content?.[0]?.text?.trim() || '{}';
      vRaw = vRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let vocab = [];
      try { ({ vocab = [] } = JSON.parse(vRaw)); } catch {}

      // Step 6: generate grammar points from the transcript
      const gData = await openrouterCall('listening/grammar', openrouterKey, {
        max_tokens: 900,
        system: `You are a French grammar teacher. From the French transcript, identify exactly 2 grammar structures or patterns that a ${level} learner should study. For each, quote the exact sentence from the transcript that illustrates it, name the grammar point, explain it simply in English (1-2 sentences), give a short usage tip, AND write 2 fill-in-the-blank practice exercises (one blank marked "___" per sentence; "hint" = infinitive/base form of the answer). Return ONLY raw JSON: {"grammar":[{"point":"Le passé composé","example":"Exact sentence from transcript","explanation":"Used to describe completed past actions.","tip":"Use avoir or être as auxiliary + past participle.","exercises":[{"sentence":"Hier, j'___ au cinéma.","answer":"suis allé","hint":"aller"},{"sentence":"...___...","answer":"...","hint":"..."}]},{"point":"...","example":"...","explanation":"...","tip":"...","exercises":[{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."}]}]}`,
        messages: [{ role: 'user', content: transcript.slice(0, 2000) }],
      });
      let gRaw = gData.content?.[0]?.text?.trim() || '{}';
      gRaw = gRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let grammar = [];
      try { ({ grammar = [] } = JSON.parse(gRaw)); } catch {}

      const result = {
        title: episode.title,
        audioUrl: clipAudioUrl,
        transcript,
        wordTimings,
        source: sourceName,
        date: episode.pubDate,
        vocabTheme,
        contentLevel,
        questions,
        vocab,
        grammar,
      };

      // Save to Supabase cache (fire-and-forget) — but never save junk:
      // music-only clips, outros and ads transcribe to almost nothing.
      const transcriptWordCount = String(transcript || '').split(/\s+/).filter(Boolean).length;
      if (supabase && transcriptWordCount < 60) {
        console.warn(`[listening] NOT saving "${episode.title}" — transcript too short (${transcriptWordCount} words, likely music/outro)`);
      }
      if (supabase && transcriptWordCount >= 60) {
        supabase.from('listening_episodes').insert([{
          level,
          content_level: contentLevel,
          title: episode.title,
          audio_url: episode.audioUrl || null,
          transcript,
          source_name: sourceName,
          pub_date: episode.pubDate || null,
          vocab_theme: vocabTheme,
          questions,
          vocab,
          grammar,
          word_timings: wordTimings || null,
        }]).then(({ error }) => {
          if (error) console.warn('[listening] Supabase insert failed:', error.message);
          else console.log('[listening] Saved to Supabase cache');
        });
      }

      CACHE_LOG.push({ ts: Date.now(), endpoint: 'listening', source: 'generated', level, title: episode.title, fields: { text: !!transcript, audio: !!clipAudioUrl, questions: questions.length, vocab: vocab.length, grammar: grammar.length } });
      if (CACHE_LOG.length > 1000) CACHE_LOG.shift();
      persistDevCosts();
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[listening] error:', err.message);
      res.end(JSON.stringify({ title: '', audioUrl: null, transcript: '', source: 'RFI', questions: [], vocab: [], grammar: [] }));
    }
  };
}

const SPEAKING_NARRATORS = ['jules', 'lea'];
function speakingPromptMiddleware(apiKey) {
  return async (req, res, next) => {
    const isLegacy = req.url === '/api/speaking-prompt' && req.method === 'POST';
    const isCombined = req.url === '/api/speaking' && req.method === 'POST';
    if (!isLegacy && !isCombined) { next(); return; }

    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');

    // Word challenge eval mode
    if (isCombined && body.type === 'word-challenge') {
      const { utterance = '', word = '', meaning = '', narratorId = 'lea', attemptNumber = 1 } = body;
      if (!apiKey || !utterance.trim() || !word) { res.end(JSON.stringify({ feedback: '', isCorrect: false })); return; }
      const isFinal = attemptNumber >= 3;
      try {
        const name = narratorId === 'lea' ? 'Léa' : 'Jules';
        const gender = narratorId === 'lea' ? 'une Parisienne' : 'un Parisien';
        const d = await claudeCall('speaking/word-challenge', apiKey, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 350,
          system: `Tu es ${name}, ${gender} natif(ve). Un étudiant pratique le mot argotique/parisien "${word}" (= ${meaning}).\nIl vient de faire la tentative n°${attemptNumber}/3.\nJuge en vrai(e) Parisien(ne) exigeant(e) : isCorrect=true UNIQUEMENT si la phrase contient bien "${word}" (conjugué ou accordé, ça compte) ET que le mot est employé avec le bon sens (${meaning}), une grammaire correcte et de façon naturelle, comme le dirait un Parisien. Si le mot est absent, déformé, ou utilisé à contresens → isCorrect=false. Une phrase grammaticalement juste mais où le mot sonne faux → false aussi.\n${isFinal ? `C'est la dernière tentative. Donne aussi 2 exemples de vraies phrases parisiennes utilisant "${word}", puis propose un sujet de conversation aléatoire et sympa pour continuer.` : `Dis-lui brièvement si c'est bien ou pas, et invite-le à refaire une phrase — VARIE ta formulation à chaque tentative (ex. "Allez, tente une autre !", "Vas-y, refais-moi une phrase !", "Encore une, pour voir ?", "Une dernière pour la route !"), ne répète jamais la même tournure.`}\nRéponds toujours en français, ton naturel et chaleureux.\nJSON: {"isCorrect":true/false,"feedback":"...(1-2 phrases)","corrected":"phrase corrigée si mauvaise, sinon null","examples":["ex1","ex2"] ou null,"nextTopic":"sujet ou null"}`,
          messages: [{ role: 'user', content: `Phrase de l'étudiant : "${utterance}"` }],
        });
        let raw = d.content?.[0]?.text?.trim() || '{}';
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(raw);
        res.end(JSON.stringify({
          isCorrect: !!parsed.isCorrect,
          feedback: parsed.feedback || '',
          corrected: parsed.corrected || null,
          examples: isFinal ? (parsed.examples || []) : null,
          nextTopic: isFinal ? (parsed.nextTopic || null) : null,
        }));
      } catch (e) { console.error('[dev/word-challenge] FAILED:', e?.message, e?.stack?.split('\n')[1]); res.end(JSON.stringify({ feedback: '', isCorrect: false })); }
      return;
    }

    // Reaction mode (chat reply)
    if (isCombined && body.type === 'reaction') {
      const { utterance = '', narratorId = 'lea', topic = '', openingLine = '' } = body;
      if (!apiKey || !utterance.trim()) { res.end(JSON.stringify({ text: '', translation: '' })); return; }
      try {
        const name = narratorId === 'lea' ? 'Léa' : 'Jules';
        const gender = narratorId === 'lea' ? 'une Parisienne' : 'un Parisien';
        const d = await claudeCall('speaking/reaction', apiKey, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: `Tu es ${name}, ${gender} natif(ve) qui aide un étudiant à pratiquer le français oral.\nLe sujet de conversation: "${topic || 'conversation libre'}"\nTu as lancé la conversation en disant: "${openingLine}"\nL'étudiant vient de parler. Réponds naturellement en 1-2 phrases courtes en français.\nSois curieux(se), encourageant(e), et rebondis sur ce qu'il a dit.\nJSON: {"text":"...", "translation":"..."}`,
          messages: [{ role: 'user', content: `L'étudiant a dit: "${utterance}"` }],
        });
        let raw = d.content?.[0]?.text?.trim() || '{}';
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(raw);
        res.end(JSON.stringify({ text: parsed.text || '', translation: parsed.translation || '' }));
      } catch { res.end(JSON.stringify({ text: '', translation: '' })); }
      return;
    }

    // Prompt mode (opening line)
    const topic = body.topic || '';
    if (!apiKey) { res.end(JSON.stringify({ narratorId: 'lea', openingLine: '', topic })); return; }
    try {
      const narratorId = SPEAKING_NARRATORS[Math.floor(Math.random() * SPEAKING_NARRATORS.length)];
      const name = narratorId === 'lea' ? 'Léa' : 'Jules';
      const d = await claudeCall('speaking/opener', apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are ${name}, a Parisian French speaking coach designing a practice challenge for a B1-B2 learner about the given topic. Design: 1) ONE grammar structure to practice (e.g. passé composé, subjonctif, pronoms relatifs, comparatifs). 2) THREE useful French words/expressions to use. 3) A warm, natural opening QUESTION in French that pushes the learner to use that grammar and those words in their spoken answer. Return ONLY raw JSON: {"openingLine":"...","openingLineTranslation":"English","topicLabel":"short FR label","grammarPoint":"FR name","grammarHint":"short English hint","vocab":[{"word":"FR","meaning":"English"}]}`,
        messages: [{ role: 'user', content: `Topic: ${topic}` }],
      });
      let raw = d.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(raw);
      const targetGrammar = (parsed.grammarPoint || parsed.grammarHint) ? { point: parsed.grammarPoint || '', hint: parsed.grammarHint || '' } : null;
      const targetVocab = Array.isArray(parsed.vocab) ? parsed.vocab.slice(0, 4) : null;

      // Save every generated speaking prompt to Supabase (fire-and-forget)
      const sb = getSupabaseAdmin();
      if (sb && parsed.openingLine) {
        sb.from('speaking_prompts').insert([{
          topic,
          narrator_id: narratorId,
          opening_line: parsed.openingLine,
          opening_line_translation: parsed.openingLineTranslation || '',
          topic_label: parsed.topicLabel || topic,
          target_grammar: targetGrammar,
          target_vocab: targetVocab,
        }]).then(({ error }) => { if (error) console.error('[speaking] Supabase insert error:', error.message); });
      }

      res.end(JSON.stringify({
        narratorId,
        openingLine: parsed.openingLine || '',
        openingLineTranslation: parsed.openingLineTranslation || '',
        topicLabel: parsed.topicLabel || topic,
        targetGrammar,
        targetVocab,
      }));
    } catch { res.end(JSON.stringify({ narratorId: 'lea', openingLine: '', topicLabel: topic })); }
  };
}

function writingReviewMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/writing-review' || req.method !== 'POST') { next(); return; }
    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    const { step = 'feedback', narratorId = 'lea', level = 'B1' } = body;
    const name = narratorId === 'lea' ? 'Léa' : 'Jules';
    const gender = narratorId === 'lea' ? 'une Parisienne' : 'un Parisien';
    if (!apiKey) { res.end(JSON.stringify({})); return; }

    const parseJson = (d) => {
      let raw = d.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
    };

    try {
      if (step === 'feedback') {
        const { text = '', prompt = '', tips = {}, wordTarget = 80 } = body;
        if (!text.trim()) { res.end(JSON.stringify({ reaction: '' })); return; }
        const tipList = ['vocab', 'expressions', 'grammar', 'conjugation', 'connecteurs']
          .map(k => (tips?.[k]?.length ? `${k}: ${tips[k].join(', ')}` : null)).filter(Boolean).join(' | ');
        const d = await claudeCall('writing-review/feedback', apiKey, {
          model: 'claude-haiku-4-5-20251001', max_tokens: 280,
          system: `Tu es ${name}, ${gender} qui coache un étudiant ${level} à l'écrit.\nLe défi d'écriture était : "${prompt}" (objectif ~${wordTarget} mots).\nConseils donnés : ${tipList || 'aucun'}.\nJuge le texte par rapport au défi : longueur atteinte, vocabulaire / expressions / grammaire / connecteurs suggérés utilisés ? Sois chaleureux(se), précis(e), encourageant(e). 2-3 phrases en français.\nJSON: {"reaction":"..."}`,
          messages: [{ role: 'user', content: `Texte de l'étudiant :\n"${text}"` }],
        });
        const parsed = parseJson(d);
        res.end(JSON.stringify({ reaction: parsed.reaction || '' }));
        return;
      }
      if (step === 'explain') {
        const { question = '', original = '', corrected = '' } = body;
        if (!question.trim()) { res.end(JSON.stringify({ explanation: '', exercise: null })); return; }
        const d = await claudeCall('writing-review/explain', apiKey, {
          model: 'claude-haiku-4-5-20251001', max_tokens: 500,
          system: `Tu es ${name}, ${gender} qui aide un étudiant ${level}.\nL'étudiant n'a pas compris "${question}" dans la correction.\nTexte original: "${original}"\nVersion corrigée: "${corrected}"\nÉtape 1 : explique simplement en français "${question}" (2-3 phrases).\nÉtape 2 : crée UN exercice court pour le pratiquer, type le plus adapté.\nTypes:\n- {"type":"fill-blank","sentence":"... ___ ...","answer":"...","hint":"indice"}\n- {"type":"mcq","question":"...","options":["a","b","c"],"answer":"option exacte"}\n- {"type":"rephrase","instruction":"...","example":"phrase","answer":"reformulation"}\nJSON: {"explanation":"...","exercise":{...}}`,
          messages: [{ role: 'user', content: `Élément : "${question}"` }],
        });
        const parsed = parseJson(d);
        res.end(JSON.stringify({ explanation: parsed.explanation || '', exercise: parsed.exercise || null }));
        return;
      }
      res.end(JSON.stringify({}));
    } catch { res.end(JSON.stringify({})); }
  };
}

// Strip any non-Latin script (CJK, Japanese kana, Korean, Cyrillic, Arabic, etc.)
// that some models occasionally leak into French output. Keeps Latin letters,
// French accents, digits and common punctuation.
function stripNonFrench(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ　-〿぀-ゟ゠-ヿ㄀-ㄯ㄰-㆏가-힯一-鿿豈-﫿＀-￯]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function deepStripNonFrench(v) {
  if (typeof v === 'string') return stripNonFrench(v);
  if (Array.isArray(v)) return v.map(deepStripNonFrench).filter(x => x !== '');
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = deepStripNonFrench(v[k]);
    return o;
  }
  return v;
}

function writingPromptMiddleware(apiKey, openrouterKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/writing-prompt' || req.method !== 'POST') { next(); return; }
    let topic = '', learnerLevel = 'B1';
    try { const b = JSON.parse(await readBody(req)); topic = b.topic || ''; learnerLevel = b.learnerLevel || 'B1'; } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    const empty = { prompt: '', tips: { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] }, wordTarget: 80 };
    if (!apiKey) { res.end(JSON.stringify(empty)); return; }
    try {
      const d = await openrouterCall('writing/prompt', openrouterKey, {
        max_tokens: 500,
        system: `You are a French writing coach. Generate a specific, engaging writing prompt in French for a ${learnerLevel} learner about the given topic. Make it cultural, societal, or fun — something a Parisian would actually discuss.
CRITICAL: Write EVERYTHING in French only. Use ONLY the Latin alphabet with French accents. NEVER include Chinese, Japanese, Korean, Cyrillic, Arabic or any other non-Latin characters — not a single one.
Return ONLY raw JSON (no markdown):
{
  "prompt": "The writing task in French (1-2 vivid sentences)",
  "tips": {
    "vocab": ["3-4 key French vocabulary words they should use, each as a single word or short noun phrase"],
    "expressions": ["2-3 idiomatic French expressions that fit the topic"],
    "grammar": ["1-2 grammar structures to practise, described briefly in French"],
    "conjugation": ["1-2 specific tenses to use, e.g. 'le passé composé', 'le conditionnel'"],
    "connecteurs": ["4-5 logical connectors in French, e.g. 'cependant', 'en revanche', 'par conséquent'"]
  },
  "wordTarget": 80
}`,
        messages: [{ role: 'user', content: `Topic: ${topic}` }],
      });
      let raw = d.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = deepStripNonFrench(JSON.parse(raw));
      const tips = parsed.tips || {};

      // Save every generated writing prompt to Supabase (fire-and-forget)
      const sb = getSupabaseAdmin();
      if (sb && parsed.prompt) {
        sb.from('writing_prompts').insert([{
          topic,
          prompt: parsed.prompt,
          word_target: parsed.wordTarget || 80,
          tips,
          level: learnerLevel,
        }]).then(({ error }) => { if (error) console.error('[writing] Supabase insert error:', error.message); });
      }

      res.end(JSON.stringify({
        prompt: parsed.prompt || '',
        tips: {
          vocab: tips.vocab || [],
          expressions: tips.expressions || [],
          grammar: tips.grammar || [],
          conjugation: tips.conjugation || [],
          connecteurs: tips.connecteurs || [],
        },
        wordTarget: parsed.wordTarget || 80,
      }));
    } catch { res.end(JSON.stringify(empty)); }
  };
}

function translateWordMiddleware(apiKey, openrouterKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/translate-word' || req.method !== 'POST') { next(); return; }
    let word = '', context = '';
    try { const b = JSON.parse(await readBody(req)); word = b.word || ''; context = b.context || ''; } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    if (!apiKey || !word.trim()) { res.end(JSON.stringify({ translation: '' })); return; }
    try {
      const d = await openrouterCall('translate/word', openrouterKey, {
        max_tokens: 40,
        system: 'French-English dictionary. Return ONLY the English translation of the given French word (1–4 words max). No punctuation, no explanation.',
        messages: [{ role: 'user', content: context ? `"${word}" (context: ${context.slice(0, 120)})` : `"${word}"` }],
      });
      res.end(JSON.stringify({ translation: d.content?.[0]?.text?.trim() || '' }));
    } catch { res.end(JSON.stringify({ translation: '' })); }
  };
}

export default defineConfig(() => {
  const env = readEnvFile(process.cwd());

  return {
    plugins: [
      react(),
      {
        name: 'api-middleware',
        configureServer(server) {
          server.middlewares.use(deepgramKeyMiddleware(env.DEEPGRAM_API_KEY));
          server.middlewares.use(speechmaticsKeyMiddleware(env.SPEECHMATICS_API_KEY));
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(interviewFeedbackMiddleware());
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
          server.middlewares.use(devStatsMiddleware());
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(readingMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(audioProxyMiddleware());
          server.middlewares.use(sessionAudioMiddleware());
          server.middlewares.use(listeningMiddleware(env.ANTHROPIC_API_KEY, env.DEEPGRAM_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.OPENROUTER_API_KEY, env.INNERFRENCH_COOKIE));
          server.middlewares.use(speakingPromptMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(writingPromptMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(writingReviewMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(translateWordMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
        configurePreviewServer(server) {
          server.middlewares.use(deepgramKeyMiddleware(env.DEEPGRAM_API_KEY));
          server.middlewares.use(speechmaticsKeyMiddleware(env.SPEECHMATICS_API_KEY));
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(interviewFeedbackMiddleware());
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
          server.middlewares.use(devStatsMiddleware());
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(readingMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(audioProxyMiddleware());
          server.middlewares.use(sessionAudioMiddleware());
          server.middlewares.use(listeningMiddleware(env.ANTHROPIC_API_KEY, env.DEEPGRAM_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.OPENROUTER_API_KEY, env.INNERFRENCH_COOKIE));
          server.middlewares.use(speakingPromptMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(writingPromptMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(writingReviewMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(translateWordMiddleware(env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.OPENROUTER_API_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
      },
    ],
  };
});
