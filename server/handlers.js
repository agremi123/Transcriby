import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';
import {
  getCachedNarratorAudio,
  saveNarratorAudio,
  resolveNarrator,
} from './narrator-audio-cache.js';
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
    const title       = get('title');
    const description = stripHtml(get('description') || get('summary'));
    const content     = stripHtml(get('content:encoded') || get('content'));
    const link        = get('link') || block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
    const pubDate     = get('pubDate') || get('dc:date') || '';
    const author      = get('dc:creator') || get('author') || '';
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

  const itemSummaries = allItems.slice(0, 60).map((item, i) =>
    `[${i}] ${item.feedName} — ${item.title}\n${(item.description || '').slice(0, 200)}`
  ).join('\n\n');

  const { index } = await claudeJSON({
    apiKey, maxTokens: 20,
    system: 'Pick any interesting article. Reply ONLY with raw JSON: {"index": <integer>}',
    user: itemSummaries,
  });
  const idx = Math.min(Math.max(parseInt(index, 10) || 0, 0), allItems.length - 1);
  const chosen = allItems[idx];

  let rawText = '';
  if (chosen.link) rawText = await fetchArticleBody(chosen.link);
  if (rawText.length < 200) rawText = chosen.content || chosen.description || '';
  // Strip CJK characters that can appear in scraped page sidebars/ads
  rawText = rawText.replace(/[　-鿿가-힯豈-﫿]/g, '').slice(0, 6000);

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
      apiKey, maxTokens: 800,
      system: 'Create exactly 4 multiple-choice comprehension questions about the French passage. Raw JSON only: {"questions":[{"question":"...","options":["A","B","C","D"],"answer":"A"}]}',
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

// ── RFI Journal en Français Facile podcast RSS ───────────────────────────────
const RFI_JFF_RSS = 'https://apis.fle.rfi.fr/products/get_product/fle_getpodcast_by_nid_author_rfi?token_application=applepodcast_fle&program.entrepriseId=WBMZ39-FLE-FR-20220627';

async function fetchRfiJffEpisode() {
  const res = await fetch(RFI_JFF_RSS, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('RFI RSS fetch failed');
  const xml = await res.text();

  // Parse items including enclosure (audio) and description
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
    const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+)"/i);
    const audioUrl = enclosureMatch ? enclosureMatch[1] : null;
    const title = get('title');
    const description = stripHtml(get('description') || get('summary') || '');
    const pubDate = get('pubDate') || '';
    const link = get('link') || '';
    if (title && audioUrl) items.push({ title, audioUrl, description, pubDate, link });
  }

  if (items.length === 0) throw new Error('No RFI episodes found');
  // Pick a random recent episode
  const episode = items[Math.floor(Math.random() * Math.min(items.length, 10))];
  return episode;
}

// ── Generate a full listening bundle ────────────────────────────────────────
async function generateListeningBundle(apiKey, level = 'B1') {
  // Fetch real RFI JFF episode with actual audio
  const episode = await fetchRfiJffEpisode();

  // Use the description as transcript base; Claude cleans and extracts it
  const rawText = episode.description || '';
  let transcript = rawText;

  // If description is too short, ask Claude to write a summary based on the title
  if (rawText.length < 100) {
    const generated = await claudeJSON({
      apiKey, maxTokens: 600,
      system: 'Tu es journaliste RFI. Écris un résumé de 150-200 mots en français facile (niveau B1) basé sur ce titre d\'actualité. Réponds uniquement avec le texte du résumé, sans titre ni introduction.',
      user: episode.title,
    });
    transcript = typeof generated === 'string' ? generated : (generated.transcript || generated.text || rawText);
    if (typeof transcript !== 'string' || transcript.length < 40) transcript = rawText;
  }

  // Trim to max 400 words
  const words = transcript.split(/\s+/);
  if (words.length > 400) transcript = words.slice(0, 400).join(' ') + '…';
  if (!transcript || transcript.length < 40) throw new Error('No transcript');

  const [qParsed, vParsed, gParsed, cParsed] = await Promise.all([
    claudeJSON({ apiKey, maxTokens: 800, system: `French teacher. 4 multiple-choice comprehension questions for ${level} learner. Also infer vocab theme. Raw JSON: {"vocabTheme":"...","questions":[{"question":"...","options":["A","B","C","D"],"answer":"A"}]}`, user: transcript }),
    claudeJSON({ apiKey, maxTokens: 700, system: `French teacher. 5 vocabulary fill-in-the-blank from transcript for ${level} learner. Raw JSON: {"vocab":[{"word":"...","definition":"English","sentence":"...___..."}]}`, user: transcript }),
    claudeJSON({ apiKey, maxTokens: 700, system: `French grammar teacher. 3 grammar structures from transcript for ${level} learner. Raw JSON: {"grammar":[{"point":"...","example":"...","explanation":"...","tip":"..."}]}`, user: transcript }),
    claudeJSON({ apiKey, maxTokens: 600, system: 'French teacher. 4 conjugation fill-in-the-blank using verbs from transcript. Raw JSON: {"conjugation":[{"verb":"...","tense":"...","sentence":"...___...","answer":"...","hint":"je/tu/il..."}]}', user: transcript }),
  ]);

  return {
    title: episode.title,
    transcript,
    audioUrl: episode.audioUrl,  // real MP3 URL from RFI
    source: 'RFI — Journal en Français Facile',
    date: episode.pubDate || new Date().toUTCString(),
    vocabTheme: qParsed.vocabTheme || '',
    questions: qParsed.questions || [],
    vocab: vParsed.vocab || [],
    grammar: gParsed.grammar || [],
    conjugation: cParsed.conjugation || [],
  };
}

// ── Generate a writing prompt bundle ────────────────────────────────────────
async function generateWritingBundle(apiKey, level = 'B1', topic = '') {
  const data = await claudeJSON({
    apiKey, maxTokens: 1000,
    system: `French writing teacher. Create a writing challenge for a ${level} learner${topic ? ` on: ${topic}` : ''}. Include useful vocab, expressions, grammar tips, conjugation helpers, and connectors. Raw JSON: {"prompt":"Write a paragraph about...","wordTarget":80,"tips":{"vocab":["mot1","mot2"],"expressions":["expr1"],"grammar":["tip1"],"conjugation":["verb: je ___"],"connecteurs":["d'abord","ensuite"]}}`,
    user: topic || 'choose an everyday Parisian topic',
  });
  return {
    topic: topic || '',
    prompt: data.prompt || '',
    word_target: data.wordTarget || 80,
    tips: data.tips || { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] },
    level,
  };
}

// ── Generate a speaking prompt bundle ───────────────────────────────────────
async function generateSpeakingBundle(apiKey, topic = '') {
  const narrators = ['lea', 'jules'];
  const narratorId = narrators[Math.floor(Math.random() * narrators.length)];
  const data = await claudeJSON({
    apiKey, maxTokens: 400,
    system: 'You are a Parisian French conversation partner. Create a natural conversation opener in French. Raw JSON: {"openingLine":"Bonjour ! ...","openingLineTranslation":"Hello! ...","topicLabel":"Topic name"}',
    user: `Topic: ${topic || 'la vie parisienne'}`,
  });
  return {
    topic: topic || '',
    narrator_id: narratorId,
    opening_line: data.openingLine || 'Bonjour ! Comment ça va ?',
    opening_line_translation: data.openingLineTranslation || 'Hello! How are you?',
    topic_label: data.topicLabel || topic || 'Conversation',
  };
}

const MIN_STOCK = 5;

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

  const supabase = getSupabase();

  // 1. Serve from stock
  if (supabase) {
    const { data: rows } = await supabase
      .from('writing_prompts')
      .select('*')
      .eq('served', false)
      .eq('level', level)
      .order('created_at', { ascending: true })
      .limit(1);
    if (rows && rows.length > 0) {
      const row = rows[0];
      supabase.from('writing_prompts').update({ served: true }).eq('id', row.id).then(() => {});
      triggerReplenish();
      return { statusCode: 200, body: { prompt: row.prompt, tips: row.tips || empty.tips, wordTarget: row.word_target || 80 } };
    }
  }

  // 2. Generate on-demand
  try {
    const bundle = await generateWritingBundle(ANTHROPIC_API_KEY, level, topic);
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

  const supabase = getSupabase();

  // 1. Serve from stock
  if (supabase) {
    const { data: rows } = await supabase
      .from('speaking_prompts')
      .select('*')
      .eq('served', false)
      .order('created_at', { ascending: true })
      .limit(1);
    if (rows && rows.length > 0) {
      const row = rows[0];
      supabase.from('speaking_prompts').update({ served: true }).eq('id', row.id).then(() => {});
      triggerReplenish();
      return { statusCode: 200, body: { narratorId: row.narrator_id, openingLine: row.opening_line, openingLineTranslation: row.opening_line_translation, topicLabel: row.topic_label } };
    }
  }

  // 2. Generate on-demand
  try {
    const bundle = await generateSpeakingBundle(ANTHROPIC_API_KEY, topic);
    if (supabase) {
      supabase.from('speaking_prompts').insert([{ ...bundle, served: true }]).then(() => {});
    }
    return { statusCode: 200, body: { narratorId: bundle.narrator_id, openingLine: bundle.opening_line, openingLineTranslation: bundle.opening_line_translation, topicLabel: bundle.topic_label } };
  } catch {
    return { statusCode: 200, body: empty };
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
      // Use real RFI podcast MP3 URL — no TTS
      return supabase.from('listening_episodes').insert([{
        level: 'B1', title: b.title, audio_url: b.audioUrl, transcript: b.transcript,
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

export async function handleWord() {
  const { ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getEnv();
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 200, body: { word: null } };
  }

  let supabase = null;
  if (NEXT_PUBLIC_SUPABASE_URL && NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }

  try {
    let cachedWords = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('parisian_words').select('*');
        if (!error && data) cachedWords = data;
      } catch {}
    }

    const useCached = cachedWords.length > 0 && Math.random() < 0.7;
    if (useCached) {
      const cached = cachedWords[Math.floor(Math.random() * cachedWords.length)];
      return {
        statusCode: 200,
        body: {
          word: cached.word,
          meaning: cached.meaning,
          example: cached.example,
          exampleTranslation: cached.exampleTranslation,
          audioUrl: cached.audioUrl,
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

    const entry = {
      id: Date.now(),
      word: parsed.word,
      meaning: parsed.meaning,
      example: parsed.example,
      exampleTranslation: parsed.exampleTranslation,
      voiceId: ELEVENLABS_VOICES.lea,
      audioUrl,
      createdAt: new Date().toISOString(),
    };

    if (supabase) {
      try {
        await supabase.from('parisian_words').insert([entry]);
      } catch {}
    }

    return { statusCode: 200, body: { ...parsed, audioUrl } };
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

  const supabase = getSupabase();

  try {
    // 1. Serve from DB stock
    if (supabase) {
      const { data: cached } = await supabase
        .from('listening_episodes')
        .select('*')
        .eq('level', level)
        .order('created_at', { ascending: false })
        .limit(20);
      if (cached && cached.length > 0) {
        const row = cached[Math.floor(Math.random() * cached.length)];
          return {
          statusCode: 200,
          body: {
            title: row.title,
            audioUrl: row.audio_url || null,
            transcript: row.transcript,
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
        transcript: bundle.transcript, source_name: bundle.source,
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
