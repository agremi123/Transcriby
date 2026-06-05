import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Nav from '../components/Nav';
import { Container } from '../components/atoms';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getLevelTargets, groupTargetsByPath, PATH_CATEGORIES } from '../lib/levelTargets';
import { loadTargetProgress, PARISIAN_XP_EVENT } from '../lib/targetProgress';

function practiceUrl(topic, themeInfo, category) {
  const base = `/?practice=${encodeURIComponent(topic)}`;
  const suffix = category === 'Reading' ? '&ptype=reading'
    : category === 'Listening' ? '&ptype=listening'
    : category === 'Speaking' ? '&ptype=speaking'
    : category === 'Writing' ? '&ptype=writing'
    : '';
  if (!themeInfo) return base + suffix + '#nativa-demo';
  const { cat, idx, total, theme } = themeInfo;
  return `${base}${suffix}&pcat=${encodeURIComponent(cat)}&pidx=${idx}&ptotal=${total}&ptheme=${encodeURIComponent(theme)}#nativa-demo`;
}

const ARC_THEMES = {
  Reading: [
    'News & Media', 'Books & Literature', 'Blog Posts', 'Restaurant Menus',
    'Travel Guides', 'Emails & Letters', 'Social Media', 'Advertisements',
    'Academic Texts', 'Short Stories', 'Film Subtitles', 'Maps & Directions',
    'Recipes', 'Magazines',
  ],
  Listening: [
    'Podcast Episodes', 'Radio Shows', 'Movies & Series', 'Street Conversations',
    'Phone Calls', 'Songs & Lyrics', 'News Reports', 'YouTube Videos',
    'Voicemails', 'Metro Announcements', 'Café Chatter', 'Lectures',
    'Interviews', 'Documentaries',
  ],
  Writing: [
    'Text Messages', 'Emails', 'Instagram Captions', 'Diary Entries',
    'Restaurant Reviews', 'Short Stories', 'Comments & Replies', 'Shopping Lists',
    'Travel Journal', 'Cover Letters', 'Blog Posts', 'Social Media Posts',
    'Notes to a Friend', 'Recipes',
  ],
  Speaking: [
    'Ordering at a Café', 'Making Plans', 'Phone Conversations', 'Meeting New People',
    'Arguments & Debates', 'Shopping', 'Asking for Directions', 'Job Interviews',
    'Telling Stories', 'Expressing Opinions', 'Complaining', 'Small Talk',
    'Emergency Situations', 'Presentations',
  ],
};

const COPY = {
  'a2-b1-conditional':      { label: 'What would you do in Paris?',        desc: 'Wish, hypothesize, politely insist — all in one tense.' },
  'a2-b1-informal':         { label: 'Sound less textbook',                 desc: 'Drop the formal shell. Talk like a local friend would.' },
  'a2-b1-travel':           { label: 'Handle metro delays like a Parisian', desc: 'Tickets, strikes, and the art of looking unbothered.' },
  'a2-b1-listen-metro':     { label: 'Decode the Paris metro',              desc: 'Catch every announcement before the doors close.' },
  'a2-b1-listen-travel':    { label: 'Station chatter',                     desc: 'Tickets, delays, and banter on the platform.' },
  'a2-b1-opinions':         { label: 'Disagree like a Parisian',            desc: 'Hold a position, push back, and still sound charming.' },
  'a2-b1-connectors':       { label: 'Connect your thoughts',               desc: 'Cependant, par contre — weave ideas into real sentences.' },
  'a2-b1-pc-vs-imp':        { label: 'Tell a story that happened',          desc: 'Was it a habit or a single moment? Your tense decides.' },
  'a2-b1-future':           { label: 'Make plans out loud',                 desc: "Talk about tomorrow like it's already decided." },
  'a2-b1-hypothesis':       { label: 'Play out "what if"',                  desc: 'Imagine scenarios with the elegance of a conditional clause.' },
  'a2-b1-object-pronouns':  { label: 'Stop repeating yourself',             desc: 'Replace nouns with pronouns — sound instantly more fluent.' },
  'a2-b1-y-en':             { label: 'Speak in shorthand',                  desc: 'Y and en — two tiny words, massive upgrade.' },
  'a2-b1-relative':         { label: 'Build longer sentences',              desc: 'Link ideas with qui, que, and où instead of stopping short.' },
  'a2-b1-subjunctive-intro':{ label: 'Express what you want',               desc: 'The gateway to emotional and nuanced French.' },
  'b1-b2-idioms':           { label: 'Terrace talk',                        desc: 'Expressions locals actually use over a glass of wine.' },
  'b1-b2-debate':           { label: 'Win the argument',                    desc: 'Present a case. Counter a point. Sound confident.' },
  'b1-b2-storytelling':     { label: 'Keep them listening',                 desc: 'Build a narrative arc that makes people lean in.' },
  'b1-b2-register':         { label: 'Read the room',                       desc: 'Tu or vous — get it wrong once, learn it forever.' },
  'a1-a2-cafe':             { label: 'Order like a regular',                desc: "Un crème, s'il vous plaît — no hesitation, no pointing." },
  'a1-a2-greetings':        { label: 'Forget bonjour, say coucou',          desc: 'How Parisians actually greet each other.' },
  'b2-c1-irony':            { label: 'Master dry Parisian humour',          desc: 'Say less, mean more — the art of understatement.' },
  'b2-c1-culture':          { label: 'Get the references',                  desc: 'Jokes, touchstones, shared culture. Finally be in on it.' },
};

const CAT_XP  = { Reading: 70, Listening: 60, Writing: 80, Speaking: 100 };
const CAT_DUR = { Reading: '4 min', Listening: '4 min', Writing: '5 min', Speaking: '6 min' };
const CAT_SUB = {
  Reading:   'Comprehension & vocabulary',
  Listening: 'Train your ear',
  Writing:   'Grammar & structures',
  Speaking:  'Say it like a Parisian',
};

const label = (t) => COPY[t.id]?.label ?? t.label;
const desc  = (t) => COPY[t.id]?.desc  ?? t.description;
const xp    = (t) => CAT_XP[t.pathCategory]  ?? 80;
const dur   = (t) => CAT_DUR[t.pathCategory] ?? '4 min';

function state(progress, idx, anyProgress) {
  if (progress >= 100)              return 'done';
  if (progress > 0)                 return 'active';
  if (!anyProgress && idx >= 3)     return 'locked';
  return 'open';
}

const Arrow = () => (
  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h10M9 4l4 4-4 4"/>
  </svg>
);
const Check = () => (
  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8l3.5 3.5L13 4.5"/>
  </svg>
);
const Lock = () => (
  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 shrink-0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="7.5" width="10" height="7" rx="1.5"/>
    <path d="M5.5 7.5V5.5a2.5 2.5 0 015 0v2"/>
  </svg>
);

// ─── SVG arc path map ─────────────────────────────────────────────────────────

const ALL_LEVELS_SVG = ['A1', 'A2', 'B1', 'B2', 'C1'];
const VH = 500;
const MY = 150;
const LEVEL_LABEL_FONT = "Georgia,'Times New Roman',serif";
const LEVEL_LABEL_FS_PAST = 15;
const LEVEL_LABEL_FS_CURRENT = 18;
const LEVEL_LABEL_FS_FUTURE = 15;
const LEVEL_CONNECTOR_STROKE = 3;

const ARC_DEFS = [
  { cat: 'Reading',   ctrlY: -90,  color: '#2E6EA6', side: 'above' },
  { cat: 'Listening', ctrlY: 70,   color: '#2D7A5E', side: 'above' },
  { cat: 'Writing',   ctrlY: 230,  color: '#8B1E2D', side: 'below' },
  { cat: 'Speaking',  ctrlY: 390,  color: '#1A2340', side: 'below' },
];

function qbPoint(t, x0, y0, cx, cy, x1, y1) {
  const u = 1 - t;
  return [
    u * u * x0 + 2 * u * t * cx + t * t * x1,
    u * u * y0 + 2 * u * t * cy + t * t * y1,
  ];
}

// Control point for the quadratic bezier sub-segment from t=t0 to t=t1
function qbSubCtrl(t0, t1, x0, y0, cx, cy, x1, y1) {
  const [p0x, p0y] = qbPoint(t0, x0, y0, cx, cy, x1, y1);
  const p1x = (1 - t0) * cx + t0 * x1;
  const p1y = (1 - t0) * cy + t0 * y1;
  const bp = t0 < 1 ? (t1 - t0) / (1 - t0) : 0;
  return [(1 - bp) * p0x + bp * p1x, (1 - bp) * p0y + bp * p1y];
}

function BadgeTick({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill="#8B1E2D" />
      <path d={`M ${cx - 5},${cy} l3.5,3.5 l7,-7`}
            stroke="white" strokeWidth="2" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function ArcPathMap({ grouped, progressMap, currentLevel, nextLevel }) {
  const navigate = useNavigate();
  const curIdx  = ALL_LEVELS_SVG.indexOf(currentLevel);
  const nextIdx = ALL_LEVELS_SVG.indexOf(nextLevel);

  const pastLevels   = ALL_LEVELS_SVG.slice(0, curIdx);
  const futureLevels = ALL_LEVELS_SVG.slice(nextIdx + 1);

  const VW      = 1000;
  const PAD     = 22;
  const PAST_PX = 110;
  const FUT_PX  = 110;
  const pastW   = pastLevels.length * PAST_PX;
  const futW    = futureLevels.length * FUT_PX;
  const arcSX   = PAD + pastW;
  const arcEX   = VW - PAD - futW;
  const arcCX   = (arcSX + arcEX) / 2;

  const [hoveredDot, setHoveredDot] = React.useState(null);
  const closeTimer = React.useRef(null);

  // Sequential reveal animation for the Reading arc
  const [readingReveal, setReadingReveal] = React.useState(0);
  const animTimerRef = React.useRef(null);
  React.useEffect(() => {
    const STEP_MS = 110;
    let step = 0;
    const tick = () => {
      step++;
      setReadingReveal(step);
      animTimerRef.current = setTimeout(tick, STEP_MS);
    };
    animTimerRef.current = setTimeout(tick, 200);
    return () => clearTimeout(animTimerRef.current);
  }, []);

  const justOpened = React.useRef(false);
  const openDot  = (info) => {
    clearTimeout(closeTimer.current);
    setHoveredDot(info);
    justOpened.current = true;
    setTimeout(() => { justOpened.current = false; }, 120);
  };
  const closeDot = () => {
    if (justOpened.current) return;
    closeTimer.current = setTimeout(() => setHoveredDot(null), 120);
  };

  const BADGE_SIZE = 160;
  const BADGE_Y    = MY + 18;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full overflow-visible"
      style={{ maxHeight: 460 }}
    >
      {/* past line */}
      {pastLevels.length > 0 && (
        <line x1={PAD} y1={MY} x2={arcSX} y2={MY}
              stroke="#8B1E2D" strokeWidth={LEVEL_CONNECTOR_STROKE} strokeLinecap="round" opacity="0.4" />
      )}
      {pastLevels.map((lvl, i) => {
        const x = PAD + i * PAST_PX;
        return (
          <g key={lvl}>
            <circle cx={x} cy={MY} r={3.5} fill="#8B1E2D" opacity="0.38" />
            <text x={x} y={MY - 16} textAnchor="middle"
                  fontSize={LEVEL_LABEL_FS_PAST} fill="#8B1E2D" opacity="0.5"
                  fontFamily={LEVEL_LABEL_FONT} fontWeight="600">{lvl}</text>
            <image
              href={`/badge-${lvl.toLowerCase()}.png`}
              x={x - BADGE_SIZE / 2}
              y={BADGE_Y}
              width={BADGE_SIZE}
              height={BADGE_SIZE}
              style={{ mixBlendMode: 'multiply' }}
            />
            <BadgeTick cx={x} cy={BADGE_Y + 10} />
          </g>
        );
      })}

      {/* arc start node + badge (current level) */}
      <circle cx={arcSX} cy={MY} r={6} fill="#8B1E2D" />
      <text x={arcSX} y={MY - 16} textAnchor="middle"
            fill="#8B1E2D" fontSize={LEVEL_LABEL_FS_CURRENT} fontStyle="italic"
            fontFamily={LEVEL_LABEL_FONT} fontWeight="600">{currentLevel}</text>
      <image
        href={`/badge-${currentLevel.toLowerCase()}.png`}
        x={arcSX - 80} y={BADGE_Y}
        width={160} height={160}
        style={{ mixBlendMode: 'multiply' }}
      />
      <BadgeTick cx={arcSX} cy={BADGE_Y + 10} />

      {/* 4 arcs */}
      {ARC_DEFS.map(({ cat, ctrlY, color, side }, idx) => {
        const targets = grouped[cat] ?? [];
        const total   = targets.length;
        const done    = targets.filter((t) => (Number(progressMap[t.id]) || 0) >= 100).length;
        const [lx, ly] = qbPoint(0.5, arcSX, MY, arcCX, ctrlY, arcEX, MY);
        const labelY   = side === 'above' ? ly - 11 : ly + 18;

        const dots = targets.map((t, i) => {
          const tv       = (i + 1) / (total + 1);
          const [dx, dy] = qbPoint(tv, arcSX, MY, arcCX, ctrlY, arcEX, MY);
          const p        = Number(progressMap[t.id]) || 0;
          return { dx, dy, isDone: p >= 100, isPartial: p > 0 && p < 100, target: t, tv };
        });

        const lessonTVals = dots.map(d => d.tv);
        const MIN_GAP = 0.07;
        const DECO_COUNT = 14;
        const decoTVals = Array.from({ length: DECO_COUNT }, (_, i) => (i + 1) / (DECO_COUNT + 1))
          .filter(tv => lessonTVals.every(lt => Math.abs(lt - tv) > MIN_GAP));

        // All circles ordered by t-value → assign one unique theme each
        const themes = ARC_THEMES[cat] ?? [];
        const allCircles = [
          ...decoTVals.map(tv => ({ tv, isDeco: true })),
          ...dots.map(d => ({ tv: d.tv, isDeco: false, dot: d })),
        ].sort((a, b) => a.tv - b.tv);
        const totalCircles = allCircles.length;

        // Segment lines between consecutive circles
        const doneDots = dots.filter(d => d.isDone);
        const progressTV = doneDots.length > 0 ? Math.max(...doneDots.map(d => d.tv)) : 0;
        const segPositions = [
          { x: arcSX, y: MY, tv: 0 },
          ...allCircles.map(c => {
            const [cx, cy] = qbPoint(c.tv, arcSX, MY, arcCX, ctrlY, arcEX, MY);
            return { x: cx, y: cy, tv: c.tv };
          }),
          { x: arcEX, y: MY, tv: 1 },
        ];

        return (
          <g key={cat}>
            {/* Individual dashed arc segments between consecutive circles */}
            {segPositions.slice(0, -1).map((pos, si) => {
              const next = segPositions[si + 1];
              const isCompleted = progressTV > 0 && next.tv <= progressTV + 0.001;
              const [cpx, cpy] = qbSubCtrl(pos.tv, next.tv, arcSX, MY, arcCX, ctrlY, arcEX, MY);
              return (
                <path
                  key={`seg-${si}`}
                  d={`M ${pos.x},${pos.y} Q ${cpx},${cpy} ${next.x},${next.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={isCompleted ? 'none' : '4 6'}
                  strokeLinecap="round"
                  opacity={isCompleted ? 0.65 : 0.28}
                />
              );
            })}
            <g>
              <rect x={lx - 28} y={labelY - 10} width={56} height={14}
                    fill="white" stroke={color} strokeWidth="0.8" opacity="0.7" rx="1" />
              <text x={lx} y={labelY} textAnchor="middle"
                    fill={color} fontSize="7" opacity="0.75"
                    fontFamily="'SF Mono','Fira Mono',monospace"
                    letterSpacing="0.15em" fontWeight="700">
                {cat.toUpperCase()}
              </text>
            </g>
            {allCircles.map((c, ci) => {
              const theme = themes[ci % themes.length] ?? cat;
              const themeInfo = { cat, idx: ci + 1, total: totalCircles, theme };
              const [dx, dy] = qbPoint(c.tv, arcSX, MY, arcCX, ctrlY, arcEX, MY);
              const t = c.isDeco ? (total > 0 ? targets[ci % total] : null) : c.dot.target;
              const isDone = !c.isDeco && c.dot.isDone;
              const isPartial = !c.isDeco && c.dot.isPartial;
              return (
                <g key={ci} style={{ cursor: 'pointer' }}
                   onMouseEnter={() => t && openDot({ svgX: dx, svgY: dy, target: t, color, themeInfo })}
                   onMouseLeave={closeDot}>
                  <circle cx={dx} cy={dy} r={18} fill="transparent" />
                  <circle cx={dx} cy={dy} r={4}
                          fill="white" stroke={color} strokeWidth={c.isDeco ? 1.2 : 1.4}
                          opacity={isDone ? 0.85 : isPartial ? 0.55 : (c.isDeco ? 0.4 : 0.35)} />
                  {isPartial && <circle cx={dx} cy={dy} r={2} fill={color} opacity="0.7" />}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* arc end node + badge (next level) */}
      <circle cx={arcEX} cy={MY} r={6} fill="none" stroke="#1A2340" strokeWidth="1.5" opacity="0.35" />
      <text x={arcEX} y={MY - 16} textAnchor="middle"
            fill="#1A2340" fontSize={LEVEL_LABEL_FS_CURRENT} fontWeight="700"
            fontFamily={LEVEL_LABEL_FONT} opacity="0.55">{nextLevel}</text>
      <image
        href={`/badge-${nextLevel.toLowerCase()}.png`}
        x={arcEX - 80} y={BADGE_Y}
        width={160} height={160}
        style={{ mixBlendMode: 'multiply' }}
      />

      {/* future line — thinner, not yet achieved */}
      {futureLevels.length > 0 && (
        <line x1={arcEX} y1={MY} x2={VW - PAD} y2={MY}
              stroke="#8B1E2D" strokeWidth="2" strokeLinecap="round" opacity="0.22" />
      )}
      {futureLevels.map((lvl, i) => {
        const x = arcEX + (i + 1) * FUT_PX;
        return (
          <g key={lvl}>
            <circle cx={x} cy={MY} r={5} fill="none" stroke="#1A2340" strokeWidth="2" opacity="0.22" />
            <text x={x} y={MY + 20} textAnchor="middle"
                  fontSize={LEVEL_LABEL_FS_FUTURE} fill="#1A2340" opacity="0.38"
                  fontFamily={LEVEL_LABEL_FONT} fontWeight="600">{lvl}</text>
            <image
              href={`/badge-${lvl.toLowerCase()}.png`}
              x={x - 80} y={MY + 22}
              width={160} height={160}
              opacity="1"
            />
          </g>
        );
      })}

      {/* dot tooltip */}
      {hoveredDot && (() => {
        const { svgX, svgY, target: t, color, themeInfo } = hoveredDot;
        const themeName = themeInfo?.theme ?? label(t);
        const TW = 310, TH = 120;
        const tx = Math.min(Math.max(svgX - TW / 2, 4), VW - TW - 4);
        const ty = svgY - TH + 10;
        const zoneL = tx - 6, zoneT = ty, zoneW = TW + 12, zoneH = svgY + 22 - ty;
        return (
          <>
          <foreignObject x={tx} y={ty} width={TW} height={TH} style={{ overflow: 'visible' }} pointerEvents="all">
            <div xmlns="http://www.w3.org/1999/xhtml"
                 onMouseEnter={() => clearTimeout(closeTimer.current)}
                 onMouseLeave={() => { clearTimeout(closeTimer.current); setHoveredDot(null); }}
                 style={{
                   background: '#1A2340',
                   border: '1px solid rgba(255,255,255,0.12)',
                   borderRadius: 4,
                   padding: '15px 17px',
                   boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                   pointerEvents: 'all',
                   height: '100%',
                   boxSizing: 'border-box',
                 }}>
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(246,241,232,0.9)', fontSize: 9, fontFamily: "'SF Mono','Fira Mono',monospace", letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8, background: 'rgba(255,255,255,0.1)', padding: '3px 8px', borderRadius: 2 }}>
                {t.category || t.pathCategory}
                <span style={{ color: 'rgba(246,241,232,0.35)', letterSpacing: '0.05em' }}>—</span>
                {themeName}
              </p>
              <p style={{ color: 'rgba(246,241,232,0.4)', fontSize: 10, marginBottom: 10, lineHeight: 1.4 }}>{desc(t)}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  style={{
                    background: '#8B1E2D',
                    color: '#F6F1E8',
                    border: 'none',
                    padding: '5px 14px',
                    fontSize: 11,
                    fontFamily: "Georgia,'Times New Roman',serif",
                    fontStyle: 'italic',
                    cursor: 'pointer',
                    pointerEvents: 'all',
                  }}
                  onMouseDown={() => navigate(practiceUrl(t.topic, themeInfo, themeInfo?.cat ?? t.category))}
                >
                  Study →
                </button>
                <span style={{ color: 'rgba(251,191,36,0.75)', fontSize: 10, fontFamily: "'SF Mono','Fira Mono',monospace", fontWeight: 700 }}>+{xp(t)} XP to Parisian</span>
              </div>
            </div>
          </foreignObject>
          <circle cx={svgX} cy={svgY} r={18} fill="transparent"
                  onMouseEnter={() => clearTimeout(closeTimer.current)}
                  onMouseLeave={closeDot} />
          <circle cx={svgX} cy={svgY} r={4} fill="white" stroke={color} strokeWidth="1.4"
                  style={{ pointerEvents: 'none' }} />
          </>
        );
      })()}
    </svg>
  );
}

// ─── Level banner ──────────────────────────────────────────────────────────────
function LevelBanner({ levelInfo, grouped, progressMap }) {
  const pathStats  = PATH_CATEGORIES.map((cat) => {
    const targets = grouped[cat] ?? [];
    const total   = targets.length;
    const done    = targets.filter((t) => (Number(progressMap[t.id]) || 0) >= 100).length;
    return { cat, done, total, complete: total > 0 && done === total };
  });
  const allComplete  = pathStats.every((p) => p.complete);
  const totalLessons = pathStats.reduce((s, p) => s + p.total, 0);
  const doneLessons  = pathStats.reduce((s, p) => s + p.done, 0);

  return (
    <div className="mb-8 border border-line/60 bg-ivory/30 px-6 pt-5 pb-5 sm:px-8">
      <div className="mb-3 inline-block border border-line/60 bg-ivory/60 px-4 py-2.5">
        <h1 className="font-display text-[22px] sm:text-[26px] leading-tight text-navy">
          My Parisian <span className="text-wine italic">Progress</span>
        </h1>
      </div>
      {!levelInfo.atMaxLevel && (
        <ArcPathMap
          grouped={grouped}
          progressMap={progressMap}
          currentLevel={levelInfo.currentLevel}
          nextLevel={levelInfo.nextLevel}
        />
      )}
    </div>
  );
}

// ─── "Practice now" hero ───────────────────────────────────────────────────────
function PracticeNow({ levelInfo, progressMap }) {
  const grouped = React.useMemo(() => {
    const g = {};
    PATH_CATEGORIES.forEach((c) => { g[c] = []; });
    levelInfo.targets.forEach((t) => { if (g[t.pathCategory]) g[t.pathCategory].push(t); });
    return g;
  }, [levelInfo.targets]);

  const best = React.useMemo(() => {
    let open = null;
    for (const cat of PATH_CATEGORIES) {
      const ts = grouped[cat] ?? [];
      const any = ts.some((t) => (Number(progressMap[t.id]) || 0) > 0);
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i], p = Number(progressMap[t.id]) || 0;
        if (p >= 100) continue;
        const s = state(p, i, any);
        if (s === 'locked') continue;
        if (s === 'active') return { t, p };
        if (!open) open = { t, p };
      }
    }
    return open;
  }, [grouped, progressMap]);

  if (!best) return null;
  const { t, p } = best;
  const resume = p > 0;

  return (
    <Link to={practiceUrl(t.topic)} className="group block mb-10">
      <div className="relative overflow-hidden bg-navy border border-navy/20
                      transition-all duration-200
                      hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(26,35,50,0.32)]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#F6F1E8 0,#F6F1E8 1px,transparent 0,transparent 50%)', backgroundSize: '18px 18px' }} />
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-wine/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10 px-7 py-8 sm:px-10 sm:py-10">
          <div className="flex-1 min-w-0">
            <p className="text-[9.5px] font-mono tracking-[0.22em] uppercase text-ivory/30 mb-3">
              {resume ? '↻  Resume' : '→  Recommended next'}
            </p>
            <h2 className="font-display text-[26px] sm:text-[32px] leading-[1.1] text-ivory mb-2">
              {label(t)}
            </h2>
            <p className="text-[13px] text-ivory/45 leading-relaxed max-w-md mb-5">{desc(t)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-mono font-bold text-amber-300/80 bg-amber-300/8 border border-amber-300/15 px-2 py-0.5 rounded">
                +{xp(t)} XP
              </span>
              <span className="text-[10px] font-mono text-ivory/25 uppercase tracking-wide">{t.pathCategory}</span>
              <span className="text-[10px] font-mono text-ivory/25">{dur(t)}</span>
              {resume && <span className="text-[10px] font-mono text-wine/50">{p}% complete</span>}
            </div>
          </div>
          <div className="shrink-0">
            <div className="inline-flex items-center gap-3 bg-wine text-ivory
                            px-8 py-4 font-display text-[15px] italic
                            transition-all duration-200
                            group-hover:bg-wine2
                            group-hover:shadow-[0_6px_28px_rgba(139,30,45,0.5)]
                            group-hover:gap-4">
              {resume ? 'Continue' : 'Practice now'}
              <Arrow />
            </div>
          </div>
        </div>

        {resume && (
          <div className="h-0.5 bg-ivory/6 mx-7 mb-6 sm:mx-10 rounded-full overflow-hidden">
            <div className="h-full bg-wine/60 rounded-full" style={{ width: `${p}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Lesson card ───────────────────────────────────────────────────────────────
function LessonCard({ target: t, progress: p, idx, anyProgress }) {
  const s      = state(p, idx, anyProgress);
  const isDone = s === 'done';
  const isLock = s === 'locked';
  const isLive = s === 'active' || s === 'open';

  const card = (
    <div className={[
      'group relative flex flex-col border border-t-0 transition-all duration-150',
      isDone   ? 'bg-ivory/20 cursor-pointer hover:bg-ivory/40 border-line/40'
      : isLock ? 'bg-paper/30 opacity-40 cursor-default border-line/30'
      :          'bg-paper cursor-pointer border-line/50 hover:bg-ivory/50 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(26,35,50,0.07)] hover:border-line',
    ].join(' ')}>
      <div className="px-4 pt-4 pb-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className={[
            'font-display text-[13.5px] leading-snug',
            isDone ? 'text-navy/35' : isLock ? 'text-navy/30' : 'text-navy',
          ].join(' ')}>{label(t)}</h4>
          {isLive && (
            <span className="shrink-0 mt-0.5 text-[9px] font-mono font-semibold
                             text-wine/55 bg-wine/6 border border-wine/12
                             px-1.5 py-0.5 rounded tabular-nums whitespace-nowrap">
              +{xp(t)} XP
            </span>
          )}
          {isDone && <span className="shrink-0 mt-0.5 text-wine/40"><Check /></span>}
        </div>

        {isLive && (
          <p className="text-[11.5px] text-navy/45 leading-relaxed line-clamp-2">{desc(t)}</p>
        )}

        {s === 'active' && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-0.5 bg-navy/10 rounded-full overflow-hidden">
              <div className="h-full bg-wine rounded-full transition-all duration-500"
                   style={{ width: `${p}%` }} />
            </div>
            <span className="text-[9.5px] font-mono text-navy/35 tabular-nums">{p}%</span>
          </div>
        )}
      </div>

      {isLive && (
        <div className="flex items-center justify-between px-4 py-2.5 mt-auto
                        border-t border-line/50 bg-wine/[0.03]
                        group-hover:bg-wine/[0.07] transition-colors duration-150">
          <span className="font-display text-[12.5px] italic font-semibold text-wine group-hover:text-wine2 transition-colors">
            {s === 'active' ? 'Continue' : 'Practice'} →
          </span>
          <span className="text-[10px] font-mono text-navy/25">{dur(t)}</span>
        </div>
      )}
      {isDone && (
        <div className="px-4 py-2.5 border-t border-line/30">
          <span className="text-[11px] font-mono text-navy/25 uppercase tracking-wide">Completed</span>
        </div>
      )}
      {isLock && (
        <div className="px-4 py-2.5 border-t border-line/20 flex items-center gap-1.5">
          <Lock />
          <span className="text-[11px] text-navy/30 font-mono">Complete earlier lessons first</span>
        </div>
      )}
    </div>
  );

  if (isLock) return <div className="border-t border-line/30">{card}</div>;
  return <Link to={practiceUrl(t.topic)} className="block border-t border-line/50">{card}</Link>;
}

// ─── Track column ───────────────────────────────────────────────────────────────
function Track({ category, targets, progressMap }) {
  const rows = targets.map((t, i) => ({
    t, i,
    p: Math.max(0, Math.min(100, Number(progressMap[t.id]) || 0)),
  }));
  const done  = rows.filter((r) => r.p >= 100).length;
  const total = rows.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const any   = rows.some((r) => r.p > 0);

  return (
    <section className="flex flex-col border border-line/60 bg-paper">
      <header className="px-4 pt-4 pb-3.5 bg-ivory/60 border-b border-line/60">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-display text-[15px] text-navy">{category}</h2>
          <span className="font-mono text-[10px] text-navy/30 tabular-nums">{done}/{total}</span>
        </div>
        <p className="text-[11px] text-navy/40 mb-3">{CAT_SUB[category]}</p>
        <div className="h-1 bg-navy/8 rounded-full overflow-hidden">
          <div className="h-full bg-wine/55 rounded-full transition-all duration-700"
               style={{ width: `${pct}%` }} />
        </div>
        {pct > 0 && <p className="mt-1.5 text-[9.5px] font-mono text-wine/50">{pct}% mastered</p>}
      </header>
      {rows.length === 0
        ? <p className="px-4 py-10 text-center text-[12px] text-navy/30">Nothing here yet.</p>
        : rows.map(({ t, i, p }) => (
            <LessonCard key={t.id} target={t} progress={p} idx={i} anyProgress={any} />
          ))
      }
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function MyTargets() {
  const { effectiveLevel, profile } = useLearnerProfile();
  const levelInfo = React.useMemo(
    () => getLevelTargets(effectiveLevel, profile.parisianPercent),
    [effectiveLevel, profile.parisianPercent],
  );
  const grouped = React.useMemo(
    () => groupTargetsByPath(levelInfo.targets),
    [levelInfo.targets],
  );
  const [v, setV] = React.useState(0);
  const progressMap = React.useMemo(() => loadTargetProgress(), [v, profile.parisianPercent]);

  React.useEffect(() => {
    const refresh = () => setV((x) => x + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener(PARISIAN_XP_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PARISIAN_XP_EVENT, refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="pt-[96px] pb-24">
        <Container className="max-w-[1160px]">
          <Link to="/"
            className="inline-flex items-center gap-1 text-[10.5px] font-mono tracking-widest uppercase
                       text-navy/30 hover:text-wine transition-colors mb-6">
            <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1L3 5l4 4"/>
            </svg>
            Back
          </Link>

          <LevelBanner levelInfo={levelInfo} grouped={grouped} progressMap={progressMap} />
        </Container>
      </main>
    </div>
  );
}
