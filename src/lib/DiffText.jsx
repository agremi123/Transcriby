import React from 'react';
import { getDiffChangedIndices } from './correctionFormat';

const CORRECTION_UNDERLINE_STYLE = {
  textDecoration: 'underline solid #8B1E2D',
  textUnderlineOffset: '4px',
  textDecorationThickness: '2px',
};

/** Red solid underline on changed words (landing-page correction style, no squiggle). */
export function DiffText({ original, corrected, side, className = '' }) {
  const { originalChanged, correctedChanged } = React.useMemo(
    () => getDiffChangedIndices(original, corrected),
    [original, corrected],
  );
  const text = side === 'original' ? original : corrected;
  const changed = side === 'original' ? originalChanged : correctedChanged;
  const words = (text || '').trim().split(/\s+/).filter(Boolean);

  return (
    <span className={className}>
      {words.map((word, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          {changed.has(i) ? (
            <span style={CORRECTION_UNDERLINE_STYLE}>{word}</span>
          ) : (
            word
          )}
        </React.Fragment>
      ))}
    </span>
  );
}
