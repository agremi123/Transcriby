import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

    let text = '';
    try {
      const body = JSON.parse(await readBody(req));
      text = body.text || '';
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
          voice: 'nova',
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

    const sharedRules = 'STRICT RULES: (1) Return ONLY a raw JSON object — no markdown, no code fences, no notes, no explanations, nothing else. (2) Never change, replace, or guess words — only fix grammar (conjugations, agreements, prepositions, articles). Keep every word exactly as spoken, even if it seems like a transcription error or a non-existent word. (3) Also assess the CEFR level of the original spoken French (A1, A2, B1, B2, C1, or C2). Output format: {"corrected": "...", "level": "B1"}';
    const systemPrompts = {
      Casual: `You are a French grammar corrector. Fix only grammar errors (verb forms, agreements) in casual spoken French. Keep the informal tone. ${sharedRules}`,
      Standard: `You are a French grammar corrector. Fix only grammar errors (verb forms, agreements, prepositions) in spoken French. ${sharedRules}`,
      Formal: `You are a French grammar corrector. Fix grammar errors and elevate register (formal vocabulary, no contractions) but never replace or guess words. ${sharedRules}`,
    };
    const system = systemPrompts[register] || systemPrompts.Standard;

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
        },
        configurePreviewServer(server) {
          server.middlewares.use(deepgramKeyMiddleware(env.DEEPGRAM_API_KEY));
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
          server.middlewares.use(practiceMiddleware(env.ANTHROPIC_API_KEY));
        },
      },
    ],
  };
});
