import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
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
          system: `You are a French reading exercise creator for language learners. Search for a real recent French-language article or news piece that would be engaging and culturally relevant for someone learning French (topics like French culture, Paris life, French cinema, food, current events in France, French society, sport in France, etc.). Extract verbatim 5-8 sentences from the article in French at roughly B1-B2 level. Output ONLY a JSON object, nothing else: {"title":"article title in French","passage":"...verbatim French sentences...","source":"publication name e.g. Le Monde","author":"author name or null","date":"publication date e.g. 12 juin 2025 or null"}`,
          messages: [{ role: 'user', content: `Find a recent engaging French article for language learners about: ${topic}` }],
        }),
      });
      const searchData = await searchRes.json();

      let passage = '';
      let title = '';
      let source = null;
      let author = null;
      let date = null;

      // Try to find a JSON block in the response text
      const textBlock = searchData.content?.find((b) => b.type === 'text');
      if (textBlock?.text) {
        const txt = textBlock.text.trim();
        // Try to parse the last JSON object containing "passage"
        const jsonMatches = [...txt.matchAll(/\{[\s\S]*?"passage"[\s\S]*?\}/g)];
        if (jsonMatches.length > 0) {
          try {
            const parsed = JSON.parse(jsonMatches[jsonMatches.length - 1][0]);
            passage = parsed.passage || '';
            title = parsed.title || '';
            source = parsed.source || null;
            author = parsed.author || null;
            date = parsed.date || null;
          } catch {}
        }
        // Fallback: extract French lines
        if (!passage) {
          const lines = txt.split('\n').filter((l) => l.trim().length > 20);
          const frenchLines = lines.filter((l) => /[àâäéèêëîïôöùûüç]/i.test(l) || /\b(le|la|les|un|une|des|et|est|en|de|du|au|ce|qu|pour)\b/i.test(l));
          if (frenchLines.length > 0) passage = frenchLines.slice(0, 8).join(' ').trim();
        }
      }

      // Step 2: if web search gave nothing useful, generate a synthetic passage
      if (!passage || passage.length < 40) {
        const genRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system: 'Write an engaging authentic French passage of 6 sentences about the given topic, at B1-B2 level, suitable for French learners. Also give it a title. Output ONLY raw JSON: {"title":"...","passage":"...6 sentences in French..."}',
            messages: [{ role: 'user', content: `Topic: ${topic}` }],
          }),
        });
        const genData = await genRes.json();
        let genRaw = genData.content?.[0]?.text?.trim() || '{}';
        genRaw = genRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        try {
          const genParsed = JSON.parse(genRaw);
          passage = genParsed.passage || '';
          title = genParsed.title || '';
        } catch {
          passage = genRaw;
        }
        source = null;
        author = null;
        date = null;
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

      // Step 4: generate vocabulary exercise from the passage
      const vRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system: `You are a French language teacher. From the given French passage, pick exactly 5 difficult or interesting vocabulary words that a B1-B2 learner should know. For each word, write a NEW French sentence (not from the original passage) with the word replaced by ___. The learner must pick the correct word from the word bank to fill each blank. Return ONLY raw JSON: {"vocab":[{"word":"médiatique","definition":"relating to media / media-related","sentence":"Le groupe ___ a racheté plusieurs journaux régionaux."},{"word":"...","definition":"...","sentence":"...___..."}]}`,
          messages: [{ role: 'user', content: passage }],
        }),
      });
      const vData = await vRes.json();
      let vRaw = vData.content?.[0]?.text?.trim() || '{}';
      vRaw = vRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let vocab = [];
      try { ({ vocab = [] } = JSON.parse(vRaw)); } catch {}

      // Save session
      saveSession({ id: Date.now(), topic, title, passage, source, author, date, questions, vocab, createdAt: new Date().toISOString() });

      res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title, passage, source, author, date, questions, vocab }));
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
        const title = (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>/) || b.match(/<title>([^<]{3,})<\/title>/))?.[1]?.trim() || '';
        const audioUrl = (b.match(/enclosure[^>]+url="([^"]+\.mp3[^"]*)"/) || b.match(/enclosure[^>]+url="([^"]+)"/))?.[ 1] || '';
        const link = b.match(/<link>(https?:[^<]+)<\/link>/)?.[1]?.trim() || '';
        const pubDate = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
        const desc = (b.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/) || b.match(/<description>([^<]*)<\/description>/))?.[1]?.trim() || '';
        // Spreaker / Podcast Index built-in plain-text transcript
        const transcriptUrl = (b.match(/<podcast:transcript[^>]+type="text\/plain"[^>]+url="([^"]+)"/) || b.match(/<podcast:transcript[^>]+url="([^"]+)"[^>]+type="text\/plain"/))?.[1] || '';
        if (audioUrl && title) items.push({ title, audioUrl, link, pubDate, desc, transcriptUrl });
      }

      if (!items.length) { console.log(`[listening] ${source.id} 0 items`); continue; }

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

function listeningMiddleware(anthropicKey, deepgramKey, elevenlabsKey) {
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
      // Step 1: try podcast sources — prefer level-matched ones first
      const found = await fetchPodcastEpisode(learnerLevel);
      let episode = found?.episode || null;
      const sourceName = found?.source?.name || 'RFI — Journal en Français Facile';
      let generatedAudioUrl = null;

      if (!episode) {
        // All sources failed — generate with Claude + ElevenLabs
        console.log('[listening] All sources unavailable — generating episode with Claude + ElevenLabs');
        const genRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 900,
            system: 'You are a French radio journalist for "Journal en Français Facile" on RFI. Write a short French news bulletin (250-300 words, B1-B2 level) on a current cultural, social, or environmental topic. Use natural spoken French. Return ONLY raw JSON: {"title":"Episode title","transcript":"Full text of the bulletin"}',
            messages: [{ role: 'user', content: `Topic hint: ${topic || 'culture française'}` }],
          }),
        });
        const genData = await genRes.json();
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

      // 3d. RSS description fallback
      if (!transcript || transcript.length < 40) transcript = (episode.desc || '').replace(/<[^>]+>/g, '').trim();

      if (!transcript || transcript.length < 40) throw new Error('No transcript available');

      // Always truncate to ~400 words (≈ 2:30 of speech at 130 wpm) to match the audio clip
      const words = transcript.split(/\s+/);
      if (words.length > 400) transcript = words.slice(0, 400).join(' ') + '…';

      const level = learnerLevel || 'B1';

      // Step 4: generate 4 MCQ comprehension questions + infer vocab theme — one call
      const qRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: `You are a French language teacher creating a comprehension exercise for a ${level} learner. Based on the transcript, create exactly 4 multiple-choice comprehension questions in French. Also infer the main vocabulary theme of the text (e.g. "Environnement", "Santé", "Société", "Culture", "Politique", "Technologie", "Voyage"). Adjust question difficulty to ${level} level. Respond with raw JSON only, no markdown: {"vocabTheme":"Environnement","questions":[{"question":"Question?","options":["A","B","C","D"],"answer":"A"},{"question":"...","options":["...","...","...","..."],"answer":"..."},{"question":"...","options":["...","...","...","..."],"answer":"..."},{"question":"...","options":["...","...","...","..."],"answer":"..."}]}`,
          messages: [{ role: 'user', content: `Transcript:\n${transcript.slice(0, 2000)}` }],
        }),
      });
      const qData = await qRes.json();
      let qRaw = qData.content?.[0]?.text?.trim() || '{}';
      qRaw = qRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let questions = [], vocabTheme = '';
      try { const p = JSON.parse(qRaw); questions = p.questions || []; vocabTheme = p.vocabTheme || ''; } catch {}

      // Step 5: generate vocabulary list targeted to theme + level
      const vRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system: `You are a French language teacher. From the given French transcript, pick exactly 5 vocabulary words relevant to a ${level} learner${vocabTheme ? ` studying the theme "${vocabTheme}"` : ''}. Choose words appropriate for ${level} level — not too easy, not too advanced. For each, write a NEW French sentence with the word replaced by ___. Return ONLY raw JSON: {"vocab":[{"word":"...","definition":"English definition","sentence":"...___..."},{"word":"...","definition":"...","sentence":"...___..."}]}`,
          messages: [{ role: 'user', content: transcript.slice(0, 2000) }],
        }),
      });
      const vData = await vRes.json();
      let vRaw = vData.content?.[0]?.text?.trim() || '{}';
      vRaw = vRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let vocab = [];
      try { ({ vocab = [] } = JSON.parse(vRaw)); } catch {}

      // Step 6: generate grammar points from the transcript
      const gRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system: `You are a French grammar teacher. From the French transcript, identify 3 grammar structures or patterns that a ${level} learner should study. For each, quote the exact sentence from the transcript that illustrates it, name the grammar point, explain it simply in English (1-2 sentences), and give a short usage tip. Return ONLY raw JSON: {"grammar":[{"point":"Le passé composé","example":"Exact sentence from transcript","explanation":"Used to describe completed past actions.","tip":"Use avoir or être as auxiliary + past participle."},{"point":"...","example":"...","explanation":"...","tip":"..."},{"point":"...","example":"...","explanation":"...","tip":"..."}]}`,
          messages: [{ role: 'user', content: transcript.slice(0, 2000) }],
        }),
      });
      const gData = await gRes.json();
      let gRaw = gData.content?.[0]?.text?.trim() || '{}';
      gRaw = gRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let grammar = [];
      try { ({ grammar = [] } = JSON.parse(gRaw)); } catch {}

      res.end(JSON.stringify({
        title: episode.title,
        audioUrl: clipAudioUrl,
        transcript,
        source: sourceName,
        date: episode.pubDate,
        vocabTheme,
        questions,
        vocab,
        grammar,
      }));
    } catch (err) {
      console.error('[listening] error:', err.message);
      res.end(JSON.stringify({ title: '', audioUrl: null, transcript: '', source: 'RFI', questions: [], vocab: [], grammar: [] }));
    }
  };
}

const SPEAKING_NARRATORS = ['jules', 'lea'];
function speakingPromptMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/speaking-prompt' || req.method !== 'POST') { next(); return; }
    let topic = '';
    try { topic = (JSON.parse(await readBody(req))).topic || ''; } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    if (!apiKey) { res.end(JSON.stringify({ narratorId: 'lea', openingLine: '', topic })); return; }
    try {
      const narratorId = SPEAKING_NARRATORS[Math.floor(Math.random() * SPEAKING_NARRATORS.length)];
      const name = narratorId === 'lea' ? 'Léa' : 'Jules';
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: `You are ${name}, a native Parisian French speaker. Generate a warm, natural conversation opener in French (2-3 sentences, B1-B2 level) to start a conversation about the given topic with a French learner. Make it engaging and culturally Parisian. Return ONLY raw JSON: {"openingLine":"...","openingLineTranslation":"English translation of openingLine","topicLabel":"short label for the topic in French (3-5 words)"}`,
          messages: [{ role: 'user', content: `Topic: ${topic}` }],
        }),
      });
      const d = await r.json();
      let raw = d.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(raw);
      res.end(JSON.stringify({ narratorId, openingLine: parsed.openingLine || '', openingLineTranslation: parsed.openingLineTranslation || '', topicLabel: parsed.topicLabel || topic }));
    } catch { res.end(JSON.stringify({ narratorId: 'lea', openingLine: '', topicLabel: topic })); }
  };
}

function writingPromptMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/writing-prompt' || req.method !== 'POST') { next(); return; }
    let topic = '', learnerLevel = 'B1';
    try { const b = JSON.parse(await readBody(req)); topic = b.topic || ''; learnerLevel = b.learnerLevel || 'B1'; } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    const empty = { prompt: '', tips: { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] }, wordTarget: 80 };
    if (!apiKey) { res.end(JSON.stringify(empty)); return; }
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: `You are a French writing coach. Generate a specific, engaging writing prompt in French for a ${learnerLevel} learner about the given topic. Make it cultural, societal, or fun — something a Parisian would actually discuss.
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
        }),
      });
      const d = await r.json();
      let raw = d.content?.[0]?.text?.trim() || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(raw);
      const tips = parsed.tips || {};
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

function translateWordMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/translate-word' || req.method !== 'POST') { next(); return; }
    let word = '', context = '';
    try { const b = JSON.parse(await readBody(req)); word = b.word || ''; context = b.context || ''; } catch {}
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
    if (!apiKey || !word.trim()) { res.end(JSON.stringify({ translation: '' })); return; }
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 40,
          system: 'French-English dictionary. Return ONLY the English translation of the given French word (1–4 words max). No punctuation, no explanation.',
          messages: [{ role: 'user', content: context ? `"${word}" (context: ${context.slice(0, 120)})` : `"${word}"` }],
        }),
      });
      const d = await r.json();
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
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(readingMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(audioProxyMiddleware());
          server.middlewares.use(sessionAudioMiddleware());
          server.middlewares.use(listeningMiddleware(env.ANTHROPIC_API_KEY, env.DEEPGRAM_API_KEY, env.ELEVENLABS_API_KEY));
          server.middlewares.use(speakingPromptMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(writingPromptMiddleware(env.ANTHROPIC_API_KEY));
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
          server.middlewares.use(audioProxyMiddleware());
          server.middlewares.use(sessionAudioMiddleware());
          server.middlewares.use(listeningMiddleware(env.ANTHROPIC_API_KEY, env.DEEPGRAM_API_KEY, env.ELEVENLABS_API_KEY));
          server.middlewares.use(speakingPromptMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(writingPromptMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(translateWordMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
      },
    ],
  };
});
