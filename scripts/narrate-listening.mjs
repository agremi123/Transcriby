// One-time narration generator for the listening stockpile.
//
// For each clip in data/stock/listening.json, this calls ElevenLabs'
// text-to-speech "with timestamps" endpoint using the same Léa/Jules voices and
// settings the app uses, then:
//   • saves the MP3 to public/listening-audio/<id>.mp3 (committed → deploys)
//   • folds the per-CHARACTER timings into per-WORD timings, aligned exactly
//     with how the player tokenises the transcript (text.split(/\s+/))
//   • writes audioUrl + wordTimings + clipEnd back into listening.json
//
// Idempotent: skips clips that already have an audioUrl unless you pass --force.
// Run once:  node scripts/narrate-listening.mjs   (reads ELEVENLABS_API_KEY from .env)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LISTENING_FILE = resolve(ROOT, 'data/stock/listening.json');
const AUDIO_DIR = resolve(ROOT, 'public/listening-audio');
const FORCE = process.argv.includes('--force');

// Same voices the app uses (server/narrator-audio-cache.js)
const VOICES = { lea: 'ebRwkdEFVZIx2A6YucFh', jules: 'n1u6R6yj3qEpDLH3liBh' };

function loadEnvKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {}
  return null;
}

// The player normalises the transcript exactly like this before splitting.
const normalize = (t) => (t || '').replace(/\s*\n+\s*/g, ' ').trim();

// Fold ElevenLabs char-level alignment into word-level timings, tokenising the
// SAME way the player does (split on whitespace). Returns [{word,start,end}].
function buildWordTimings(alignment) {
  const chars = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const timings = [];
  let cur = null; // { word, startIdx, endIdx }
  for (let i = 0; i < chars.length; i++) {
    const isSpace = /\s/.test(chars[i]);
    if (isSpace) {
      if (cur) { timings.push(cur); cur = null; }
    } else if (cur) {
      cur.word += chars[i]; cur.endIdx = i;
    } else {
      cur = { word: chars[i], startIdx: i, endIdx: i };
    }
  }
  if (cur) timings.push(cur);
  return timings.map((t) => ({
    word: t.word,
    start: Math.round(starts[t.startIdx] * 1000) / 1000,
    end: Math.round(ends[t.endIdx] * 1000) / 1000,
  }));
}

async function narrate(text, voiceId, apiKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.82, similarity_boost: 0.88, style: 0.08, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const apiKey = loadEnvKey('ELEVENLABS_API_KEY');
  if (!apiKey) { console.error('❌ ELEVENLABS_API_KEY not found in env or .env'); process.exit(1); }

  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  const clips = JSON.parse(readFileSync(LISTENING_FILE, 'utf8'));

  let done = 0, skipped = 0;
  for (const clip of clips) {
    if (clip.audioUrl && !FORCE) { console.log(`⏭  ${clip.id} already has audio — skipping`); skipped++; continue; }
    const voiceId = VOICES[clip.narratorId] || VOICES.lea;
    const text = normalize(clip.transcript);
    const expectedWords = text.split(/\s+/).filter(Boolean).length;

    process.stdout.write(`🎙  ${clip.id} (${clip.narratorId}) … `);
    const data = await narrate(text, voiceId, apiKey);

    // audio
    const buf = Buffer.from(data.audio_base64, 'base64');
    writeFileSync(resolve(AUDIO_DIR, `${clip.id}.mp3`), buf);

    // word timings (raw alignment matches the original input characters)
    const timings = buildWordTimings(data.alignment || data.normalized_alignment || {});
    if (timings.length !== expectedWords) {
      console.log(`\n   ⚠ token mismatch: ${timings.length} timed vs ${expectedWords} in transcript — highlight may drift slightly`);
    }
    const lastEnd = timings.length ? timings[timings.length - 1].end : 0;

    clip.audioUrl = `/listening-audio/${clip.id}.mp3`;
    clip.wordTimings = timings;
    clip.clipStart = 0;
    clip.clipEnd = Math.ceil(lastEnd);
    console.log(`ok — ${(buf.length / 1024).toFixed(0)}KB, ${timings.length} words, ${clip.clipEnd}s`);
    done++;
  }

  writeFileSync(LISTENING_FILE, JSON.stringify(clips, null, 2) + '\n');
  console.log(`\n✅ Narrated ${done}, skipped ${skipped}. Audio in public/listening-audio/, timings written to listening.json`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
