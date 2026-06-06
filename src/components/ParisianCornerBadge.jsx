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

  // Arc wraps around the LEFT side of the badge image
  const badgeSize = compact ? 44 : 110;
  const imgSize = compact ? 96 : 130;  // image can be larger than the circle
  const sw = 2.5;
  const arcGap = compact ? 1 : 3;  // gap between badge edge and arc stroke
  const r = badgeSize / 2 + arcGap;
  const padV = 13;

  // Arc center = badge center
  const cx = sw / 2 + r;
  const cy = padV + sw / 2 + r;
  const svgW = cx + badgeSize / 2 + sw / 2;  // left extent + right half of badge
  const svgH = padV * 2 + sw + badgeSize;

  const halfCirc = Math.PI * r;
  const dash = (parisianPercent / 100) * halfCirc;

  // Badge top-left corner (badge is centered at cx, cy; imgSize may differ from badgeSize)
  const badgeLeft = cx - imgSize / 2;
  const badgeTop  = cy - imgSize / 2;

  return (
    <motion.div
      animate={scoreAnim ? { scale: [1, 1.08, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`relative shrink-0 bg-transparent ${scoreAnim ? 'parisian-badge-score-pop' : ''} ${className}`}
      style={{ width: svgW, height: svgH }}
      aria-label={`${profile.name}, level ${level}, ${parisianPercent}% Parisian progress`}
    >
      {/* Badge image — centered, arc overlays its left side */}
      <img
        src={badgeSrc}
        alt=""
        className="absolute object-contain object-center"
        style={{
          top: badgeTop,
          left: badgeLeft,
          width: imgSize,
          height: imgSize,
          mixBlendMode: 'multiply',
        }}
      />

      <svg
        width={svgW} height={svgH}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        {/* Track: left half-circle around badge (faint) */}
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
        {/* B1 label below arc start */}
        <text
          x={cx} y={cy + r + 11}
          textAnchor="middle" fontSize={8}
          fill="#8b1e2d" fontFamily="'SF Mono','Fira Mono',monospace"
          fontWeight="600" opacity={0.65}
        >{level}</text>
        {/* B2 label above arc end */}
        {nextLevel && (
          <text
            x={cx} y={cy - r - 4}
            textAnchor="middle" fontSize={8}
            fill="#8b1e2d" fontFamily="'SF Mono','Fira Mono',monospace"
            fontWeight="600" opacity={0.4}
          >{nextLevel}</text>
        )}
      </svg>
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
