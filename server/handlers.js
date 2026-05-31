import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';
import {
  getCachedNarratorAudio,
  saveNarratorAudio,
  resolveNarrator,
} from './narrator-audio-cache.js';

export const NARRATOR_ALIASES = { jules: 'alex', lea: 'lea', stella: 'lea' };

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
  const claimedLevel = body?.claimedLevel || '';

  if (!ANTHROPIC_API_KEY || !text) {
    return { statusCode: 200, body: { corrected: text } };
  }

  if (assessOnly) {
    try {
      const isInterviewReport = interviewReport;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: isInterviewReport ? 700 : 120,
          system: isInterviewReport
            ? `You are Léa and Jules, Parisian French coaches. A learner claimed CEFR level ${claimedLevel || 'unknown'} and answered interview questions in French. Assess their spoken French holistically. Return raw JSON only, no markdown: {"overallLevel":"B1","overallScore":72,"learnerGender":"woman","summary":"You're good at speaking — you don't hesitate and your accent sounds natural. But your grammar slips on past tenses, and you still sound a bit textbook rather than Parisian.","strengths":[{"label":"Speaking confidence","hint":"You aren't afraid to speak up","score":78},{"label":"Accent & pronunciation","hint":"How natural you sound","score":74},{"label":"Vocabulary","hint":"Words you know and use","score":68}],"weaknesses":[{"label":"Grammar accuracy","hint":"Verb forms, agreements, tenses","score":44},{"label":"Parisian style","hint":"Local register vs textbook French","score":40},{"label":"Natural flow","hint":"Rhythm and pace when you speak","score":46},{"label":"Local expressions","hint":"Idioms Parisians actually use","score":38}]}. Include exactly 3 strengths and 4 weaknesses using ONLY these exact labels (do not invent new ones). Each score is 0-100 (higher is better). Strength scores typically 58-92. Weakness scores typically 28-58. overallScore is 0-100. overallLevel is A1, A2, B1, B2, C1, or C2. learnerGender must be "woman" or "man" — infer from how the learner speaks about themselves (adjective/participle agreement, je suis né/née, je suis content/contente, etc.). summary: 2-3 warm sentences in plain English — start with what they do well, then "but" or "however" for what to improve. Keep hints under 8 words.`
            : 'You are a French language expert. Assess the overall CEFR level of the spoken French (A1, A2, B1, B2, C1, or C2). Identify one key strength. Then give one concrete actionable tip specifically targeting the NEXT level up (A1→A2, A2→B1, B1→B2, B2→C1, C1→C2). The tip must be relevant to bridging exactly that gap. Respond with raw JSON only, no markdown: {"level":"B1","strength":"...","weakness":"..."}. Keep strength and weakness to max 7 words each. The "weakness" field must be a short positive actionable advice (e.g. "Practise subjunctive mood daily"), never a problem description.',
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

  const sharedRules = 'STRICT RULES: (1) Return ONLY a raw JSON object — no markdown, no code fences, no notes, no explanations, nothing else. (2) Correct ONLY the user text below — same scope, same number of ideas. (3) Preserve paragraph breaks inside the corrected string using \\n\\n. (4) Also assess the CEFR level of the original spoken French (A1, A2, B1, B2, C1, or C2). Output format: {"corrected": "...", "level": "B1"}';
  const systemPrompts = {
    Parisien: `Tu es un Parisien de 25 ans, branchée, qui corrige le français des gens pour qu'il sonne comme un vrai jeune Parisien. Réécris la phrase pour qu'elle soit naturelle, relax et authentiquement parisienne — comme si tu l'envoyais par texto à un pote. Utilise les vraies tournures des jeunes Parisiens : supprime le "ne" dans les négations (je sais pas, j'veux pas), contracte les mots (t'as, c'est, j'suis, y'a), utilise des mots du quotidien comme "genre", "carrément", "vachement", "trop", "c'est chelou", "ça me saoule", "c'est ouf". Garde le sens original mais rends-le cool et naturel. Ne traduis pas, ne changes pas la langue. ${sharedRules}`,
    Casual: `You are a French grammar corrector. Fix only grammar errors (verb forms, agreements) in casual spoken French. Keep the informal tone. ${sharedRules}`,
    Standard: `You are a French grammar corrector. Fix only grammar errors (verb forms, agreements, prepositions) in spoken French. ${sharedRules}`,
    Formal: `You are a French grammar corrector. Fix grammar errors and elevate register (formal vocabulary, no contractions) but never replace or guess words. ${sharedRules}`,
  };
  const system = systemPrompts[register] || systemPrompts.Parisien;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(1200, 180 + Math.ceil(text.length / 3)),
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });

    const data = await response.json();
    let raw = data.content?.[0]?.text?.trim() || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const corrected = extractCorrectedFromRaw(raw, text);
    let level = null;
    try {
      const parsed = JSON.parse(raw);
      level = parsed.level || null;
    } catch {
      const levelMatch = raw.match(/"level"\s*:\s*"([A-C][12])"/);
      if (levelMatch) level = levelMatch[1];
    }

    return { statusCode: 200, body: { corrected, level } };
  } catch {
    return { statusCode: 200, body: { corrected: text, level: null } };
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
        system: `You are a French language teacher. Generate exactly 4 fill-in-the-blank exercises in French to practice: "${topic}". Each sentence must have exactly one blank marked as "___". For each exercise include a "hint" field: if the answer is a conjugated verb, put the infinitive form (e.g. "aller"); for other words put the base/dictionary form. Respond with raw JSON only, no markdown: {"exercises":[{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."},{"sentence":"...___...","answer":"...","hint":"..."}]}`,
        messages: [{ role: 'user', content: `Generate 4 fill-in-the-blank French exercises for: ${topic}` }],
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
