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

export async function handleReading(body) {
  const { ANTHROPIC_API_KEY } = getEnv();
  const topic = body?.topic || '';
  if (!ANTHROPIC_API_KEY || !topic) {
    return { statusCode: 200, body: { passage: '', source: null, questions: [] } };
  }

  try {
    // Step 1: Use web search to find a real French article about the topic
    const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are helping create a French reading exercise. Search for a recent French-language article or text about the given topic. Extract a clear passage of 5-8 sentences in French from a real source. Return ONLY raw JSON, no markdown:
{
  "passage": "the French text extracted verbatim, 5-8 sentences",
  "source": "publication name or website (e.g. Le Monde, Le Figaro, 20minutes.fr)"
}
If you cannot find a real French source, write a realistic authentic passage yourself and set source to null.`,
        messages: [{ role: 'user', content: `Find a recent French article or text about: ${topic}` }],
      }),
    });

    const searchData = await searchRes.json();
    let articlePassage = '';
    let articleSource = null;

    // Extract the final text response from the tool-use chain
    const textBlock = searchData.content?.find((b) => b.type === 'text');
    if (textBlock?.text) {
      const txt = textBlock.text;
      const jsonMatch = txt.match(/\{[\s\S]*"passage"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          articlePassage = parsed.passage || '';
          articleSource = parsed.source || null;
        } catch {}
      }
      if (!articlePassage) articlePassage = txt.replace(/^[^{]*I['']?ll[^.]*\.\s*/i, '').trim();
    }

    if (!articlePassage) throw new Error('No passage found');

    // Step 2: Generate questions based on the real passage
    const qRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: `Create exactly 4 comprehension questions based on the French passage provided. Use 2 fill-in-the-blank and 2 multiple choice. Respond with raw JSON only, no markdown:
{
  "questions": [
    { "type": "fill", "sentence": "sentence from passage with one word replaced by ___", "answer": "the removed word", "hint": "infinitive or base form" },
    { "type": "fill", "sentence": "another sentence with ___", "answer": "word", "hint": "base form" },
    { "type": "mcq", "question": "Comprehension question about the passage?", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": "Option A" },
    { "type": "mcq", "question": "Another question?", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": "Option B" }
  ]
}`,
        messages: [{ role: 'user', content: `Passage:\n${articlePassage}` }],
      }),
    });

    const qData = await qRes.json();
    let raw = qData.content?.[0]?.text?.trim() || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const qParsed = JSON.parse(raw);

    return {
      statusCode: 200,
      body: {
        passage: articlePassage,
        source: articleSource,
        questions: qParsed.questions || [],
      },
    };
  } catch {
    return { statusCode: 200, body: { passage: '', source: null, questions: [] } };
  }
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
