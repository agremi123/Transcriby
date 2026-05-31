export const LEVEL_CARD_IMAGES = {
  A1: '/assets/levels/a1.png',
  A2: '/assets/levels/a2.png',
  B1: '/assets/levels/b1.png',
  B2: '/assets/levels/b2.png',
  C1: '/assets/levels/c1.png',
};

/** A1 aspect ratio — tallest card; object-cover scales other levels up to match. */
export const LEVEL_CARD_ASPECT = '664 / 1024';

export function LevelCardImage({ src, alt }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: LEVEL_CARD_ASPECT }}
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  );
}

export function IlluA1() {
  return (
    <img
      src={LEVEL_CARD_IMAGES.A1}
      alt=""
      className="w-full max-w-[200px] h-auto object-contain"
      aria-hidden
    />
  );
}

export function IlluA2() {
  return (
    <svg width="100" height="106" viewBox="0 0 100 106" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M28 28 C26 22 30 18 28 12" stroke="#9B8B7E" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M42 24 C40 18 44 14 42 8" stroke="#9B8B7E" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M56 28 C54 22 58 18 56 12" stroke="#9B8B7E" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 40 L20 78 Q20 82 24 82 L76 82 Q80 82 80 78 L84 40 Z" stroke="#9B8B7E" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 40 Q50 45 88 40" stroke="#9B8B7E" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M80 50 Q96 50 96 64 Q96 78 80 78" stroke="#9B8B7E" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="50" cy="86" rx="38" ry="8" stroke="#9B8B7E" strokeWidth="1.8" />
      <ellipse cx="50" cy="86" rx="22" ry="4" stroke="#9B8B7E" strokeWidth="1.2" opacity="0.5" />
    </svg>
  );
}

export function IlluB1() {
  return (
    <svg width="106" height="96" viewBox="0 0 106 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="4" y="6" width="60" height="46" rx="14" stroke="#8B1E2D" strokeWidth="1.8" />
      <path d="M16 52 L8 70 L32 54" stroke="#8B1E2D" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="22" cy="29" r="4" fill="#8B1E2D" opacity="0.38" />
      <circle cx="34" cy="29" r="4" fill="#8B1E2D" opacity="0.38" />
      <circle cx="46" cy="29" r="4" fill="#8B1E2D" opacity="0.38" />
      <rect x="44" y="30" width="58" height="44" rx="14" fill="#FAF5EE" stroke="#8B1E2D" strokeWidth="1.8" />
      <path d="M80 74 L88 90 L68 76" stroke="#8B1E2D" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="62" cy="52" r="3.5" fill="#8B1E2D" opacity="0.38" />
      <circle cx="73" cy="52" r="3.5" fill="#8B1E2D" opacity="0.38" />
      <circle cx="84" cy="52" r="3.5" fill="#8B1E2D" opacity="0.38" />
    </svg>
  );
}

export function IlluB2() {
  const c = '#5B4D7A';
  const dot = '#9E94C0';

  return (
    <svg width="126" height="110" viewBox="0 0 126 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <ellipse cx="63" cy="80" rx="48" ry="14" stroke={c} strokeWidth="1.8" />
      <circle cx="16" cy="36" r="12" stroke={c} strokeWidth="1.7" />
      <path d="M7 48 Q6 64 8 72 Q12 74 20 74 Q24 74 26 72 Q28 64 26 48" stroke={c} strokeWidth="1.7" fill="none" />
      <path d="M8 56 Q2 62 0 70" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M24 54 Q32 60 36 68" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="6" cy="20" r="2.8" fill={dot} opacity="0.7" />
      <circle cx="14" cy="14" r="2.8" fill={dot} opacity="0.7" />
      <circle cx="22" cy="10" r="2.8" fill={dot} opacity="0.7" />
      <circle cx="63" cy="26" r="12" stroke={c} strokeWidth="1.7" />
      <path d="M54 38 Q52 54 54 62 Q58 64 68 64 Q72 64 72 62 Q74 54 72 38" stroke={c} strokeWidth="1.7" fill="none" />
      <path d="M56 48 Q48 54 46 62" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M70 48 Q78 54 80 62" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="110" cy="36" r="12" stroke={c} strokeWidth="1.7" />
      <path d="M100 48 Q100 64 102 72 Q106 74 114 74 Q118 74 120 72 Q122 64 120 48" stroke={c} strokeWidth="1.7" fill="none" />
      <path d="M102 56 Q96 62 94 70" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M118 54 Q126 60 126 68" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="120" cy="20" r="2.8" fill={dot} opacity="0.7" />
      <circle cx="112" cy="14" r="2.8" fill={dot} opacity="0.7" />
      <circle cx="104" cy="10" r="2.8" fill={dot} opacity="0.7" />
      <path d="M42 76 L44 90 L50 90 L52 76" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M74 74 L76 90 L82 90 L84 74" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function IlluC1() {
  const c = '#3D3B5C';

  return (
    <svg width="106" height="114" viewBox="0 0 106 114" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="34" cy="8" r="7" stroke={c} strokeWidth="1.6" fill="none" />
      <path d="M28 12 Q34 16 40 12" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="34" cy="24" r="13" stroke={c} strokeWidth="1.7" fill="none" />
      <ellipse cx="28" cy="22" rx="5.5" ry="4.5" stroke={c} strokeWidth="1.4" />
      <ellipse cx="40" cy="22" rx="5.5" ry="4.5" stroke={c} strokeWidth="1.4" />
      <line x1="33.5" y1="22" x2="34.5" y2="22" stroke={c} strokeWidth="1.3" />
      <line x1="22.5" y1="22" x2="20" y2="21" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="45.5" y1="22" x2="48" y2="21" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M24 37 Q22 60 24 68 Q28 72 40 72 Q46 72 48 68 Q50 60 48 37" stroke={c} strokeWidth="1.7" fill="none" />
      <path d="M26 46 Q14 56 10 64" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <rect x="4" y="62" width="22" height="28" rx="2" stroke={c} strokeWidth="1.5" />
      <line x1="15" y1="62" x2="15" y2="90" stroke={c} strokeWidth="1.1" opacity="0.45" />
      <path d="M46 42 Q56 36 60 32" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M30 72 Q26 88 24 102" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M40 72 Q44 88 46 102" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <rect x="58" y="10" width="44" height="40" rx="11" stroke={c} strokeWidth="1.5" fill="white" />
      <path d="M64 50 L58 62 L76 52" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      <text x="66" y="26" fontSize="7.5" fill={c} fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="0.5">oui</text>
      <text x="66" y="35" fontSize="7.5" fill={c} fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="0.5">oui</text>
      <text x="66" y="44" fontSize="7.5" fill={c} fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="0.5" opacity="0.6">oui</text>
    </svg>
  );
}

export const LEVEL_ILLUSTRATIONS = {
  A1: IlluA1,
  A2: IlluA2,
  B1: IlluB1,
  B2: IlluB2,
  C1: IlluC1,
};
