import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

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
    try {
      const body = JSON.parse(await readBody(req));
      text = body.text || '';
      register = body.register || 'Standard';
      assessOnly = !!body.assessOnly;
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
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 120,
            system: 'You are a French language expert. Assess the overall CEFR level of the spoken French (A1, A2, B1, B2, C1, or C2). Identify one key strength. Then give one concrete actionable tip specifically targeting the NEXT level up (A1→A2, A2→B1, B1→B2, B2→C1, C1→C2). The tip must be relevant to bridging exactly that gap. Respond with raw JSON only, no markdown: {"level":"B1","strength":"...","weakness":"..."}. Keep strength and weakness to max 7 words each. The "weakness" field must be a short positive actionable advice (e.g. "Practise subjunctive mood daily"), never a problem description.',
            messages: [{ role: 'user', content: text }],
          }),
        });
        const data = await response.json();
        let raw = data.content?.[0]?.text?.trim() || '{}';
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        let level = null, strength = null, weakness = null;
        try { ({ level, strength, weakness } = JSON.parse(raw)); } catch {}
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ level, strength, weakness }));
      } catch {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ level: null }));
      }
      return;
    }

    const sharedRules = 'STRICT RULES: (1) Return ONLY a raw JSON object — no markdown, no code fences, no notes, no explanations, nothing else. (2) Also assess the CEFR level of the original spoken French (A1, A2, B1, B2, C1, or C2). Output format: {"corrected": "...", "level": "B1"}';
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
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system,
          messages: [{ role: 'user', content: text }],
        }),
      });

      const data = await response.json();
      let raw = data.content?.[0]?.text?.trim() || '{}';
      // Strip markdown code fences if present
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      let corrected = text;
      let level = null;
      try {
        const parsed = JSON.parse(raw);
        corrected = parsed.corrected || text;
        level = parsed.level || null;
      } catch {
        corrected = raw || text;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected, level }));
    } catch {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected: text, level: null }));
    }
  };
}

// ElevenLabs voices — multilingual v2 model
const ELEVENLABS_VOICES = {
  lea:   'ebRwkdEFVZIx2A6YucFh', // Léa — custom Parisian female voice
  jules: 'n1u6R6yj3qEpDLH3liBh', // Jules — custom Parisian male voice
};
const ELEVENLABS_VOICE_ID = ELEVENLABS_VOICES.lea; // default

function elevenLabsTtsMiddleware(apiKey) {
  return async (req, res, next) => {
    if (req.url !== '/api/elevenlabs-tts' || req.method !== 'POST') { next(); return; }
    let text = '', narrator = 'lea';
    try {
      const body = JSON.parse(await readBody(req));
      text = body.text || '';
      narrator = body.narrator || 'lea';
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
    }
    if (!apiKey || !text) {
      res.statusCode = 400; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing ElevenLabs key or text' })); return;
    }
    const voiceId = ELEVENLABS_VOICES[narrator] || ELEVENLABS_VOICE_ID;
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true },
          }),
        }
      );
      if (!response.ok) {
        const err = await response.text();
        res.statusCode = response.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err })); return;
      }
      const buf = await response.arrayBuffer();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.end(Buffer.from(buf));
    } catch (err) {
      res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
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
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
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
        voiceId: ELEVENLABS_VOICE_ID,
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
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
        configurePreviewServer(server) {
          server.middlewares.use(deepgramKeyMiddleware(env.DEEPGRAM_API_KEY));
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(wordMiddleware(env.ANTHROPIC_API_KEY, env.ELEVENLABS_API_KEY, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
          server.middlewares.use(elevenLabsTtsMiddleware(env.ELEVENLABS_API_KEY));
        },
      },
    ],
  };
});
