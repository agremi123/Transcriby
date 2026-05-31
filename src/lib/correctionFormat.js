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
  if (normalized.startsWith('{') && normalized.includes('"corrected"')) {
    return alignCorrectionToOriginal(original, extractCorrectedFromRaw(normalized, original));
  }
  return alignCorrectionToOriginal(original, normalized);
}
