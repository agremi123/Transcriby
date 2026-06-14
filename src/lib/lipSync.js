// Local, API-free lip-sync engine shared by the narrator audio pipeline and the
// 3D talking avatar. It produces a live "mouth" signal from whatever narrator
// line is currently playing, two ways combined:
//
//   1. JAW (openness) — a Web Audio AnalyserNode taps the actual playing audio
//      and we read its RMS volume each frame. This is perfectly in sync with the
//      voice because it IS the voice, not an estimate.
//   2. VISEME (shape) — from the spoken text + playback time we pick the mouth
//      shape (Oculus viseme) for the sound being said right now: lips together
//      for m/b/p, rounded for o/u, wide for a, etc.
//
// The avatar reads `readMouth()` every render frame. Nothing here is per-line
// API; once the audio is fetched it's all client-side.

// ── Amplitude tap (shared analyser per AudioContext) ─────────────────────────
let analyser = null;
let analyserCtx = null;
let timeData = null;

// Speech RMS is small (~0.05–0.2); scale up and gate out near-silence.
const AMP_GAIN = 6.5;
const AMP_GATE = 0.025;

function ensureAnalyser(ctx) {
  if (analyser && analyserCtx === ctx) return analyser;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.35;
  timeData = new Uint8Array(analyser.fftSize);
  analyserCtx = ctx;
  return analyser;
}

/** Fan a playing source into the shared analyser (in addition to its normal
 *  path to the speakers). Sources auto-detach when they stop, so this is safe
 *  to call once per line with no cleanup. */
export function tapSource(ctx, source) {
  try { source.connect(ensureAnalyser(ctx)); } catch { /* analyser optional */ }
}

function sampleAmplitude() {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(timeData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / timeData.length);
  if (rms < AMP_GATE) return 0;
  return Math.min(1, rms * AMP_GAIN);
}

// ── Viseme timeline (mouth shape from the words) ─────────────────────────────
// Oculus viseme ids present on Avaturn / Ready Player Me heads.
// French letter → the viseme whose mouth shape best matches the sound.
function charToViseme(c) {
  switch (c) {
    case 'a': case 'à': case 'â': case 'e': case 'é': case 'è': case 'ê': case 'ë':
      return c === 'a' || c === 'à' || c === 'â' ? 'aa' : 'E';
    case 'i': case 'î': case 'ï': case 'y': return 'I';
    case 'o': case 'ô': return 'O';
    case 'u': case 'ù': case 'û': case 'w': return 'U';
    case 'm': case 'b': case 'p': return 'PP'; // lips together
    case 'f': case 'v': return 'FF';
    case 's': case 'z': case 'ç': case 'c': return 'SS';
    case 'j': case 'g': return 'CH';
    case 't': case 'd': return 'DD';
    case 'k': case 'q': case 'x': return 'kk';
    case 'n': return 'nn';
    case 'l': return 'nn';
    case 'r': return 'RR';
    default: return null; // spaces, digits, punctuation → no shape (rest)
  }
}

let timeline = [];      // [{ start, end, viseme }]
let playbackTime = 0;   // seconds, fed from the audio tick
let lineActive = false;

/** Build a per-character viseme timeline scaled to the clip's real duration.
 *  Vowels are held a touch longer than consonants so the mouth reads naturally. */
function buildVisemeTimeline(text, durationSec) {
  const chars = [...String(text || '').toLowerCase()];
  if (!chars.length || !durationSec) return [];

  // Detect the 'ch'/'gn' digraphs cheaply by peeking ahead.
  const tokens = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === 'c' && chars[i + 1] === 'h') { tokens.push({ v: 'CH', w: 1 }); i++; continue; }
    const v = charToViseme(c);
    const isVowel = 'aàâeéèêëiîïyoôuùûw'.includes(c);
    tokens.push({ v, w: v ? (isVowel ? 1.5 : 0.9) : 0.6 });
  }

  const totalW = tokens.reduce((a, t) => a + t.w, 0) || 1;
  let cursor = 0;
  const segs = [];
  for (const t of tokens) {
    const dur = (t.w / totalW) * durationSec;
    if (t.v) segs.push({ start: cursor, end: cursor + dur, viseme: t.v });
    cursor += dur;
  }
  return segs;
}

export function startLine(text, durationSec) {
  timeline = buildVisemeTimeline(text, durationSec);
  playbackTime = 0;
  lineActive = timeline.length > 0;
}

/** Fed from the audio playback tick (seconds elapsed; null when the line ends). */
export function setPlaybackTime(t) {
  if (t == null) { lineActive = false; return; }
  playbackTime = t;
}

export function stopLine() {
  lineActive = false;
  timeline = [];
}

function currentViseme() {
  if (!lineActive || !timeline.length) return null;
  const t = playbackTime;
  // Timeline is ordered; a short linear scan is fine for one sentence.
  for (let i = 0; i < timeline.length; i++) {
    if (t >= timeline[i].start && t < timeline[i].end) return timeline[i].viseme;
  }
  return null;
}

// ── What the avatar reads every frame ────────────────────────────────────────
/** { amp: 0..1 mouth openness, viseme: string|null mouth shape }. */
export function readMouth() {
  return { amp: sampleAmplitude(), viseme: currentViseme() };
}

/** All viseme ids we may emit — the avatar uses this to find matching morphs. */
export const VISEME_IDS = ['PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];

/** Visemes made with the lips together/forward — the avatar closes the jaw for these. */
export const CLOSED_VISEMES = new Set(['PP']);
export const ROUNDED_VISEMES = new Set(['O', 'U']);
