// Fill the parisian_words stock to TARGET, store each word's narrator
// explanation, and pre-warm the explanation audio in the narrator-audio
// bucket so "Discover a Parisian word" never has loading time.
// Run: node scripts/seed-parisian-words.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveNarrator, saveNarratorAudio } from '../server/narrator-audio-cache.js';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const LEA_VOICE = 'ebRwkdEFVZIx2A6YucFh';
const AUDIO_DIR = resolve('public', 'word-audio');
if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

const TARGET = 10;

// Must match buildWordIntro / narratorForWord in vite.config.js exactly
function buildWordIntro(w) {
  return `Voici ton mot parisien du jour : « ${w.word} ». Ça veut dire "${w.meaning}". Par exemple : "${w.example}". Essaie maintenant de l'utiliser dans une phrase !`;
}
function narratorForWord(word) {
  let h = 0;
  for (const c of String(word)) h = (h * 31 + c.codePointAt(0)) | 0;
  return Math.abs(h) % 2 === 0 ? 'lea' : 'jules';
}

async function tts(text, voiceId) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true } }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function generate(avoid) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat-v3-0324',
      max_tokens: 250,
      messages: [
        { role: 'system', content: 'You are a French language teacher specializing in authentic Parisian French. Pick a vivid, interesting French word or expression — something a Parisian would actually say, not too basic, not too rare. Use ONLY French and English with the Latin alphabet — no other scripts or stray characters. Provide: the word/expression, its short English meaning, one natural example sentence in French, and an English translation of that sentence. Respond with raw JSON only, no markdown: {"word":"...","meaning":"...","example":"...","exampleTranslation":"..."}' },
        { role: 'user', content: `Give me an interesting Parisian French word to learn today.${avoid.length ? ` Avoid: ${avoid.join(', ')}.` : ''}` },
      ],
    }),
  });
  const d = await r.json();
  let raw = d.choices?.[0]?.message?.content?.trim() || '{}';
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(raw);
}

// 1. Top up the stock to TARGET
const { data: existing } = await supabase.from('parisian_words').select('*');
const rows = existing || [];
const have = rows.map(w => w.word);
console.log(`Stock: ${have.length} words. Target: ${TARGET}.`);

for (let i = have.length; i < TARGET; i++) {
  try {
    const w = await generate(have);
    if (!w.word || have.includes(w.word)) { i--; continue; }
    let audiourl = null;
    if (w.example) {
      try {
        const buf = await tts(w.example, LEA_VOICE);
        const fileName = `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`;
        writeFileSync(resolve(AUDIO_DIR, fileName), buf);
        audiourl = `/word-audio/${fileName}`;
      } catch {}
    }
    const entry = {
      id: Date.now(), word: w.word, meaning: w.meaning, example: w.example,
      exampletranslation: w.exampleTranslation || '', voiceid: LEA_VOICE, audiourl,
      createdat: new Date().toISOString(),
    };
    const { error } = await supabase.from('parisian_words').insert([entry]);
    if (error) { console.error('insert failed:', error.message); continue; }
    rows.push(entry);
    have.push(w.word);
    console.log(`✓ ${w.word} — ${w.meaning}`);
  } catch (e) { console.error('skip:', e.message); }
}

// 2. Backfill explanation + narratorid, pre-warm explanation audio in the bucket
let columnsExist = true;
for (const row of rows) {
  const explanation = row.explanation || buildWordIntro(row);
  const narratorid = row.narratorid || narratorForWord(row.word);
  const { slug, voiceId } = resolveNarrator(narratorid);
  try {
    const buf = await tts(explanation, voiceId);
    const url = await saveNarratorAudio(slug, voiceId, explanation, buf);
    console.log(`♪ ${row.word} (${slug}) ${url ? 'audio cached' : 'cache FAILED'}`);
  } catch (e) { console.error(`♪ ${row.word}: ${e.message}`); }
  if (columnsExist && (!row.explanation || !row.narratorid)) {
    const { error } = await supabase.from('parisian_words')
      .update({ explanation, narratorid }).eq('id', row.id);
    if (error) {
      columnsExist = false;
      console.warn('⚠ explanation/narratorid columns missing — run supabase/migrations/008_parisian_words_explanation.sql');
    }
  }
}
console.log('Done.');
