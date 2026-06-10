// One-off: fill the parisian_words stock (DeepSeek + ElevenLabs audio).
// Run: node scripts/seed-parisian-words.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const VOICE = 'ebRwkdEFVZIx2A6YucFh'; // lea
const AUDIO_DIR = resolve('public', 'word-audio');
if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

const TARGET = 8;

async function generate(avoid) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat-v3-0324',
      max_tokens: 250,
      messages: [
        { role: 'system', content: 'You are a French language teacher specializing in authentic Parisian French. Pick a vivid, interesting French word or expression — something a Parisian would actually say, not too basic, not too rare. Provide: the word/expression, its short English meaning, one natural example sentence in French, and an English translation of that sentence. Respond with raw JSON only, no markdown: {"word":"...","meaning":"...","example":"...","exampleTranslation":"..."}' },
        { role: 'user', content: `Give me an interesting Parisian French word to learn today.${avoid.length ? ` Avoid: ${avoid.join(', ')}.` : ''}` },
      ],
    }),
  });
  const d = await r.json();
  let raw = d.choices?.[0]?.message?.content?.trim() || '{}';
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(raw);
}

async function tts(text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true } }),
  });
  if (!r.ok) return null;
  const fileName = `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`;
  writeFileSync(resolve(AUDIO_DIR, fileName), Buffer.from(await r.arrayBuffer()));
  return `/word-audio/${fileName}`;
}

const { data: existing } = await supabase.from('parisian_words').select('word');
const have = (existing || []).map(w => w.word);
console.log(`Stock: ${have.length} words. Target: ${TARGET}.`);

for (let i = have.length; i < TARGET; i++) {
  try {
    const w = await generate(have);
    if (!w.word || have.includes(w.word)) { i--; continue; }
    const audiourl = w.example ? await tts(w.example) : null;
    const { error } = await supabase.from('parisian_words').insert([{
      id: Date.now(), word: w.word, meaning: w.meaning, example: w.example,
      exampletranslation: w.exampleTranslation || '', voiceid: VOICE, audiourl,
      createdat: new Date().toISOString(),
    }]);
    if (error) { console.error('insert failed:', error.message); continue; }
    have.push(w.word);
    console.log(`✓ ${w.word} — ${w.meaning}${audiourl ? ' (audio ✓)' : ' (no audio)'}`);
  } catch (e) { console.error('skip:', e.message); }
}
console.log('Done.');
