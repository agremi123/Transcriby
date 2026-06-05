import React from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getLevelBadgeSrc, isProfileSetupComplete } from '../lib/learnerProfile';
import { getNextLevel } from '../lib/levelTargets';

const SCORE_ANIM_MS = 950;

export function ParisianProfileSquare({ className = '', compact = false }) {
  const { profile, effectiveLevel, experienceHighlightTick } = useLearnerProfile();
  const prevPercentRef = React.useRef(null);
  const [scoreAnim, setScoreAnim] = React.useState(false);
  const scoreAnimTimerRef = React.useRef(null);

  const parisianPercent = Math.max(0, Math.min(100, profile.parisianPercent ?? 0));

  React.useEffect(() => {
    if (prevPercentRef.current == null) {
      prevPercentRef.current = parisianPercent;
      return undefined;
    }
    if (!experienceHighlightTick) return undefined;
    if (prevPercentRef.current === parisianPercent) return undefined;
    setScoreAnim(true);
    if (scoreAnimTimerRef.current) window.clearTimeout(scoreAnimTimerRef.current);
    scoreAnimTimerRef.current = window.setTimeout(() => {
      setScoreAnim(false);
      prevPercentRef.current = parisianPercent;
      scoreAnimTimerRef.current = null;
    }, SCORE_ANIM_MS);
    return () => {
      if (scoreAnimTimerRef.current) {
        window.clearTimeout(scoreAnimTimerRef.current);
        scoreAnimTimerRef.current = null;
      }
    };
  }, [experienceHighlightTick, parisianPercent]);

  React.useEffect(() => {
    if (!scoreAnim && prevPercentRef.current !== parisianPercent && !experienceHighlightTick) {
      prevPercentRef.current = parisianPercent;
    }
  }, [parisianPercent, scoreAnim, experienceHighlightTick]);

  if (!isProfileSetupComplete(profile)) return null;

  const level = effectiveLevel || 'A1';
  const nextLevel = getNextLevel(level);
  const badgeSrc = getLevelBadgeSrc(level);

  // Left half-circle progress indicator
  const badgeSize = compact ? 78 : 110;
  const sw = 2;         // stroke width
  const gap = 3;        // gap between arc endpoint and badge
  const r = badgeSize / 2;
  const padV = 14;      // vertical padding for level labels

  // Arc circle center in SVG space
  const cx = sw / 2 + r;
  const cy = padV + sw / 2 + r;
  const svgW = sw / 2 + r + gap + badgeSize + sw / 2;
  const svgH = padV + sw + badgeSize + padV;

  // Left semicircle: bottom (cx, cy+r) → top (cx, cy-r) counterclockwise (through left side)
  const halfCirc = Math.PI * r;
  const dash = (parisianPercent / 100) * halfCirc;

  return (
    <motion.div
      animate={scoreAnim ? { scale: [1, 1.08, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`relative shrink-0 bg-transparent ${scoreAnim ? 'parisian-badge-score-pop' : ''} ${className}`}
      style={{ width: svgW, height: svgH }}
      aria-label={`${profile.name}, level ${level}, ${parisianPercent}% Parisian progress`}
    >
      <svg
        width={svgW} height={svgH}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        {/* Track: left half-circle (faint) */}
        <path
          d={`M ${cx},${cy + r} A ${r},${r} 0 0,0 ${cx},${cy - r}`}
          fill="none"
          stroke="rgba(139,30,45,0.15)"
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {/* Progress: fills bottom→top */}
        <path
          d={`M ${cx},${cy + r} A ${r},${r} 0 0,0 ${cx},${cy - r}`}
          fill="none"
          stroke="#8b1e2d"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${halfCirc}`}
          style={{ transition: scoreAnim ? 'stroke-dasharray 0.7s ease-out' : 'stroke-dasharray 0.5s ease' }}
        />
        {/* B1 label at bottom */}
        <text
          x={cx - 2} y={cy + r + 11}
          textAnchor="middle" fontSize={8}
          fill="#8b1e2d" fontFamily="'SF Mono','Fira Mono',monospace"
          fontWeight="600" opacity={0.65}
        >{level}</text>
        {/* B2 label at top */}
        {nextLevel && (
          <text
            x={cx - 2} y={cy - r - 5}
            textAnchor="middle" fontSize={8}
            fill="#8b1e2d" fontFamily="'SF Mono','Fira Mono',monospace"
            fontWeight="600" opacity={0.4}
          >{nextLevel}</text>
        )}
      </svg>

      {/* Badge image — sits to the right of the arc */}
      <img
        src={badgeSrc}
        alt=""
        className="absolute object-contain object-center"
        style={{
          top: padV + sw / 2,
          left: cx + gap,
          width: badgeSize,
          height: badgeSize,
          mixBlendMode: 'multiply',
        }}
      />
    </motion.div>
  );
}

const NAV_LAYOUT_ROUTES = ['/', '/dashboard', '/expressions', '/targets'];

export default function ParisianCornerBadge({ inline = false }) {
  const { pathname } = useLocation();

  if (inline) return <ParisianProfileSquare compact />;

  if (NAV_LAYOUT_ROUTES.includes(pathname)) return null;

  return (
    <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-30">
      <ParisianProfileSquare />
    </div>
  );
}
