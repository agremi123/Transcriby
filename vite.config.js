import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { handleElevenLabsTts } from './server/handlers.js';
import { sendHandlerResult } from './server/node-response.js';
import { buildCorrectionSystemPrompts } from './server/correctionPrompts.js';
import { sanitizeParisianCorrection, parseCorrectionResponse } from './src/lib/correctionFormat.js';

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
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 80,
              system: dimensionPrompt,
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
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ clarity, grammar, vocabulary }));
          return;
        }

        const isInterviewReport = interviewReport;
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: isInterviewReport ? 950 : 120,
            system: isInterviewReport
              ? `You are Léa and Jules, Parisian French coaches. A learner claimed CEFR level ${claimedLevel || 'unknown'} and answered interview questions in French. Assess their spoken French holistically. Return raw JSON only, no markdown: {"overallLevel":"B1","overallScore":72,"learnerGender":"woman","summary":"","strengths":[{"label":"Vocabulary Variety","hint":"Range and precision of word choice","score":78},{"label":"Accent & pronunciation","hint":"How natural you sound","score":74},{"label":"Flow and rhythm","hint":"Pace and continuity when you speak","score":68},{"label":"Listening skills","hint":"Following spoken French","score":66}],"weaknesses":[{"label":"Grammar accuracy","hint":"Verb forms, agreements, tenses","score":44},{"label":"Parisian style","hint":"Local register vs textbook French","score":40},{"label":"Conjugation skills","hint":"Verb forms in context","score":46},{"label":"Cultural Understanding","hint":"References, tone, and local context","score":38}]}. Include exactly 4 strengths and 4 weaknesses. Use ONLY these exact labels (do not invent new ones): Grammar accuracy, Vocabulary Variety, Parisian style, Conjugation skills, Accent & pronunciation, Flow and rhythm, Listening skills, Cultural Understanding. Each label may appear at most once in the whole response. Each score is 0-100 (higher is better). Strength scores typically 58-92. Weakness scores typically 28-58. overallScore is 0-100. overallLevel is A1, A2, B1, B2, C1, or C2. learnerGender must be "woman" or "man" — infer from how the learner speaks about themselves (adjective/participle agreement, je suis né/née, je suis content/contente, etc.). summary may be empty. Keep hints under 8 words.`
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: Math.min(1400, 240 + Math.ceil(text.length / 2.5)),
          system,
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

function wordMiddleware(anthropicKey, elevenLabsKey, supabaseUrl, supabaseKey) {
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
      const { error } = await supabase
        .from('parisian_words')
        .insert([entry]);
      if (error) console.error('[word] Supabase insert error:', error);
    } catch (err) {
      console.error('[word] Failed to save entry to Supabase:', err);
    }
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

      // 2. Decide: 70% cached, 30% new generation (gets cheaper as you use it!)
      const useCached = cachedWords.length > 0 && Math.random() < 0.7;
      let parsed;

      if (useCached) {
        // Pick random cached word
        const cached = cachedWords[Math.floor(Math.random() * cachedWords.length)];
        parsed = {
          word: cached.word,
          meaning: cached.meaning,
          example: cached.example,
          exampleTranslation: cached.exampleTranslation,
          audioUrl: cached.audioUrl,
        };
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(parsed));
        return;
      }

      // 3. Generate new word with Claude
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
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
      parsed = JSON.parse(raw);
      if (!parsed.word) throw new Error('No word generated');

      // 4. Generate audio with ElevenLabs
      let audioUrl = null;
      if (elevenLabsKey && parsed.example) {
        try {
          const elRes = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICES.stella}`,
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

      // 5. Save to database
      const entry = {
        id: Date.now(),
        word: parsed.word,
        meaning: parsed.meaning,
        example: parsed.example,
        exampleTranslation: parsed.exampleTranslation,
        voiceId: ELEVENLABS_VOICES.stella,
        audioUrl,
        createdAt: new Date().toISOString(),
      };
      saveEntry(entry);

      // 6. Return to client
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ...parsed, audioUrl }));
    } catch {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ word: null }));
    }
  };
}

function readingMiddleware(apiKey) {
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
    if (!apiKey || !topic) {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ passage: '', source: null, questions: [] })); return;
    }
    try {
      // Step 1: use web search to find a real French article passage
      const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: `You are a French reading exercise creator. Search for a real recent French-language article or news piece related to the given topic. Extract verbatim 5-8 sentences from the article in French. Then output ONLY a JSON object on the last line with no surrounding text: {"passage":"...verbatim French sentences...","source":"publication name"}`,
          messages: [{ role: 'user', content: `Find a recent French article about: ${topic}` }],
        }),
      });
      const searchData = await searchRes.json();

      let passage = '';
      let source = null;

      // Try to find a JSON block in the response text
      const textBlock = searchData.content?.find((b) => b.type === 'text');
      if (textBlock?.text) {
        const txt = textBlock.text.trim();
        // Try to parse the last JSON object in the response
        const jsonMatches = [...txt.matchAll(/\{[^{}]*"passage"[^{}]*\}/gs)];
        if (jsonMatches.length > 0) {
          try { ({ passage, source } = JSON.parse(jsonMatches[jsonMatches.length - 1][0])); } catch {}
        }
        // Fallback: strip any preamble sentences that aren't French, take remaining text
        if (!passage) {
          // Remove lines like "I found..." or "Here is..." (English preamble)
          const lines = txt.split('\n').filter((l) => l.trim().length > 20);
          const frenchLines = lines.filter((l) => /[àâäéèêëîïôöùûüç]/i.test(l) || /\b(le|la|les|un|une|des|et|est|en|de|du|au|ce|qu|pour)\b/i.test(l));
          if (frenchLines.length > 0) passage = frenchLines.slice(0, 8).join(' ').trim();
        }
      }

      // Step 2: if web search gave nothing useful, generate synthetic French passage
      if (!passage || passage.length < 40) {
        const genRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            system: 'Write an authentic French passage of exactly 6 sentences about the given topic, at B2 level. Output ONLY the French passage text, nothing else.',
            messages: [{ role: 'user', content: `Topic: ${topic}` }],
          }),
        });
        const genData = await genRes.json();
        passage = genData.content?.[0]?.text?.trim() || '';
        source = null;
      }

      if (!passage) throw new Error('no passage');

      // Step 3: generate comprehension questions
      const qRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system: `Create exactly 4 comprehension questions based on the French passage: 2 fill-in-the-blank and 2 multiple choice. Return ONLY raw JSON, no markdown: {"questions":[{"type":"fill","sentence":"sentence with ___ blank","answer":"word","hint":"base form"},{"type":"fill","sentence":"another with ___","answer":"word","hint":"base"},{"type":"mcq","question":"Question?","options":["A","B","C","D"],"answer":"A"},{"type":"mcq","question":"Question2?","options":["A","B","C","D"],"answer":"B"}]}`,
          messages: [{ role: 'user', content: passage }],
        }),
      });
      const qData = await qRes.json();
      let qRaw = qData.content?.[0]?.text?.trim() || '{}';
      qRaw = qRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let questions = [];
      try { ({ questions = [] } = JSON.parse(qRaw)); } catch {}

      // Save session
      saveSession({ id: Date.now(), topic, passage, source, questions, createdAt: new Date().toISOString() });

      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ passage, source, questions }));
    } catch (err) {
      console.error('[reading] error:', err.message);
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ passage: '', source: null, questions: [] }));
    }
  };
}

function practiceMiddleware(apiKey) {
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ exercises: parsed.exercises || [] }));
    } catch {
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ exercises: [] }));
    }
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
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(readingMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
        configurePreviewServer(server) {
          server.middlewares.use(deepgramKeyMiddleware(env.DEEPGRAM_API_KEY));
          server.middlewares.use(speechmaticsKeyMiddleware(env.SPEECHMATICS_API_KEY));
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(interviewFeedbackMiddleware());
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(readingMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
      },
    ],
  };
});
