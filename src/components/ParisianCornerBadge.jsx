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

  const imgSize = compact ? 'w-[52px] h-[52px]' : 'w-[96px] h-[96px] sm:w-[112px] sm:h-[112px]';
  const wrapSize = compact ? 'w-[52px]' : 'w-[96px] sm:w-[112px]';
  const barNegMargin = compact ? '-mt-1.5' : '-mt-3.5 sm:-mt-4';
  const textSize = compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]';
  const barHeight = compact ? 'h-1.5' : 'h-2';
  const pctTextSize = compact ? 'text-[6px]' : 'text-[7px] sm:text-[8px]';

  return (
    <motion.div
      animate={scoreAnim ? { scale: [1, 1.08, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`${wrapSize} shrink-0 flex flex-col items-stretch gap-0 bg-transparent ${
        scoreAnim ? 'parisian-badge-score-pop' : ''
      } ${className}`}
      aria-label={`${profile.name}, level ${level}, ${parisianPercent}% Parisian progress`}
    >
      <img
        src={badgeSrc}
        alt=""
        className={`${imgSize} object-contain object-center`}
        style={{ mixBlendMode: 'multiply' }}
      />

      <div className={`flex items-center gap-1 w-full ${barNegMargin}`}>
        <span className={`${textSize} font-mono font-medium text-wine/70 tabular-nums leading-none shrink-0`}>
          {level}
        </span>
        <div className={`relative flex-1 min-w-0 ${barHeight} rounded-full bg-wine/20 overflow-hidden`}>
          <div
            className={`relative h-full rounded-full bg-wine flex items-center justify-center overflow-hidden ${
              scoreAnim ? 'transition-all duration-700 ease-out' : 'transition-all duration-500'
            }`}
            style={{
              width: `${parisianPercent}%`,
              minWidth: parisianPercent > 0 ? '1.35rem' : 0,
            }}
          >
            <span className={`${pctTextSize} font-mono font-semibold tabular-nums leading-none text-ivory whitespace-nowrap px-0.5`}>
              {parisianPercent}%
            </span>
          </div>
          {parisianPercent === 0 && (
            <span className={`absolute inset-0 flex items-center justify-center ${pctTextSize} font-mono font-semibold tabular-nums leading-none text-wine/65 pointer-events-none`}>
              0%
            </span>
          )}
        </div>
        {nextLevel ? (
          <span className={`${textSize} font-mono font-medium text-wine/70 tabular-nums leading-none shrink-0`}>
            {nextLevel}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

const NAV_LAYOUT_ROUTES = ['/', '/dashboard', '/expressions', '/targets'];

export default function ParisianCornerBadge({ inline = false }) {
  const { pathname } = useLocation();

  if (inline) return <ParisianProfileSquare />;

  if (NAV_LAYOUT_ROUTES.includes(pathname)) return null;

  return (
    <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-30">
      <ParisianProfileSquare />
    </div>
  );
}
