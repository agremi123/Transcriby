/** True when the next segment should glue to the previous without a space (e.g. ".", ","). */
export function segmentNeedsLeadingSpace(segment) {
  const s = String(segment || '').trimStart();
  if (!s) return false;
  return !/^[.!?,;:»)\]…]/.test(s);
}

/** Join transcript chunks without a space before trailing punctuation. */
export function joinTranscriptSegments(...segments) {
  return segments
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .reduce((out, seg) => {
      if (!out) return seg;
      return segmentNeedsLeadingSpace(seg) ? `${out} ${seg}` : `${out}${seg}`;
    }, '');
}
