import { getDeepgramKeyterms } from './deepgramKeyterms';

export { CASUAL_FRENCH_KEYTERMS } from './deepgramKeyterms';

export function buildDeepgramListenSearchParams({
  utteranceEndMs = 3000,
  endpointing,
  includeKeyterms = true,
} = {}) {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'fr',
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    utterance_end_ms: String(utteranceEndMs),
    vad_events: 'true',
    words: 'true',
    filler_words: 'true',
  });

  if (endpointing != null) {
    params.set('endpointing', String(endpointing));
  }

  if (includeKeyterms) {
    for (const term of getDeepgramKeyterms()) {
      params.append('keyterm', term);
    }
  }

  return params;
}
