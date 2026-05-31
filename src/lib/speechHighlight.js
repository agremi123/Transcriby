/** Build per-word start/end times, scaled to audio duration when known. */
export function buildWordTimings(text, durationSec) {
  const safeText = text ?? '';
  const words = safeText.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const weights = words.map((w) => Math.max(w.length, 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalDuration = durationSec && durationSec > 0
    ? durationSec
    : words.reduce((t, w) => t + Math.max(0.12, w.length * 0.04) + 0.04, 0);

  let cursor = 0;
  return words.map((word, i) => {
    const dur = (weights[i] / totalWeight) * totalDuration;
    const start = cursor;
    const end = cursor + dur;
    cursor = end;
    return { word, start, end };
  });
}

export function isTimedWordActive(timings, index, playbackTime) {
  if (playbackTime == null || !timings?.length) return false;
  const w = timings[index];
  if (!w) return false;
  return playbackTime >= w.start && playbackTime < w.end;
}

export function wordHighlightInlineStyle(isActive) {
  return {
    transition: 'background 0.18s ease',
    borderRadius: '4px',
    padding: '1px 2px',
    marginRight: '1px',
    display: 'inline',
    background: isActive ? 'rgba(139,30,45,0.12)' : 'transparent',
  };
}

/** Play decoded audio and emit elapsed seconds via onTimeUpdate (null when done). */
export function playDecodedBuffer(ctx, { buffer, narrator, sourceRef, onTimeUpdate, connectSource }) {
  const connect = connectSource || ((c, src) => {
    src.connect(c.destination);
    return null;
  });

  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    connect(ctx, src, narrator);

    const startAt = ctx.currentTime;
    let rafId = null;

    const stopTick = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tick = () => {
      if (sourceRef.current !== src) return;
      onTimeUpdate?.(ctx.currentTime - startAt);
      rafId = requestAnimationFrame(tick);
    };

    src.onended = () => {
      stopTick();
      onTimeUpdate?.(null);
      if (sourceRef.current === src) sourceRef.current = null;
      resolve();
    };

    sourceRef.current = src;
    src.start(0);
    rafId = requestAnimationFrame(tick);
  });
}
