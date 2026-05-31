import React from 'react';

function seededRandom(seed, index) {
  const x = Math.sin(seed * 9999 + index * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

function textSeed(text = '') {
  return text.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
}

/** Organic spellcheck squiggle — subtle, imperfect, not a perfect sine wave. */
export function buildSpellcheckSquigglePath(text, viewWidth = 100) {
  const seed = textSeed(text);
  const phase = seededRandom(seed, 0) * Math.PI * 2;
  const cycles = 1.55 + seededRandom(seed, 1) * 0.85;
  const amplitude = 0.62 + seededRandom(seed, 2) * 0.18;
  const baseline = 4.35;

  const steps = 22;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = t * viewWidth;
    const wave = Math.sin(t * cycles * Math.PI * 2 + phase);
    const flattened = Math.sign(wave) * Math.pow(Math.abs(wave), 0.62);
    const jitter = (seededRandom(seed, 10 + i) - 0.5) * 0.28;
    const ampJitter = amplitude * (0.88 + seededRandom(seed, 40 + i) * 0.22);
    const y = baseline + flattened * ampJitter + jitter * 0.3;
    points.push([x, y]);
  }

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

export function SpellcheckUnderline({ children, seed, className = '', ...props }) {
  const label = seed ?? (typeof children === 'string' ? children : '');
  const path = React.useMemo(() => buildSpellcheckSquigglePath(label), [label]);

  return (
    <span className={`relative inline ${className}`} {...props}>
      {children}
      <svg
        className="absolute left-0 w-full pointer-events-none overflow-visible select-none"
        style={{ bottom: '-2px', height: '7px' }}
        viewBox="0 0 100 7"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          stroke="rgba(170, 68, 74, 0.48)"
          strokeWidth="0.55"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
