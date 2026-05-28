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
    try {
      const body = JSON.parse(await readBody(req));
      text = body.text || '';
      register = body.register || 'Standard';
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

    const systemPrompts = {
      Casual: 'You are a French language tutor. The user speaks casual French. Fix grammar and vocabulary errors but keep the tone informal and conversational — contractions and colloquial expressions are fine. Return ONLY the corrected text — no explanation, no quotes, no extra content. If the text is already correct, return it unchanged.',
      Standard: 'You are a French language tutor. Correct the spoken French text to standard, correct French. Return ONLY the corrected text — no explanation, no quotes, no extra content. If the text is already correct, return it unchanged.',
      Formal: 'You are a French language tutor. Rewrite the spoken French in a formal, elevated register — impeccable grammar, no contractions, sophisticated vocabulary appropriate for professional or academic contexts. Return ONLY the corrected text — no explanation, no quotes, no extra content. If the text is already correct, return it unchanged.',
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
      const corrected = data.content?.[0]?.text?.trim() || text;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected }));
    } catch {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ corrected: text }));
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
        },
        configurePreviewServer(server) {
          server.middlewares.use(deepgramKeyMiddleware(env.DEEPGRAM_API_KEY));
          server.middlewares.use(correctionMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use(ttsMiddleware(env.OPENAI_API_KEY));
        },
      },
    ],
  };
});
