/** Unescape JSON-style escapes and normalize whitespace in correction strings. */
export function normalizeCorrectionText(text) {
  if (!text || typeof text !== 'string') return '';

  let out = text.trim();

  if (out.startsWith('{') && out.includes('"corrected"')) {
    const extracted = extractCorrectedFromRaw(out);
    if (extracted) out = extracted;
  }

  out = out
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");

  return out.trim();
}

/** Pull corrected text from raw API output, including truncated JSON. */
export function extractCorrectedFromRaw(raw, fallback = '') {
  if (!raw || typeof raw !== 'string') return fallback;

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.corrected === 'string' && parsed.corrected.trim()) {
      return normalizeCorrectionText(parsed.corrected);
    }
  } catch {
    // fall through
  }

  const match = cleaned.match(/"corrected"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
  if (match?.[1]) {
    try {
      return normalizeCorrectionText(JSON.parse(`"${match[1]}"`));
    } catch {
      return normalizeCorrectionText(match[1]);
    }
  }

  if (cleaned.startsWith('{')) return fallback;

  return normalizeCorrectionText(cleaned) || fallback;
}

/** Pull English translation of the corrected sentence from raw API output. */
export function extractTranslationFromRaw(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.translation === 'string' && parsed.translation.trim()) {
      return parsed.translation.trim();
    }
  } catch {
    // fall through
  }

  const match = cleaned.match(/"translation"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
  if (match?.[1]) {
    try {
      return JSON.parse(`"${match[1]}"`).trim();
    } catch {
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
    }
  }

  return null;
}

export function parseCorrectionResponse(raw, fallbackText = '') {
  return {
    corrected: extractCorrectedFromRaw(raw, fallbackText),
    translation: extractTranslationFromRaw(raw),
  };
}

/** Split correction into display paragraphs. */
export function splitCorrectionParagraphs(text) {
  return normalizeCorrectionText(text)
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

/** Keep correction scope aligned with what the user actually said. */
export function alignCorrectionToOriginal(original, corrected) {
  const origParas = splitCorrectionParagraphs(original);
  const corrParas = splitCorrectionParagraphs(corrected);

  if (!corrParas.length) return normalizeCorrectionText(corrected);
  if (corrParas.length <= origParas.length || origParas.length === 0) {
    return corrParas.join('\n\n');
  }

  return corrParas.slice(0, origParas.length).join('\n\n');
}

export function prepareCorrectionForDisplay(original, corrected) {
  const normalized = normalizeCorrectionText(corrected);
  if (!normalized) return '';
  let display;
  if (normalized.startsWith('{') && normalized.includes('"corrected"')) {
    display = alignCorrectionToOriginal(original, extractCorrectedFromRaw(normalized, original));
  } else {
    display = alignCorrectionToOriginal(original, normalized);
  }
  return sanitizeParisianCorrection(display);
}

/** Strip filler the Parisien model sometimes adds despite instructions. */
export function sanitizeParisianCorrection(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .split(/\n\n+/)
    .map((para) => {
      let s = para.trim();
      if (!s) return s;
      s = s.replace(/^\s*yo\b[\s,!.—-]*/i, '');
      s = s.replace(/^\s*pas\s+besoin\b[\s,!.—-]*/i, '');
      s = s.replace(/(?:,\s*)?\s*pas\s+besoin\s*[.!?…]*\s*$/i, '');
      s = s.replace(/(?:,\s*)?\s+genre\s*[.!?…]*\s*$/i, '');
      return s.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

export function normalizeForCompare(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map Parisian oral forms and Deepgram formal spellings to one compare form. */
const ORAL_FRENCH_CANONICAL_RULES = [
  [/\bj['']?suis\b/g, 'je suis'],
  [/\bj['']?ai\b/g, 'je ai'],
  [/\bj['']?vais\b/g, 'je vais'],
  [/\bj['']?veux\b/g, 'je veux'],
  [/\bj['']?sais\b/g, 'je sais'],
  [/\bj['']?peux\b/g, 'je peux'],
  [/\bj['']?habite\b/g, 'je habite'],
  [/\bj['']?adore\b/g, 'je adore'],
  [/\bj['']?m['']?appelle\b/g, 'je me appelle'],
  [/\bt['']?as\b/g, 'tu as'],
  [/\bt['']?es\b/g, 'tu es'],
  [/\bt['']?inquiete\b/g, 'tu inquiete'],
  [/\bt['']?appelles\b/g, 'tu appelles'],
  [/\bt['']?aimes\b/g, 'tu aimes'],
  [/\bt['']?habites\b/g, 'tu habites'],
  [/\bc['']?est\b/g, 'ce est'],
  [/\by['']?a\b/g, 'il y a'],
  [/\bqu['']?il\b/g, 'que il'],
  [/\bs['']?te\s+plait\b/g, 'il te plait'],
  [/\bp['']?tit\b/g, 'petit'],
  [/\bm['']?appelle\b/g, 'me appelle'],
  [/\bl['']?ai\b/g, 'le ai'],
  [/\bn['']?ai\b/g, 'ne ai'],
  [/\bn['']?est\b/g, 'ne est'],
  [/\bd['']?accord\b/g, 'de accord'],
];

export function canonicalizeOralFrench(text) {
  let s = normalizeForCompare(text);
  for (const [pattern, replacement] of ORAL_FRENCH_CANONICAL_RULES) {
    s = s.replace(pattern, replacement);
  }
  // Parisian speech often drops "ne"; Deepgram may keep it in the target string.
  s = s.replace(/\bne\s+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** Strict text equality (register-sensitive). */
export function isStrictCorrectionMatch(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/** Lenient match for repeat attempts — J'suis ≈ Je suis, etc. */
export function matchesCorrectionTarget(spoken, target) {
  return canonicalizeOralFrench(spoken) === canonicalizeOralFrench(target);
}

function diffNormWord(word) {
  return String(word || '').toLowerCase().replace(/[^a-zà-ÿ]/g, '');
}

/** Word-level diff for correction display and narration. */
export function wordDiff(original, corrected) {
  const ow = original.trim().split(/\s+/);
  const cw = corrected.trim().split(/\s+/);
  const m = ow.length;
  const n = cw.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = diffNormWord(ow[i - 1]) === diffNormWord(cw[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && diffNormWord(ow[i - 1]) === diffNormWord(cw[j - 1])) {
      ops.unshift({ type: 'keep', oi: i - 1, ci: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', ci: j - 1 });
      j -= 1;
    } else {
      ops.unshift({ type: 'delete', oi: i - 1 });
      i -= 1;
    }
  }

  const result = [];
  for (let k = 0; k < ops.length; k += 1) {
    const op = ops[k];
    if (op.type === 'keep') {
      result.push({ word: ow[op.oi], struck: false, fix: null });
    } else if (op.type === 'delete') {
      const fixes = [];
      let ahead = k + 1;
      while (ahead < ops.length && ops[ahead].type === 'insert') {
        fixes.push(cw[ops[ahead].ci]);
        ahead += 1;
      }
      result.push({
        word: ow[op.oi],
        struck: true,
        fix: fixes.length ? fixes.join(' ') : null,
      });
    }
  }
  return result;
}

export function extractCorrectionPairs(original, corrected) {
  const diff = wordDiff(original, corrected);
  const pairs = [];
  let i = 0;
  while (i < diff.length) {
    if (!diff[i].struck) {
      i += 1;
      continue;
    }
    const wrongWords = [];
    let correct = diff[i].fix || '';
    wrongWords.push(diff[i].word);
    i += 1;
    while (i < diff.length && diff[i].struck) {
      wrongWords.push(diff[i].word);
      if (!correct && diff[i].fix) correct = diff[i].fix;
      i += 1;
    }
    const wrong = wrongWords.join(' ').trim();
    if (wrong) {
      pairs.push({ wrong, correct: correct.trim() || corrected.trim() });
    }
  }
  if (!pairs.length) {
    return [{ wrong: original.trim(), correct: corrected.trim() }];
  }
  return pairs;
}

/** Narrator line: Corrige « wrong » en « correct ». */
export function buildCorrectionNarrationText(original, corrected) {
  const orig = normalizeCorrectionText(original);
  const corr = normalizeCorrectionText(corrected);
  if (!orig || !corr) return corr || orig || '';
  if (isStrictCorrectionMatch(orig, corr)) return corr;

  const pairs = extractCorrectionPairs(orig, corr);
  if (pairs.length === 1) {
    let { wrong, correct } = pairs[0];
    const origTail = orig.slice(wrong.length).trim();
    const corrTail = corr.slice(correct.length).trim();
    if (origTail && origTail === corrTail) {
      wrong = `${wrong} ${origTail}`.trim();
      correct = `${correct} ${origTail}`.trim();
    }
    return `Corrige « ${wrong} » en « ${correct} »`;
  }
  const body = pairs.map(({ wrong, correct }) => `« ${wrong} » en « ${correct} »`).join(' et ');
  return `Corrige ${body}`;
}

/**
 * Returns which word indices are changed in each side of the diff.
 * { originalChanged: Set<number>, correctedChanged: Set<number> }
 */
export function getDiffChangedIndices(original, corrected) {
  const ow = (original || '').trim().split(/\s+/).filter(Boolean);
  const cw = (corrected || '').trim().split(/\s+/).filter(Boolean);
  const m = ow.length;
  const n = cw.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = diffNormWord(ow[i - 1]) === diffNormWord(cw[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Trace back LCS — unchanged words are in the LCS
  const keptOrig = new Set();
  const keptCorr = new Set();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (diffNormWord(ow[i - 1]) === diffNormWord(cw[j - 1])) {
      keptOrig.add(i - 1);
      keptCorr.add(j - 1);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  const originalChanged = new Set(ow.map((_, idx) => idx).filter(idx => !keptOrig.has(idx)));
  const correctedChanged = new Set(cw.map((_, idx) => idx).filter(idx => !keptCorr.has(idx)));
  return { originalChanged, correctedChanged };
}
