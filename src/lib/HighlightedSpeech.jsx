import React from 'react';
import { buildWordTimings, isTimedWordActive, wordHighlightInlineStyle } from './speechHighlight';

export function HighlightedSpeech({
  text,
  playbackTime,
  timings: timingsProp,
  className = '',
  quote = false,
}) {
  const safeText = text ?? '';
  const fallbackTimings = React.useMemo(() => buildWordTimings(safeText), [safeText]);
  const timings = timingsProp?.length ? timingsProp : fallbackTimings;
  const words = timings.map((t) => t.word);

  const body = words.map((word, i) => (
    <span key={i} style={wordHighlightInlineStyle(isTimedWordActive(timings, i, playbackTime))}>
      {word}
      {i < words.length - 1 ? ' ' : ''}
    </span>
  ));

  if (quote) {
    return (
      <span className={className}>
        «{body}»
      </span>
    );
  }

  return <span className={className}>{body}</span>;
}
