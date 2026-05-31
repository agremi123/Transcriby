import { flattenNarratorLinesForRegistry, getLevelChallengeScript } from './narratorLevelAdapt';
import {
  extractCorrectionPairs,
  isStrictCorrectionMatch,
  normalizeCorrectionText,
} from './correctionFormat';

const translationByText = new Map();

function normalizeLineKey(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

export function registerNarratorLineTranslations(lines) {
  for (const line of lines) {
    if (!line?.text || !line?.translation) continue;
    translationByText.set(normalizeLineKey(line.text), line.translation);
  }
}

export function lookupNarratorTranslation(text) {
  if (!text) return null;
  return translationByText.get(normalizeLineKey(text)) ?? null;
}

export function buildCorrectionHoverTranslation(original, corrected) {
  const orig = normalizeCorrectionText(original);
  const corr = normalizeCorrectionText(corrected);
  if (!orig || !corr) return null;
  if (isStrictCorrectionMatch(orig, corr)) {
    return 'Your sentence is already Parisian.';
  }
  const pairs = extractCorrectionPairs(orig, corr);
  if (pairs.length === 1) {
    return `Change "${pairs[0].wrong}" to "${pairs[0].correct}".`;
  }
  return 'Parisian version of what you said.';
}

export function resolveNarratorTranslation(text, fallback) {
  return lookupNarratorTranslation(text) ?? fallback ?? null;
}

function seedRegistry() {
  registerNarratorLineTranslations(flattenNarratorLinesForRegistry());
  for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
    registerNarratorLineTranslations(getLevelChallengeScript(level));
  }
}

seedRegistry();
