import {
  normalizeCorrectionText,
  normalizeForCompare,
  prepareCorrectionForDisplay,
} from './correctionFormat';

const STORAGE_KEY = 'nativa-deepgram-learned-keyterms';
const MAX_LEARNED_KEYTERMS = 30;
/** Deepgram nova-3 caps all keyterms at 500 tokens — stay safely under. */
const MAX_KEYTERM_TOKENS = 380;

/** Base Parisian / spoken French boosts before any learner corrections. */
export const CASUAL_FRENCH_KEYTERMS = [
  "t'as", "t'es", "t'inquiète", "t'appelles", "t'aimes", "t'habites",
  "j'suis", "j'ai", "j'sais", "j'veux", "j'vais", "j'habite", "j'adore", "j'peux", "j'm'appelle",
  "c'est", "y'a", "qu'il", "d'accord", "s'te plaît", "p'tit", "m'appelle",
  "l'ai", "n'ai", "n'est",
  'ouf', 'bof', 'chelou', 'genre', 'carrément', 'vachement', 'franchement',
  'mouais', 'nickel', 'parisien', 'parisienne', 'Paris', 'Parisly',
  'salut', 'bonjour', 'coucou', 'mec', 'pote', 'barre', 'nana', 'meuf',
  'truc', 'machin', 'boulot', 'taf', 'baguette', 'café', 'terrasse',
  'manuel', 'textbook', 'niveau', 'français', 'francais',
  'viens', 'vais', 'fais', 'veux', 'sais', 'peux', 'dois',
  'États-Unis', 'France', 'parler', 'écrire', 'répète', 'correct',
  'Rémi', 'Rémi',
];

function cleanToken(word) {
  return String(word || '')
    .replace(/^[«"'([{]+|[.,!?;:""'»)\]}]+$/g, '')
    .trim();
}

function keytermKey(text) {
  return normalizeForCompare(text);
}

/** Rough token estimate for Deepgram keyterm budget (not 1:1 with words). */
function estimateKeytermTokens(term) {
  const words = String(term || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  return words.reduce((sum, word) => sum + Math.max(1, Math.ceil(word.length / 3.5)), 0);
}

function pickKeytermsWithinTokenBudget(candidates) {
  const picked = [];
  let tokens = 0;
  for (const term of candidates) {
    const trimmed = String(term || '').trim();
    if (!trimmed) continue;
    const cost = estimateKeytermTokens(trimmed);
    if (tokens + cost > MAX_KEYTERM_TOKENS) continue;
    picked.push(trimmed);
    tokens += cost;
  }
  return picked;
}

function loadLearnedTerms() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.terms) ? parsed.terms : [];
  } catch {
    return [];
  }
}

function saveLearnedTerms(terms) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ terms }));
}

function extractKeytermsFromCorrection(original, corrected) {
  const corr = normalizeCorrectionText(corrected);
  const orig = normalizeCorrectionText(original);
  if (!corr || keytermKey(orig) === keytermKey(corr)) return [];

  const corrWords = corr.split(/\s+/).map(cleanToken).filter(Boolean);
  const origWords = orig.split(/\s+/).map(cleanToken).filter(Boolean);
  const terms = new Set();

  if (corrWords.length <= 8) terms.add(corr);

  for (const word of corrWords) {
    if (word.length >= 2 || word.includes("'")) terms.add(word);
  }

  const shared = Math.min(origWords.length, corrWords.length);
  for (let i = 0; i < shared; i += 1) {
    if (keytermKey(origWords[i]) === keytermKey(corrWords[i])) continue;
    terms.add(corrWords[i]);
    if (i > 0) terms.add(`${corrWords[i - 1]} ${corrWords[i]}`);
    if (i < corrWords.length - 1) terms.add(`${corrWords[i]} ${corrWords[i + 1]}`);
  }
  for (let i = shared; i < corrWords.length; i += 1) {
    terms.add(corrWords[i]);
    if (i > 0) terms.add(`${corrWords[i - 1]} ${corrWords[i]}`);
  }

  return [...terms].filter((term) => term.length >= 2 && term.length <= 80);
}

/** Save Parisian correction targets so Deepgram recognizes them next time. */
export function registerCorrectionKeyterms(original, corrected) {
  const displayCorrected = prepareCorrectionForDisplay(original, corrected);
  const incoming = extractKeytermsFromCorrection(original, displayCorrected);
  if (!incoming.length) return;

  const byKey = new Map(loadLearnedTerms().map((entry) => [keytermKey(entry.text), entry]));
  const now = Date.now();

  for (const text of incoming) {
    const key = keytermKey(text);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = now;
    } else {
      byKey.set(key, { text, count: 1, lastUsed: now });
    }
  }

  const sorted = [...byKey.values()]
    .sort((a, b) => b.lastUsed - a.lastUsed || b.count - a.count)
    .slice(0, MAX_LEARNED_KEYTERMS);

  saveLearnedTerms(sorted);
}

/** Learned correction targets first, then the static Parisian base list. */
export function getDeepgramKeyterms() {
  const learned = loadLearnedTerms().map((entry) => entry.text);
  const learnedKeys = new Set(learned.map(keytermKey));
  const base = CASUAL_FRENCH_KEYTERMS.filter((term) => !learnedKeys.has(keytermKey(term)));
  return pickKeytermsWithinTokenBudget([...learned, ...base]);
}

export function getLearnedKeytermCount() {
  return loadLearnedTerms().length;
}

export function loadLearnedKeyterms() {
  return loadLearnedTerms();
}
