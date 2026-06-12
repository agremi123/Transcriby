import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';
import { createHash } from 'crypto';
import {
  getCachedNarratorAudio,
  saveNarratorAudio,
  resolveNarrator,
} from './narrator-audio-cache.js';
import { getSupabaseAdmin } from './supabase.js';

// Log every spoken narrator line (text + cached audio URL) to narrator_lines.
// Fire-and-forget; duplicate lines are ignored via the (narrator, texthash) key.
function logNarratorLine(slug, text, audioUrl) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const texthash = createHash('sha256').update(`${slug}\0${text}`).digest('hex').slice(0, 32);
  sb.from('narrator_lines')
    .upsert([{ narrator: slug, text, texthash, audiourl: audioUrl || null }], {
      onConflict: 'narrator,texthash',
      ignoreDuplicates: true,
    })
    .then(({ error }) => {
      // Table missing until migration 009 runs — don't spam other errors
      if (error && !/narrator_lines/.test(error.message || '')) {
        console.warn('[narrator-lines] log failed:', error.message);
      }
    });
}
import { buildCorrectionSystemPrompts } from './correctionPrompts.js';
import { sanitizeParisianCorrection, parseCorrectionResponse } from '../src/lib/correctionFormat.js';

export const NARRATOR_ALIASES = { jules: 'alex', lea: 'lea', stella: 'lea' };

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function normalizeLearnerLevel(level) {
  const v = String(level || '').trim().toUpperCase();
  return CEFR_LEVELS.includes(v) ? v : 'A2';
}

function learnerLevelContext(level) {
  const l = normalizeLearnerLevel(level);
  const idx = CEFR_LEVELS.indexOf(l);
  if (idx <= 1) {
    return `The learner's approximate level is ${l} (beginner). Use simple, encouraging French. Avoid slang they won't understand. Explain briefly when needed.`;
  }
  if (idx <= 3) {
    return `The learner's approximate level is ${l} (intermediate). Balance clarity with natural Parisian expressions.`;
  }
  return `The learner's approximate level is ${l} (advanced). Be demanding — expect nuance, idioms, and authentic Parisian register.`;
}

export const ELEVENLABS_VOICES = {
  lea: 'ebRwkdEFVZIx2A6YucFh',
  alex: 'n1u6R6yj3qEpDLH3liBh',
};

export function normalizeNarrator(narrator) {
  return NARRATOR_ALIASES[narrator] || narrator;
}

export function extractCorrectedFromRaw(raw, fallback = '') {
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

export function handleDeepgramKey() {
  const { DEEPGRAM_API_KEY } = getEnv();
  if (!DEEPGRAM_API_KEY) {
    return { statusCode: 500, body: { error: 'DEEPGRAM_API_KEY is not configured' } };
  }
  return { statusCode: 200, body: { key: DEEPGRAM_API_KEY } };
}

export async function handleTts(body) {
  const { OPENAI_API_KEY } = getEnv();
  const text = body?.text || '';
  let voice = 'nova';
  if (body?.narrator === 'jules') voice = 'onyx';
  else if (body?.voice) voice = body.voice;

  if (!OPENAI_API_KEY || !text) {
    return { statusCode: 400, body: { error: 'Missing TTS configuration' } };
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    return { statusCode: response.status, body: { error: await response.text() } };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
    body: Buffer.from(await response.arrayBuffer()),
  };
}

export async function handleElevenLabsTts(body) {
  const { ELEVENLABS_API_KEY } = getEnv();
  const text = (body?.text || '').trim();
  const { slug, voiceId } = resolveNarrator(body?.narrator || 'lea');

  if (!text) {
    return { statusCode: 400, body: { error: 'Missing text' } };
  }
  if (!ELEVENLABS_API_KEY) {
    return { statusCode: 400, body: { error: 'Missing ElevenLabs key' } };
  }

  const cached = await getCachedNarratorAudio(slug, voiceId, text);
  if (cached) {
    logNarratorLine(slug, text, cached.audioUrl);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Narrator-Audio-Cache': 'supabase-hit',
        'X-Narrator-Voice': slug,
      },
      body: { audioUrl: cached.audioUrl, narrator: slug, cached: true },
    };
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.82,
        similarity_boost: 0.88,
        style: 0.08,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    return { statusCode: response.status, body: { error: await response.text() } };
  }

  const buf = Buffer.from(await response.arrayBuffer());
  const audioUrl = await saveNarratorAudio(slug, voiceId, text, buf);
  logNarratorLine(slug, text, audioUrl);

  if (audioUrl) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Narrator-Audio-Cache': 'supabase-miss',
        'X-Narrator-Voice': slug,
      },
      body: { audioUrl, narrator: slug, cached: false },
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'audio/mpeg', 'X-Narrator-Audio-Cache': 'direct', 'X-Narrator-Voice': slug },
    body: buf,
  };
}

export async function handleCorrect(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const text = body?.text || '';
  const register = body?.register || 'Standard';
  const assessOnly = !!body?.assessOnly;
  const interviewReport = !!body?.interviewReport;
  const dimensionBreakdown = !!body?.dimensionBreakdown;
  const claimedLevel = body?.claimedLevel || '';
  const learnerLevel = normalizeLearnerLevel(body?.learnerLevel || claimedLevel || 'A2');
  const levelCtx = learnerLevelContext(learnerLevel);

  if (!ANTHROPIC_API_KEY || !text) {
    return { statusCode: 200, body: { corrected: text } };
  }

  if (assessOnly) {
    try {
      if (dimensionBreakdown) {
        const dimensionPrompt = `${levelCtx} You are a French language expert. Assess this spoken French answer on three dimensions separately. Clarity = how clear and understandable the response is. Grammar = grammatical accuracy (verbs, agreements, tenses). Vocabulary = range and appropriateness of word choice. Return raw JSON only, no markdown: {"clarity":"B1","grammar":"A2","vocabulary":"B1"}. Each value must be exactly one of: A1, A2, B1, B2, C1, C2.`;
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 80,
            system: [{ type: 'text', text: dimensionPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: text }],
          }),
        });
        const data = await response.json();
        let raw = data.content?.[0]?.text?.trim() || '{}';
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        let clarity = null;
        let grammar = null;
        let vocabulary = null;
        try { ({ clarity, grammar, vocabulary } = JSON.parse(raw)); } catch {}
        return {
          statusCode: 200,
          body: { clarity, grammar, vocabulary },
        };
      }

      const isInterviewReport = interviewReport;
      const assessSystemPrompt = isInterviewReport
        ? `You are Léa and Jules, Parisian French coaches. A learner claimed CEFR level ${claimedLevel || 'unknown'} and answered interview questions in French. Assess their spoken French holistically. Return raw JSON only, no markdown: {"overallLevel":"B1","overallScore":72,"learnerGender":"woman","summary":"","strengths":[{"label":"Vocabulary Variety","hint":"Range and precision of word choice","score":78},{"label":"Accent & pronunciation","hint":"How natural you sound","score":74},{"label":"Flow and rhythm","hint":"Pace and continuity when you speak","score":68},{"label":"Listening skills","hint":"Following spoken French","score":66}],"weaknesses":[{"label":"Grammar accuracy","hint":"Verb forms, agreements, tenses","score":44},{"label":"Parisian style","hint":"Local register vs textbook French","score":40},{"label":"Conjugation skills","hint":"Verb forms in context","score":46},{"label":"Cultural Understanding","hint":"References, tone, and local context","score":38}]}. Include exactly 4 strengths and 4 weaknesses. Use ONLY these exact labels (do not invent new ones): Grammar accuracy, Vocabulary Variety, Parisian style, Conjugation skills, Accent & pronunciation, Flow and rhythm, Listening skills, Cultural Understanding. Each label may appear at most once in the whole response. Each score is 0-100 (higher is better). Strength scores typically 58-92. Weakness scores typically 28-58. overallScore is 0-100. overallLevel is A1, A2, B1, B2, C1, or C2. learnerGender must be "woman" or "man" — infer from how the learner speaks about themselves (adjective/participle agreement, je suis né/née, je suis content/contente, etc.). summary may be empty. Keep hints under 8 words.`
        : `${levelCtx} You are a French language expert. Assess the overall CEFR level of the spoken French (A1, A2, B1, B2, C1, or C2). Identify one key strength. Then give one concrete actionable tip specifically targeting the NEXT level up (A1→A2, A2→B1, B1→B2, B2→C1, C1→C2). The tip must be relevant to bridging exactly that gap. Respond with raw JSON only, no markdown: {"level":"B1","strength":"...","weakness":"..."}. Keep strength and weakness to max 7 words each. The "weakness" field must be a short positive actionable advice (e.g. "Practise subjunctive mood daily"), never a problem description.`;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: isInterviewReport ? 950 : 120,
          system: [{ type: 'text', text: assessSystemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: text }],
        }),
      });
      const data = await response.json();
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
        return {
          statusCode: 200,
          body: {
            overallLevel,
            overallScore,
            summary,
            learnerGender,
            strengths: Array.isArray(strengths) ? strengths : [],
            weaknesses: Array.isArray(weaknesses) ? weaknesses : [],
          },
        };
      }
      let level = null;
      let strength = null;
      let weakness = null;
      try { ({ level, strength, weakness } = JSON.parse(raw)); } catch {}
      return { statusCode: 200, body: { level, strength, weakness } };
    } catch {
      return {
        statusCode: 200,
        body: interviewReport
          ? { overallLevel: null, overallScore: null, summary: null, learnerGender: null, strengths: [], weaknesses: [] }
          : { level: null },
      };
    }
  }

  const systemPrompts = buildCorrectionSystemPrompts(levelCtx);
  const system = systemPrompts[register] || systemPrompts.Parisien;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(1400, 240 + Math.ceil(text.length / 2.5)),
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: text }],
      }),
    });

    const data = await response.json();
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

    return { statusCode: 200, body: { corrected, translation, level } };
  } catch {
    return { statusCode: 200, body: { corrected: text, translation: null, level: null } };
  }
}

function loadInterviewFeedbackStore() {
  const file = resolve(process.cwd(), 'data', 'interview-feedback.json');
  try {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8'));
    }
  } catch {}
  return {};
}

export function handleInterviewFeedbackGet() {
  return { statusCode: 200, body: loadInterviewFeedbackStore() };
}

export function handleInterviewFeedbackPost(body) {
  const { questionId, judgment } = body || {};
  if (!questionId || !Array.isArray(judgment) || judgment.length === 0) {
    return { statusCode: 400, body: { error: 'questionId and judgment[] required' } };
  }
  return { statusCode: 200, body: { ok: true, questionId } };
}

export async function handlePractice(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const topic = body?.topic || '';
  if (!ANTHROPIC_API_KEY || !topic) {
    return { statusCode: 200, body: { exercises: [] } };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are a French language teacher. Generate exactly 4 multiple-choice comprehension questions in French to practice: "${topic}". Each question has exactly 4 options (A–D) and one correct answer. Respond with raw JSON only, no markdown: {"exercises":[{"question":"Question in French?","options":["Option A","Option B","Option C","Option D"],"answer":"Option A"},{"question":"...","options":["...","...","...","..."],"answer":"..."},{"question":"...","options":["...","...","...","..."],"answer":"..."},{"question":"...","options":["...","...","...","..."],"answer":"..."}]}`,
        messages: [{ role: 'user', content: `Generate 4 multiple-choice questions for: ${topic}` }],
      }),
    });
    const data = await response.json();
    let raw = data.content?.[0]?.text?.trim() || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw);
    return { statusCode: 200, body: { exercises: parsed.exercises || [] } };
  } catch {
    return { statusCode: 200, body: { exercises: [] } };
  }
}

// ── French RSS feeds for reading exercises ────────────────────────────────────
const FRENCH_RSS_FEEDS = [
  { name: 'Le Monde',      url: 'https://www.lemonde.fr/rss/une.xml' },
  { name: 'France Info',   url: 'https://www.francetvinfo.fr/titres.rss' },
  { name: 'Le Figaro',     url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { name: '20 Minutes',    url: 'https://www.20minutes.fr/feeds/rss/actu.xml' },
  { name: 'Libération',    url: 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml' },
  { name: 'L\'Obs',        url: 'https://www.nouvelobs.com/rss.xml' },
  { name: 'RFI',           url: 'https://www.rfi.fr/fr/rss-podcasts-emissions.xml' },
];

function extractCdata(str) {
  const m = str.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : str.replace(/<[^>]+>/g, '').trim();
}

// Decode HTML entities (e.g. &#xE8; → è, &#233; → é, &amp; → &) so RSS titles
// don't show raw character codes.
function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const found = block.match(r);
      return found ? extractCdata(found[1]) : '';
    };
    const title       = decodeEntities(get('title'));
    const description = decodeEntities(stripHtml(get('description') || get('summary')));
    const content     = decodeEntities(stripHtml(get('content:encoded') || get('content')));
    const link        = get('link') || block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
    const pubDate     = get('pubDate') || get('dc:date') || '';
    const author      = decodeEntities(get('dc:creator') || get('author') || '');
    if (title || description) items.push({ title, description, content, link, pubDate, author });
  }
  return items;
}

async function fetchRssItems(feed) {
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml).map(item => ({ ...item, feedName: feed.name }));
  } catch {
    return [];
  }
}

async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
    const paragraphs = [];
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pRe.exec(bodyMatch)) !== null) {
      const text = stripHtml(pm[1]);
      if (text.length > 40) paragraphs.push(text);
    }
    return paragraphs.join(' ').slice(0, 6000);
  } catch { return ''; }
}

// ── Shared Claude helper ────────────────────────────────────────────────────
async function claudeJSON({ apiKey, system, user, maxTokens = 800 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: '{' },
      ],
    }),
  });
  const data = await res.json();
  // Prepend the '{' we used as prefill so the full JSON is parseable
  let raw = '{' + (data.content?.[0]?.text?.trim() || '');
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(raw); } catch {
    // Fallback: extract first complete JSON object from anywhere in the response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return {};
  }
}

// ── Generate a full reading bundle (article + 4 exercise types) ─────────────
async function generateReadingBundle(apiKey) {
  const feedResults = await Promise.all(FRENCH_RSS_FEEDS.map(fetchRssItems));
  const allItems = feedResults.flat().filter(i => i.title && (i.description || i.content));
  if (allItems.length === 0) throw new Error('No RSS items');

  // Shuffle candidates, fetch the top few article bodies IN PARALLEL, and pick a
  // FULL one (>= 1500 chars) so we never serve a half-baked / stub article.
  const withDesc = allItems.filter(i => (i.description || i.content || '').length > 120);
  const pool = (withDesc.length ? withDesc : allItems).slice().sort(() => Math.random() - 0.5);
  const MIN_BODY = 1500;
  const fetched = await Promise.all(pool.slice(0, 5).map(async (c) => {
    let body = '';
    if (c.link) { try { body = await fetchArticleBody(c.link); } catch { body = ''; } }
    if (body.length < 200) body = c.content || c.description || '';
    return { c, body };
  }));
  const fullOnes = fetched.filter(f => f.body.length >= MIN_BODY);
  const picked = fullOnes[0] || fetched.slice().sort((a, b) => b.body.length - a.body.length)[0];
  const chosen = picked.c;
  // Strip CJK characters that can appear in scraped page sidebars/ads
  let rawText = (picked.body || '').replace(/[　-鿿가-힯豈-﫿]/g, '').slice(0, 6000);

  const extractData = await claudeJSON({
    apiKey, maxTokens: 1000,
    system: 'Extract a coherent readable passage from this French article. The passage must be entirely in French — omit any non-French text. At least 15 sentences, 400-600 words, natural paragraphs. Return ONLY raw JSON: {"passage":"..."}',
    user: `Title: ${chosen.title}\n\n${rawText}`,
  });
  const passage = extractData.passage?.trim() || '';
  if (!passage) throw new Error('No passage extracted');

  // Run questions + exercises in parallel
  const [qParsed, exParsed] = await Promise.all([
    claudeJSON({
      apiKey, maxTokens: 1600,
      system: 'Create exactly 6 multiple-choice comprehension questions (in French) about the French passage. For each, add "explanation": a clear English sentence or two explaining why the correct answer is right and why the others are wrong. Raw JSON only: {"questions":[{"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"In English: why A is correct and the others are not."}]}',
      user: passage,
    }),
    claudeJSON({
      apiKey, maxTokens: 1400,
      system: `French language teacher. From the passage generate:
1. 4 vocabulary fill-in-the-blank (key words from article)
2. 1 grammar point with explanation and example
3. 4 conjugation fill-in-the-blank (verbs from article)
Raw JSON only:
{"vocab":[{"word":"...","definition":"English meaning","sentence":"...___..."}],"grammar":{"point":"...","example":"...","explanation":"...","tip":"..."},"conjugation":[{"verb":"...","tense":"...","sentence":"...___...","answer":"...","hint":"je/tu/il..."}]}`,
      user: passage,
    }),
  ]);

  return {
    title: chosen.title || '',
    source: chosen.feedName || null,
    author: chosen.author || null,
    date: chosen.pubDate || null,
    link: chosen.link || null,
    passage,
    questions: qParsed.questions || [],
    vocab: exParsed.vocab || [],
    grammar: exParsed.grammar ? [exParsed.grammar] : [],
    conjugation: exParsed.conjugation || [],
  };
}

// ── Podcast sources ───────────────────────────────────────────────────────────
const PODCAST_SOURCES = [
  // Dedicated French-learning podcasts
  { name: 'InnerFrench',                      rss: 'https://podcast.innerfrench.com/feed.xml' },
  { name: 'Français Authentique',              rss: 'https://www.francaisauthentique.com/feed/podcast/' },
  { name: 'RFI — Journal en Français Facile',  rss: 'https://www.rfi.fr/fr/podcasts/journal-en-francais-facile/feed/' },
  // Authentic French content
  { name: 'France Culture — Avec philosophie', rss: 'https://radiofrance-podcast.net/podcast09/rss_56107.xml' },
  { name: 'France Culture — Le cours de l\'histoire', rss: 'https://radiofrance-podcast.net/podcast09/rss_11549.xml' },
  { name: 'France Inter — Le grand entretien', rss: 'https://radiofrance-podcast.net/podcast09/rss_13963.xml' },
  { name: 'Choses à Savoir',                   rss: 'https://podcast.ausha.co/choses-a-savoir/rss.xml' },
  { name: 'Les Chemins de la philosophie',     rss: 'https://radiofrance-podcast.net/podcast09/rss_14400.xml' },
];

async function fetchPodcastEpisode() {
  // Shuffle so we rotate across sources
  const sources = PODCAST_SOURCES.slice().sort(() => Math.random() - 0.5);
  for (const src of sources) {
    try {
      const res = await fetch(src.rss, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) { console.log(`[listening] ${src.name} HTTP ${res.status}`); continue; }
      const xml = await res.text();

      const items = [];
      const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRegex.exec(xml)) !== null) {
        const block = m[1];
        const get = (tag) => {
          const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
          const found = block.match(r);
          return found ? extractCdata(found[1]) : '';
        };
        const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+\.mp3[^"]*)"/i)
                            || block.match(/<enclosure[^>]+url="([^"]+)"/i);
        const audioUrl = enclosureMatch ? enclosureMatch[1].replace(/&amp;/g, '&') : null;
        const title = decodeEntities(get('title'));
        const pubDate = get('pubDate') || '';
        if (title && audioUrl) items.push({ title, audioUrl, pubDate, source: src.name });
      }

      if (items.length > 0) {
        const episode = items[Math.floor(Math.random() * Math.min(items.length, 10))];
        console.log(`[listening] Using ${src.name}: "${episode.title}"`);
        return episode;
      }
      console.log(`[listening] ${src.name}: 0 usable items`);
    } catch (e) {
      console.warn(`[listening] ${src.name} failed:`, e.message);
    }
  }
  throw new Error('All podcast sources failed');
}

// ── Deepgram transcription ────────────────────────────────────────────────────
const CLIP_DURATION = 180;          // 3 minutes shown to user
const AUDIO_DOWNLOAD_BYTES = 12_000_000; // ~8 min at 192kbps / ~12 min at 128kbps

async function transcribeWithDeepgram(audioBuffer, deepgramKey) {
  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&language=fr&punctuate=true&smart_format=true',
    {
      method: 'POST',
      headers: { 'Authorization': `Token ${deepgramKey}`, 'Content-Type': 'audio/mpeg' },
      body: audioBuffer,
      signal: AbortSignal.timeout(25000),
    }
  );
  if (!res.ok) throw new Error(`Deepgram error ${res.status}`);
  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt?.words?.length) throw new Error('Deepgram returned no words');
  console.log(`[deepgram] ${alt.words.length} words transcribed`);
  return alt.words; // [{word, punctuated_word, start, end}]
}

// Ask Claude to pick the best ~3-minute window from the full transcript
async function pickBestSegment(apiKey, words) {
  // Build a compact timestamped transcript for Claude
  // Sample every 5th word to keep the prompt short
  const samples = words.filter((_, i) => i % 5 === 0).map(w => `[${w.start.toFixed(0)}s] ${w.punctuated_word || w.word}`).join(' ');
  const totalDuration = words[words.length - 1]?.end || 0;

  const result = await claudeJSON({
    apiKey, maxTokens: 80,
    system: `You are selecting the best ${CLIP_DURATION}-second excerpt from a French podcast for language learners. Pick a window that is interesting, coherent, and self-contained (not mid-sentence at start/end). The audio is ${Math.round(totalDuration)}s long. Return ONLY raw JSON: {"startSec":N}`,
    user: `Timestamped transcript samples:\n${samples}`,
  });

  const rawStart = Math.round(result.startSec ?? 0);
  // Clamp: ensure the clip fits within the audio and starts after any intro
  const minStart = Math.min(30, Math.floor(totalDuration * 0.05)); // skip short intros
  const maxStart = Math.max(0, totalDuration - CLIP_DURATION - 10);
  const startSec = Math.min(Math.max(rawStart, minStart), maxStart);
  const endSec = startSec + CLIP_DURATION;
  console.log(`[listening] Best segment: ${startSec}s – ${endSec}s`);
  return { startSec, endSec };
}

// ── Generate a full listening bundle ────────────────────────────────────────
async function generateListeningBundle(apiKey, level = 'B1') {
  const { DEEPGRAM_API_KEY } = getEnv();

  // 1. Pick a random podcast episode
  const episode = await fetchPodcastEpisode();

  // 2. Download first ~8 min of audio
  const audioRes = await fetch(episode.audioUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Range': `bytes=0-${AUDIO_DOWNLOAD_BYTES - 1}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  console.log(`[listening] Downloaded ${audioBuffer.length} bytes`);

  // 3. Transcribe full download with Deepgram
  const allWords = await transcribeWithDeepgram(audioBuffer, DEEPGRAM_API_KEY);
  if (allWords.length < 20) throw new Error('Transcript too short');

  // 4. Claude picks the most interesting 3-min window (runs in parallel with exercises)
  const segmentPromise = pickBestSegment(apiKey, allWords);

  // Build a preview transcript (first 3 min) for generating exercises while segment is picked
  const previewWords = allWords.filter(w => w.start <= CLIP_DURATION);
  const previewTranscript = previewWords.map(w => w.punctuated_word || w.word).join(' ');

  // 5. Generate exercises from preview transcript + pick segment (parallel)
  const [{ startSec, endSec }, qParsed, vParsed, gParsed, cParsed] = await Promise.all([
    segmentPromise,
    claudeJSON({ apiKey, maxTokens: 800, system: `French teacher. 4 multiple-choice comprehension questions for ${level} learner. Also infer vocab theme. Raw JSON: {"vocabTheme":"...","questions":[{"question":"...","options":["A","B","C","D"],"answer":"A"}]}`, user: previewTranscript }),
    claudeJSON({ apiKey, maxTokens: 700, system: `French teacher. 5 vocabulary fill-in-the-blank from transcript for ${level} learner. Raw JSON: {"vocab":[{"word":"...","definition":"English","sentence":"...___..."}]}`, user: previewTranscript }),
    claudeJSON({ apiKey, maxTokens: 900, system: `French grammar teacher. Exactly 2 grammar structures from transcript for ${level} learner, each with 2 fill-in-the-blank exercises (one "___" per sentence; hint = base form of answer). Raw JSON: {"grammar":[{"point":"...","example":"...","explanation":"...","tip":"...","exercises":[{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."}]}]}`, user: previewTranscript }),
    claudeJSON({ apiKey, maxTokens: 600, system: 'French teacher. 4 conjugation fill-in-the-blank using verbs from transcript. Raw JSON: {"conjugation":[{"verb":"...","tense":"...","sentence":"...___...","answer":"...","hint":"je/tu/il..."}]}', user: previewTranscript }),
  ]);

  // 6. Extract words and transcript for the chosen segment
  const segmentWords = allWords.filter(w => w.start >= startSec && w.end <= endSec);
  const transcript = segmentWords.map(w => w.punctuated_word || w.word).join(' ');
  // Word timings relative to segment start (so t=0 aligns with clipStart in player)
  const wordTimings = segmentWords.map(w => ({
    word: w.punctuated_word || w.word,
    start: parseFloat((w.start - startSec).toFixed(3)),
    end: parseFloat((w.end - startSec).toFixed(3)),
  }));

  if (!transcript || transcript.length < 40) throw new Error('Segment transcript too short');

  return {
    title: episode.title,
    transcript,
    wordTimings,
    audioUrl: episode.audioUrl,
    clipStart: startSec,
    clipEnd: endSec,
    source: episode.source,
    date: episode.pubDate || new Date().toUTCString(),
    vocabTheme: qParsed.vocabTheme || '',
    questions: qParsed.questions || [],
    vocab: vParsed.vocab || [],
    grammar: gParsed.grammar || [],
    conjugation: cParsed.conjugation || [],
  };
}

// ── Generate a writing prompt bundle ────────────────────────────────────────
// Strip any non-Latin script (CJK, Japanese kana, Korean, Cyrillic, Arabic, etc.)
// that some models occasionally leak into French output. Keeps Latin letters,
// French accents, digits and common punctuation.
function stripNonFrench(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ　-〿぀-ゟ゠-ヿ㄀-ㄯ㄰-㆏가-힯一-鿿豈-﫿＀-￯]/g, '')
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

// Random topic pool for background replenishment — without this, the model
// regenerates near-identical "everyday Parisian" prompts every time.
const PROMPT_TOPIC_POOL = [
  'Paris et ses secrets', 'Un souvenir de voyage', 'La vie de quartier', 'Les réseaux sociaux',
  'Un dîner mémorable', 'Le métro parisien', 'Les saisons à Paris', 'Mon café préféré',
  'Une rencontre inattendue', 'Le travail et les études', 'La cuisine et les restos',
  'Les loisirs et le sport', "La famille et l'amitié", 'Les voyages', 'Le cinéma français',
];
const pickPromptTopic = () => PROMPT_TOPIC_POOL[Math.floor(Math.random() * PROMPT_TOPIC_POOL.length)];

async function generateWritingBundle(apiKey, level = 'B1', topic = '') {
  topic = topic || pickPromptTopic();
  const data = deepStripNonFrench(await claudeJSON({
    apiKey, maxTokens: 1000,
    system: `French writing teacher. Create a writing challenge for a ${level} learner${topic ? ` on: ${topic}` : ''}. Include useful vocab, expressions, grammar tips, conjugation helpers, and connectors.
CRITICAL: Write EVERYTHING in French only. Use ONLY the Latin alphabet with French accents. NEVER include Chinese, Japanese, Korean, Cyrillic, Arabic or any other non-Latin characters — not a single one.
Raw JSON: {"prompt":"Write a paragraph about...","wordTarget":80,"tips":{"vocab":["mot1","mot2"],"expressions":["expr1"],"grammar":["tip1"],"conjugation":["verb: je ___"],"connecteurs":["d'abord","ensuite"]}}`,
    user: topic || 'choose an everyday Parisian topic',
  }));
  return {
    topic: topic || '',
    prompt: data.prompt || '',
    word_target: data.wordTarget || 80,
    tips: data.tips || { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] },
    level,
  };
}

// ── Generate a speaking prompt bundle ───────────────────────────────────────
async function generateSpeakingBundle(apiKey, topic = '', level = 'B1') {
  topic = topic || pickPromptTopic();
  const narrators = ['lea', 'jules'];
  const narratorId = narrators[Math.floor(Math.random() * narrators.length)];
  const data = await claudeJSON({
    apiKey, maxTokens: 600,
    system: `You are a Parisian French speaking coach designing a practice challenge for a ${level} learner. For the topic, design:
1. ONE grammar structure to practice (e.g. passé composé, subjonctif, pronoms relatifs, comparatifs, futur proche).
2. THREE useful French vocabulary words/expressions to use.
3. A warm, natural opening QUESTION in French that naturally pushes the learner to use that grammar and those words in their spoken answer.
Raw JSON only: {"openingLine":"...","openingLineTranslation":"English","topicLabel":"short FR label","grammarPoint":"FR name of structure","grammarHint":"short English hint how to use it","vocab":[{"word":"FR word/expr","meaning":"English"}]}`,
    user: `Topic: ${topic || 'la vie parisienne'}`,
  });
  return {
    topic: topic || '',
    narrator_id: narratorId,
    opening_line: data.openingLine || 'Bonjour ! Comment ça va ?',
    opening_line_translation: data.openingLineTranslation || 'Hello! How are you?',
    topic_label: data.topicLabel || topic || 'Conversation',
    target_grammar: (data.grammarPoint || data.grammarHint)
      ? { point: data.grammarPoint || '', hint: data.grammarHint || '' }
      : null,
    target_vocab: Array.isArray(data.vocab) ? data.vocab.slice(0, 4) : null,
  };
}

const MIN_STOCK = 1;

// ── Supabase helper ──────────────────────────────────────────────────────────
function getSupabase() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  const url = NEXT_PUBLIC_SUPABASE_URL;
  const key = SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function handleReading(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const topic = body?.topic || '';
  const empty = { passage: '', source: null, title: '', author: null, date: null, vocab: [], questions: [], grammar: [], conjugation: [] };
  if (!ANTHROPIC_API_KEY || !topic) return { statusCode: 200, body: empty };

  const supabase = getSupabase();

  // 1. Serve from stock
  if (supabase) {
    const { data: rows } = await supabase
      .from('reading_articles')
      .select('*')
      .eq('served', false)
      .order('created_at', { ascending: true })
      .limit(1);
    if (rows && rows.length > 0) {
      const row = rows[0];
      // Mark as served (fire-and-forget)
      supabase.from('reading_articles').update({ served: true }).eq('id', row.id).then(() => {});
      // Replenish stock in background so we never run dry
      triggerReplenish();
      return {
        statusCode: 200,
        body: {
          passage: row.passage, title: row.title, source: row.source,
          author: row.author, date: row.date, link: row.link,
          vocab: row.vocab || [], questions: row.questions || [],
          grammar: row.grammar || [], conjugation: row.conjugation || [],
        },
      };
    }
  }

  // 2. Stock empty — generate on-demand
  try {
    const bundle = await generateReadingBundle(ANTHROPIC_API_KEY);
    // Save to DB for future use (fire-and-forget)
    if (supabase) {
      supabase.from('reading_articles').insert([{ ...bundle, served: true }]).then(() => {});
    }
    return { statusCode: 200, body: bundle };
  } catch {
    return { statusCode: 200, body: empty };
  }
}

export async function handleWritingPrompt(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const topic = body?.topic || '';
  const level = body?.learnerLevel || 'B1';
  const empty = { prompt: '', tips: { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] }, wordTarget: 80 };
  if (!ANTHROPIC_API_KEY) return { statusCode: 200, body: empty };

  const supabase = getSupabaseAdmin() || getSupabase();

  // Serve any usable stock row: exact level first, then any level, then even
  // already-served rows — anything beats an empty prompt. Skips empty rows.
  const serveFromStock = async () => {
    if (!supabase) return null;
    const queries = [
      (q) => q.eq('served', false).eq('level', level),
      (q) => q.eq('served', false),
      (q) => q,
    ];
    for (const apply of queries) {
      const { data: rows } = await apply(
        supabase.from('writing_prompts').select('*').neq('prompt', '').order('created_at', { ascending: true })
      ).limit(5);
      const row = (rows || []).find(r => r.prompt?.trim());
      if (row) return row;
    }
    return null;
  };

  // 1. Serve from stock
  const stockRow = await serveFromStock();
  if (stockRow) {
    supabase.from('writing_prompts').update({ served: true }).eq('id', stockRow.id).then(() => {});
    triggerReplenish();
    return { statusCode: 200, body: { prompt: stockRow.prompt, tips: stockRow.tips || empty.tips, wordTarget: stockRow.word_target || 80 } };
  }

  // 2. Generate on-demand — never save or serve an empty generation
  try {
    const bundle = await generateWritingBundle(ANTHROPIC_API_KEY, level, topic);
    if (!bundle.prompt?.trim()) throw new Error('Empty writing prompt generated');
    if (supabase) {
      supabase.from('writing_prompts').insert([{ ...bundle, served: true }]).then(() => {});
    }
    return { statusCode: 200, body: { prompt: bundle.prompt, tips: bundle.tips, wordTarget: bundle.word_target } };
  } catch {
    return { statusCode: 200, body: empty };
  }
}

export async function handleSpeakingPrompt(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const topic = body?.topic || '';
  const empty = { narratorId: 'lea', openingLine: 'Bonjour !', openingLineTranslation: 'Hello!', topicLabel: topic };
  if (!ANTHROPIC_API_KEY) return { statusCode: 200, body: empty };

  const supabase = getSupabaseAdmin() || getSupabase();

  // Serve any usable stock row: unserved first, then anything non-empty.
  const serveFromStock = async () => {
    if (!supabase) return null;
    const queries = [(q) => q.eq('served', false), (q) => q];
    for (const apply of queries) {
      const { data: rows } = await apply(
        supabase.from('speaking_prompts').select('*').neq('opening_line', '').order('created_at', { ascending: true })
      ).limit(5);
      const row = (rows || []).find(r => r.opening_line?.trim());
      if (row) return row;
    }
    return null;
  };

  // 1. Serve from stock
  const stockRow = await serveFromStock();
  if (stockRow) {
    supabase.from('speaking_prompts').update({ served: true }).eq('id', stockRow.id).then(() => {});
    triggerReplenish();
    return { statusCode: 200, body: { narratorId: stockRow.narrator_id, openingLine: stockRow.opening_line, openingLineTranslation: stockRow.opening_line_translation, topicLabel: stockRow.topic_label, targetGrammar: stockRow.target_grammar || null, targetVocab: stockRow.target_vocab || null } };
  }

  // 2. Generate on-demand — never save or serve an empty generation
  try {
    const bundle = await generateSpeakingBundle(ANTHROPIC_API_KEY, topic);
    if (!bundle.opening_line?.trim()) throw new Error('Empty speaking prompt generated');
    if (supabase) {
      supabase.from('speaking_prompts').insert([{ ...bundle, served: true }]).then(() => {});
    }
    return { statusCode: 200, body: { narratorId: bundle.narrator_id, openingLine: bundle.opening_line, openingLineTranslation: bundle.opening_line_translation, topicLabel: bundle.topic_label, targetGrammar: bundle.target_grammar, targetVocab: bundle.target_vocab } };
  } catch {
    return { statusCode: 200, body: empty };
  }
}

export async function handleWordChallenge(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const { utterance = '', word = '', meaning = '', narratorId = 'lea', attemptNumber = 1 } = body || {};
  const empty = { feedback: '', isCorrect: false };
  if (!ANTHROPIC_API_KEY || !utterance.trim() || !word) return { statusCode: 200, body: empty };

  const name = narratorId === 'lea' ? 'Léa' : 'Jules';
  const gender = narratorId === 'lea' ? 'une Parisienne' : 'un Parisien';
  const isFinal = attemptNumber >= 3;

  try {
    const result = await claudeJSON({
      apiKey: ANTHROPIC_API_KEY,
      system: `Tu es ${name}, ${gender} natif(ve). Un étudiant pratique le mot argotique/parisien "${word}" (= ${meaning}).
Il vient de faire la tentative n°${attemptNumber}/3.
Juge en vrai(e) Parisien(ne) exigeant(e) : isCorrect=true UNIQUEMENT si la phrase contient bien "${word}" (conjugué ou accordé, ça compte) ET que le mot est employé avec le bon sens (${meaning}), une grammaire correcte et de façon naturelle, comme le dirait un Parisien. Si le mot est absent, déformé, ou utilisé à contresens → isCorrect=false. Une phrase grammaticalement juste mais où le mot sonne faux → false aussi.
${isFinal ? `C'est la dernière tentative. Donne aussi 2 exemples de vraies phrases parisiennes utilisant "${word}", puis propose un sujet de conversation aléatoire et sympa pour continuer.` : `Dis-lui brièvement si c'est bien ou pas, et invite-le à refaire une phrase — VARIE ta formulation à chaque tentative (ex. "Allez, tente une autre !", "Vas-y, refais-moi une phrase !", "Encore une, pour voir ?", "Une dernière pour la route !"), ne répète jamais la même tournure.`}
Réponds toujours en français, ton naturel et chaleureux.
JSON: {"isCorrect":true/false,"feedback":"...(1-2 phrases)","corrected":"phrase corrigée si mauvaise, sinon null","examples":["ex1","ex2"] ou null,"nextTopic":"sujet ou null"}`,
      user: `Phrase de l'étudiant : "${utterance}"`,
      maxTokens: 350,
    });
    return {
      statusCode: 200,
      body: {
        isCorrect: !!result.isCorrect,
        feedback: result.feedback || '',
        corrected: result.corrected || null,
        examples: isFinal ? (result.examples || []) : null,
        nextTopic: isFinal ? (result.nextTopic || null) : null,
      },
    };
  } catch {
    return { statusCode: 200, body: empty };
  }
}

export async function handleWritingReview(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const { step = 'feedback', narratorId = 'lea', level = 'B1' } = body || {};
  const name = narratorId === 'lea' ? 'Léa' : 'Jules';
  const gender = narratorId === 'lea' ? 'une Parisienne' : 'un Parisien';
  if (!ANTHROPIC_API_KEY) return { statusCode: 200, body: {} };

  try {
    if (step === 'feedback') {
      const { text = '', prompt = '', tips = {}, wordTarget = 80 } = body || {};
      if (!text.trim()) return { statusCode: 200, body: { reaction: '' } };
      const tipList = ['vocab', 'expressions', 'grammar', 'conjugation', 'connecteurs']
        .map(k => (tips?.[k]?.length ? `${k}: ${tips[k].join(', ')}` : null))
        .filter(Boolean).join(' | ');
      const result = await claudeJSON({
        apiKey: ANTHROPIC_API_KEY,
        maxTokens: 280,
        system: `Tu es ${name}, ${gender} qui coache un étudiant ${level} à l'écrit.\nLe défi d'écriture était : "${prompt}" (objectif ~${wordTarget} mots).\nConseils donnés : ${tipList || 'aucun'}.\nJuge le texte de l'étudiant par rapport au défi : a-t-il atteint la longueur, utilisé le vocabulaire / les expressions / la grammaire / les connecteurs suggérés ? Sois chaleureux(se), précis(e) et encourageant(e). 2-3 phrases en français.\nTermine TOUJOURS par une relance : une question ou un mini-défi concret qui le pousse à réessayer en utilisant 2-3 mots ou expressions PRÉCIS des conseils qu'il n'a pas encore utilisés (cite-les entre « »).\nJSON: {"reaction":"..."}`,
        user: `Texte de l'étudiant :\n"${text}"`,
      });
      return { statusCode: 200, body: { reaction: result.reaction || '' } };
    }

    if (step === 'explain') {
      const { question = '', original = '', corrected = '' } = body || {};
      if (!question.trim()) return { statusCode: 200, body: { explanation: '', exercise: null } };
      const result = await claudeJSON({
        apiKey: ANTHROPIC_API_KEY,
        maxTokens: 500,
        system: `Tu es ${name}, ${gender} qui aide un étudiant ${level}.\nL'étudiant n'a pas compris "${question}" dans la correction de son texte.\nTexte original: "${original}"\nVersion corrigée: "${corrected}"\nÉtape 1 : explique simplement en français ce que veut dire "${question}" (2-3 phrases).\nÉtape 2 : crée UN exercice court pour pratiquer cet élément. Choisis le type le plus adapté.\nTypes possibles:\n- {"type":"fill-blank","sentence":"... ___ ...","answer":"...","hint":"indice court"}\n- {"type":"mcq","question":"...","options":["a","b","c"],"answer":"option correcte exacte"}\n- {"type":"rephrase","instruction":"...","example":"phrase à reformuler","answer":"reformulation correcte"}\nJSON: {"explanation":"...","exercise":{...}}`,
        user: `Élément à expliquer : "${question}"`,
      });
      return { statusCode: 200, body: { explanation: result.explanation || '', exercise: result.exercise || null } };
    }

    return { statusCode: 200, body: {} };
  } catch {
    return { statusCode: 200, body: {} };
  }
}

export async function handleSpeakingReaction(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const { utterance = '', narratorId = 'lea', topic = '', openingLine = '' } = body || {};
  const empty = { text: '', translation: '' };
  if (!ANTHROPIC_API_KEY || !utterance.trim()) return { statusCode: 200, body: empty };

  const name = narratorId === 'lea' ? 'Léa' : 'Jules';
  const gender = narratorId === 'lea' ? 'une Parisienne' : 'un Parisien';
  try {
    const result = await claudeJSON({
      apiKey: ANTHROPIC_API_KEY,
      system: `Tu es ${name}, ${gender} natif(ve) qui aide un étudiant à pratiquer le français oral.\nLe sujet de conversation: "${topic || 'conversation libre'}"\nTu as lancé la conversation en disant: "${openingLine}"\nL'étudiant vient de parler. Réponds naturellement en 1-2 phrases courtes en français.\nSois curieux(se), encourageant(e), et rebondis sur ce qu'il a dit.\nJSON: {"text":"...", "translation":"..."}`,
      user: `L'étudiant a dit: "${utterance}"`,
      maxTokens: 200,
    });
    return { statusCode: 200, body: { text: result.text || '', translation: result.translation || '' } };
  } catch {
    return { statusCode: 200, body: empty };
  }
}

// ── Trigger background replenishment via self-call ───────────────────────────
async function triggerReplenish() {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173';
  fetch(`${base}/api/replenish`, { method: 'POST' }).catch(() => {});
}

export async function handleReplenish() {
  const { ANTHROPIC_API_KEY } = getEnv();
  if (!ANTHROPIC_API_KEY) return { statusCode: 200, body: { ok: true } };
  const supabase = getSupabase();
  if (!supabase) return { statusCode: 200, body: { ok: true } };

  const counts = await Promise.all([
    supabase.from('reading_articles').select('id', { count: 'exact', head: true }).eq('served', false),
    supabase.from('listening_episodes').select('id', { count: 'exact', head: true }),
    supabase.from('writing_prompts').select('id', { count: 'exact', head: true }).eq('served', false),
    supabase.from('speaking_prompts').select('id', { count: 'exact', head: true }).eq('served', false),
  ]);
  const [readCount, listenCount, writeCount, speakCount] = counts.map(r => r.count || 0);

  const tasks = [];

  for (let i = readCount; i < MIN_STOCK; i++) {
    tasks.push(generateReadingBundle(ANTHROPIC_API_KEY).then(b => supabase.from('reading_articles').insert([{ ...b, served: false }])).catch(() => {}));
  }
  for (let i = listenCount; i < MIN_STOCK; i++) {
    tasks.push(generateListeningBundle(ANTHROPIC_API_KEY).then(async b => {
      return supabase.from('listening_episodes').insert([{
        level: 'B1', title: b.title, audio_url: b.audioUrl,
        clip_start: b.clipStart ?? 0,
        clip_end: b.clipEnd ?? CLIP_DURATION,
        transcript: b.transcript,
        word_timings: b.wordTimings || null,
        source_name: b.source, pub_date: b.date, vocab_theme: b.vocabTheme,
        questions: b.questions, vocab: b.vocab, grammar: b.grammar, conjugation: b.conjugation,
      }]);
    }).catch(() => {}));
  }
  for (let i = writeCount; i < MIN_STOCK; i++) {
    tasks.push(generateWritingBundle(ANTHROPIC_API_KEY).then(b => supabase.from('writing_prompts').insert([{ ...b, served: false }])).catch(() => {}));
  }
  for (let i = speakCount; i < MIN_STOCK; i++) {
    tasks.push(generateSpeakingBundle(ANTHROPIC_API_KEY).then(b => supabase.from('speaking_prompts').insert([{ ...b, served: false }])).catch(() => {}));
  }

  // Run up to 4 tasks concurrently to avoid timeout
  for (let i = 0; i < tasks.length; i += 4) {
    await Promise.allSettled(tasks.slice(i, i + 4));
  }

  return { statusCode: 200, body: { ok: true, generated: tasks.length } };
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

export async function handleWord() {
  const { ANTHROPIC_API_KEY, ELEVENLABS_API_KEY } = getEnv();
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 200, body: { word: null } };
  }

  // Service role so reads AND restock inserts work (RLS blocks the anon key)
  const supabase = getSupabaseAdmin() || getSupabase();

  try {
    let cachedWords = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('parisian_words').select('*');
        if (!error && data) cachedWords = data;
      } catch {}
    }

    // Stock-first: ALWAYS serve instantly from DB when stock exists.
    // Generation only happens when the stock is completely empty.
    if (cachedWords.length > 0) {
      const cached = cachedWords[Math.floor(Math.random() * cachedWords.length)];
      return {
        statusCode: 200,
        body: {
          word: cached.word,
          meaning: cached.meaning,
          example: cached.example,
          // DB columns are lowercase; fall back to camelCase for safety
          exampleTranslation: cached.exampletranslation ?? cached.exampleTranslation ?? '',
          audioUrl: cached.audiourl ?? cached.audioUrl ?? null,
          explanation: cached.explanation || buildWordIntro(cached),
          narratorId: cached.narratorid || narratorForWord(cached.word),
        },
      };
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: 'You are a French language teacher specializing in authentic Parisian French. Pick a vivid, interesting French word or expression — something a Parisian would actually say, not too basic, not too rare. Provide: the word/expression, its short English meaning, one natural example sentence in French, and an English translation of that sentence. Respond with raw JSON only, no markdown: {"word":"...","meaning":"...","example":"...","exampleTranslation":"..."}',
        messages: [{ role: 'user', content: 'Give me an interesting Parisian French word to learn today.' }],
      }),
    });
    const claudeData = await claudeRes.json();
    let raw = claudeData.content?.[0]?.text?.trim() || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw);
    if (!parsed.word) throw new Error('No word generated');

    // Strip any non-French characters (CJK etc.) that Haiku sometimes injects
    const stripGarble = (s) => (s || '').replace(/[^ -ɏ\s«»'"''""!?.,;:()\-–—]/g, '').replace(/\s+/g, ' ').trim();
    parsed.word = stripGarble(parsed.word);
    parsed.meaning = stripGarble(parsed.meaning);
    parsed.example = stripGarble(parsed.example);
    parsed.exampleTranslation = stripGarble(parsed.exampleTranslation);
    if (!parsed.word) throw new Error('Word was empty after sanitization');

    let audioUrl = null;
    if (ELEVENLABS_API_KEY && parsed.example) {
      const { slug, voiceId } = resolveNarrator('lea');
      const cached = await getCachedNarratorAudio(slug, voiceId, parsed.example);
      if (cached?.audioUrl) {
        audioUrl = cached.audioUrl;
      } else {
        try {
          const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({
              text: parsed.example,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.82, similarity_boost: 0.88, style: 0.08, use_speaker_boost: true },
            }),
          });
          if (elRes.ok) {
            const buf = Buffer.from(await elRes.arrayBuffer());
            audioUrl = await saveNarratorAudio(slug, voiceId, parsed.example, buf);
          }
        } catch {}
      }
    }

    // Pre-warm the narrator's explanation audio so the intro plays instantly
    const narratorId = narratorForWord(parsed.word);
    const explanation = buildWordIntro(parsed);
    if (ELEVENLABS_API_KEY) {
      try {
        const { slug, voiceId } = resolveNarrator(narratorId);
        const cachedIntro = await getCachedNarratorAudio(slug, voiceId, explanation);
        if (!cachedIntro?.audioUrl) {
          const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({
              text: explanation,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true },
            }),
          });
          if (elRes.ok) await saveNarratorAudio(slug, voiceId, explanation, Buffer.from(await elRes.arrayBuffer()));
        }
      } catch {}
    }

    // NOTE: parisian_words columns are all lowercase in Postgres
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

    if (supabase) {
      let { error } = await supabase.from('parisian_words').insert([entry]);
      // Migration 008 not run yet → retry without the new columns
      if (error && /explanation|narratorid/i.test(error.message || '')) {
        const { explanation: _e, narratorid: _n, ...legacy } = entry;
        ({ error } = await supabase.from('parisian_words').insert([legacy]));
      }
      if (error) console.error('[word] parisian_words insert failed:', error.message);
    }

    return { statusCode: 200, body: { ...parsed, audioUrl, explanation, narratorId } };
  } catch {
    return { statusCode: 200, body: { word: null } };
  }
}

export async function handleListening(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const level = body?.learnerLevel || 'B1';
  const topic = body?.topic || '';

  const empty = { title: '', audioUrl: null, transcript: '', source: '', date: null, vocabTheme: '', questions: [], vocab: [], grammar: [], conjugation: [] };
  if (!ANTHROPIC_API_KEY) return { statusCode: 200, body: empty };

  // Service role so the fire-and-forget save can't be blocked by RLS
  const supabase = getSupabaseAdmin() || getSupabase();

  try {
    // 1. Serve from DB stock — fall back to ANY level rather than generating
    // live, so the user never waits when stock exists at all.
    if (supabase) {
      let { data: cached } = await supabase
        .from('listening_episodes')
        .select('*')
        .eq('level', level)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cached || cached.length === 0) {
        ({ data: cached } = await supabase
          .from('listening_episodes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20));
      }
      if (cached && cached.length > 0) {
        const row = cached[Math.floor(Math.random() * cached.length)];
        return {
          statusCode: 200,
          body: {
            title: row.title,
            audioUrl: row.audio_url || null,
            clipStart: row.clip_start ?? 0,
            clipEnd: row.clip_end ?? CLIP_DURATION,
            transcript: row.transcript,
            wordTimings: row.word_timings || null,
            source: row.source_name,
            date: row.pub_date,
            vocabTheme: row.vocab_theme,
            questions: row.questions || [],
            vocab: row.vocab || [],
            grammar: row.grammar || [],
            conjugation: row.conjugation || [],
          },
        };
      }
    }

    // 2. Stock empty — generate on-demand
    const bundle = await generateListeningBundle(ANTHROPIC_API_KEY, level, topic);

    // Save to DB (fire-and-forget)
    if (supabase) {
      supabase.from('listening_episodes').insert([{
        level, title: bundle.title, audio_url: bundle.audioUrl,
        clip_start: bundle.clipStart ?? 0,
        clip_end: bundle.clipEnd ?? CLIP_DURATION,
        transcript: bundle.transcript,
        word_timings: bundle.wordTimings || null,
        source_name: bundle.source,
        pub_date: bundle.date, vocab_theme: bundle.vocabTheme,
        questions: bundle.questions, vocab: bundle.vocab,
        grammar: bundle.grammar, conjugation: bundle.conjugation,
      }]).then(({ error }) => { if (error) console.warn('[listening] insert failed:', error.message); });
    }

    return {
      statusCode: 200,
      body: bundle,
    };
  } catch (err) {
    console.error('[listening] error:', err.message);
    return { statusCode: 200, body: empty };
  }
}
