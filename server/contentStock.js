// Local content stockpile — the single source of pre-generated French content
// shared by BOTH backends (the production handlers in server/handlers.js and the
// dev server in vite.config.js). Serving from here means the app does NOT call
// the paid LLM API for these content types: the pools are RECYCLABLE (a random
// pick, never "used up"), so they never run dry.
//
// JSON is imported statically so the bundler (esbuild on Vercel, Vite in dev)
// inlines it into the function — no runtime file reads that could 404 in prod.

import conjugation from '../data/stock/conjugation.json' with { type: 'json' };
import grammar from '../data/stock/grammar.json' with { type: 'json' };
import vocabulary from '../data/stock/vocabulary.json' with { type: 'json' };
import writingPrompts from '../data/stock/writing-prompts.json' with { type: 'json' };
import speakingPrompts from '../data/stock/speaking-prompts.json' with { type: 'json' };
import practice from '../data/stock/practice.json' with { type: 'json' };
import words from '../data/stock/words.json' with { type: 'json' };
import reading from '../data/stock/reading.json' with { type: 'json' };
import listening from '../data/stock/listening.json' with { type: 'json' };

const rnd = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
const atLevel = (arr, level) => (level ? arr.filter((x) => x.level === level) : arr);
// Prefer the learner's exact level; fall back to the whole pool so we never
// return nothing just because one level is thin.
const pickAtLevel = (arr, level) => rnd(atLevel(arr, level).length ? atLevel(arr, level) : arr);

// ── Runtime content (replaces live API calls) ───────────────────────────────

/** Word-of-the-day. Shape matches what handleWord returns to the client. */
export function pickWord() {
  const w = rnd(words);
  if (!w) return null;
  return {
    word: w.word,
    meaning: w.meaning,
    example: w.example,
    exampleTranslation: w.exampleTranslation || '',
    audioUrl: null,
    explanation: w.explanation || null,
    narratorId: w.narratorId || null,
  };
}

/** Writing prompt bundle. Shape matches handleWritingPrompt's body. */
export function pickWritingPrompt(level = 'B1') {
  const row = pickAtLevel(writingPrompts, level);
  if (!row) return null;
  return {
    prompt: row.prompt,
    tips: row.tips || { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] },
    wordTarget: row.word_target || 80,
  };
}

/** Speaking prompt bundle. Shape matches handleSpeakingPrompt's body. */
export function pickSpeakingPrompt(level = null) {
  const row = pickAtLevel(speakingPrompts, level);
  if (!row) return null;
  // The stockpile stores targets as plain strings (grammar as a phrase, vocab as
  // a comma-separated list). The "Ton défi" objectives card expects rich shapes
  // ({point,hint} / [{word,meaning}]), so convert them here. English hints /
  // meanings aren't stored, so they stay empty — the French point + words still
  // drive the card and the "used target" detection.
  const grammarStr = String(row.target_grammar || '').trim();
  const vocabStr = String(row.target_vocab || '').trim();
  const targetVocab = vocabStr
    ? vocabStr.split(',').map((w) => ({ word: w.trim(), meaning: '' })).filter((v) => v.word).slice(0, 4)
    : null;
  return {
    narratorId: row.narrator_id || 'lea',
    openingLine: row.opening_line,
    openingLineTranslation: row.opening_line_translation || '',
    topicLabel: row.topic_label || '',
    targetGrammar: grammarStr ? { point: grammarStr, hint: '' } : null,
    targetVocab,
  };
}

/** Practice MCQs for a topic. Matches the learner's weakness topic by keyword,
 *  else returns a random set. Returns the exercises array ({question,options,answer}). */
export function pickPractice(topic = '') {
  const t = (topic || '').toLowerCase().trim();
  let row = null;
  if (t) {
    row = practice.find((p) => p.topic.toLowerCase() === t)
      || practice.find((p) => (p.keywords || []).some((k) => t.includes(k) || k.includes(t)))
      || practice.find((p) => t.includes(p.topic.toLowerCase()));
  }
  row = row || rnd(practice);
  return row ? row.exercises : [];
}

/** Reading article bundle. Shape matches handleReading's body. */
export function pickReading(level = null) {
  const row = pickAtLevel(reading, level);
  if (!row) return null;
  return {
    passage: row.passage,
    title: row.title,
    source: row.source || 'Parisly',
    author: row.author || null,
    date: row.date || null,
    link: row.link || null,
    vocab: row.vocab || [],
    questions: row.questions || [],
    grammar: row.grammar || [],
    conjugation: row.conjugation || [],
  };
}

/** Listening bundle. Shape matches handleListening's body. audioUrl/wordTimings
 *  may be null (transcript-only) until narration is generated. */
export function pickListening(level = null) {
  const row = pickAtLevel(listening, level);
  if (!row) return null;
  return {
    title: row.title,
    transcript: row.transcript,
    audioUrl: row.audioUrl || null,
    wordTimings: row.wordTimings || null,
    clipStart: row.clipStart ?? 0,
    clipEnd: row.clipEnd ?? 0,
    source: row.source || 'Parisly',
    date: row.date || null,
    vocabTheme: row.vocabTheme || '',
    narratorId: row.narratorId || 'lea',
    questions: row.questions || [],
    vocab: row.vocab || [],
    grammar: row.grammar || [],
    conjugation: row.conjugation || [],
  };
}

// ── Lesson corpus (grammar / conjugation / vocabulary, A1–C2) ────────────────

const CORPUS = { grammar, conjugation, vocabulary };

/** All lessons of a type, optionally filtered by CEFR level. */
export function getLessons(type, level = null) {
  const arr = CORPUS[type];
  if (!arr) return [];
  return atLevel(arr, level);
}

/** One random lesson of a type at (or near) a level. */
export function pickLesson(type, level = null) {
  return pickAtLevel(CORPUS[type] || [], level);
}

/** Counts, handy for diagnostics / a future stock dashboard. */
export function stockCounts() {
  return {
    conjugation: conjugation.length,
    grammar: grammar.length,
    vocabulary: vocabulary.length,
    writingPrompts: writingPrompts.length,
    speakingPrompts: speakingPrompts.length,
    practice: practice.length,
    words: words.length,
    reading: reading.length,
    listening: listening.length,
  };
}
