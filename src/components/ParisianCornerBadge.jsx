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

  const size = compact ? 100 : 120;
  const strokeWidth = compact ? 5 : 5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (parisianPercent / 100) * circumference;

  return (
    <motion.div
      animate={scoreAnim ? { scale: [1, 1.08, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`relative shrink-0 bg-transparent ${scoreAnim ? 'parisian-badge-score-pop' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${profile.name}, level ${level}, ${parisianPercent}% Parisian progress`}
    >
      {/* Ring */}
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(139,30,45,0.15)" strokeWidth={strokeWidth} />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="#8b1e2d"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: scoreAnim ? 'stroke-dasharray 0.7s ease-out' : 'stroke-dasharray 0.5s ease' }}
        />
      </svg>

      {/* Badge image inside ring */}
      <img
        src={badgeSrc}
        alt=""
        className="absolute object-contain object-center"
        style={{
          inset: strokeWidth + 4,
          width: size - (strokeWidth + 4) * 2,
          height: size - (strokeWidth + 4) * 2,
          mixBlendMode: 'multiply',
        }}
      />

      {/* Level labels at bottom */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1" style={{ bottom: -14 }}>
        <span className="text-[9px] font-mono font-medium text-wine/70 tabular-nums leading-none">{level}</span>
        {nextLevel && <span className="text-[9px] font-mono font-medium text-wine/40 tabular-nums leading-none">{nextLevel}</span>}
      </div>
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
