import { createVercelHandler } from '../server/vercel-handler.js';
import { handleTts, handleElevenLabsTts } from '../server/handlers.js';

async function speechmaticsKey() {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) return { statusCode: 500, body: { error: 'SPEECHMATICS_API_KEY not configured' } };
  try {
    const smRes = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 60 }),
    });
    if (!smRes.ok) {
      const err = await smRes.json().catch(() => ({}));
      return { statusCode: smRes.status, body: { error: err.detail || err.error || 'Failed to get Speechmatics JWT' } };
    }
    const data = await smRes.json();
    return { statusCode: 200, body: { key: data.key_value } };
  } catch {
    return { statusCode: 500, body: { error: 'Failed to get Speechmatics JWT' } };
  }
}

// Three audio routes share one serverless function (Vercel Hobby caps at 12).
// vercel.json rewrites /api/tts, /api/elevenlabs-tts and /api/speechmatics/key
// here with ?route=… — the public URLs never change.
export default createVercelHandler((body, req) => {
  const route = req.query?.route || new URL(req.url, 'http://x').searchParams.get('route');
  if (route === 'smkey') return speechmaticsKey();
  if (route === 'elevenlabs') return handleElevenLabsTts(body, req);
  return handleTts(body, req);
}, { methods: ['GET', 'POST'] });
