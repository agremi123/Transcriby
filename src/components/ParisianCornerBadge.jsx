import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { isProfileSetupComplete, PARISIAN_MASCOTS } from '../lib/learnerProfile';
import { getRoleProgression } from '../lib/narratorLevelAdapt';

const SCORE_ANIM_MS = 950;

function ParisianScoreFlip({ value, scoreAnim }) {
  const [showNew, setShowNew] = React.useState(false);

  React.useEffect(() => {
    if (!scoreAnim) {
      setShowNew(false);
      return undefined;
    }
    setShowNew(false);
    const t = window.setTimeout(() => setShowNew(true), 240);
    return () => window.clearTimeout(t);
  }, [scoreAnim]);

  return (
    <div className="relative h-[18px] w-[3.1rem] overflow-hidden shrink-0" aria-live="polite">
      <AnimatePresence mode="wait">
        {scoreAnim ? (
          showNew ? (
            <motion.span
              key={`new-${scoreAnim.from}-${scoreAnim.to}`}
              className="absolute inset-x-0 top-0 flex items-center font-stat text-[14px] sm:text-[15px] text-wine tabular-nums leading-none"
              initial={{ opacity: 0, scale: 0.45, y: 14 }}
              animate={{ opacity: 1, scale: [0.45, 1.24, 0.96, 1], y: [14, -3, 1, 0] }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {scoreAnim.to}%
            </motion.span>
          ) : (
            <motion.span
              key={`old-${scoreAnim.from}-${scoreAnim.to}`}
              className="absolute inset-x-0 top-0 flex items-center font-stat text-[14px] sm:text-[15px] text-wine tabular-nums leading-none"
              initial={{ opacity: 1, scale: 1, y: 0 }}
              animate={{ opacity: 0, scale: 0.35, y: -6, filter: 'blur(3px)' }}
              exit={{ opacity: 0, scale: 0.2 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 1, 1] }}
            >
              {scoreAnim.from}%
            </motion.span>
          )
        ) : (
          <motion.span
            key={`static-${value}`}
            className="absolute inset-x-0 top-0 flex items-center font-stat text-[14px] sm:text-[15px] text-wine tabular-nums leading-none"
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            {value}%
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ParisianProfileSquare({ className = '' }) {
  const { profile, effectiveLevel, experienceHighlightTick } = useLearnerProfile();
  const prevPercentRef = React.useRef(null);
  const [scoreAnim, setScoreAnim] = React.useState(null);
  const scoreAnimTimerRef = React.useRef(null);

  const parisianPercent = Math.max(0, Math.min(100, profile.parisianPercent ?? 0));

  React.useEffect(() => {
    if (prevPercentRef.current == null) {
      prevPercentRef.current = parisianPercent;
      return undefined;
    }

    if (!experienceHighlightTick) return undefined;

    const to = parisianPercent;
    setScoreAnim((current) => {
      const from = current?.to ?? prevPercentRef.current;
      if (from === to) return current;
      return { from, to };
    });

    if (scoreAnimTimerRef.current) window.clearTimeout(scoreAnimTimerRef.current);
    scoreAnimTimerRef.current = window.setTimeout(() => {
      setScoreAnim(null);
      prevPercentRef.current = to;
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

  const mascotSrc = PARISIAN_MASCOTS[profile.gender] || PARISIAN_MASCOTS.woman;
  const { currentRole } = getRoleProgression(parisianPercent, effectiveLevel);

  return (
    <motion.div
      animate={scoreAnim ? { scale: [1, 1.1, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`w-[118px] h-[74px] sm:w-[132px] sm:h-[78px] shrink-0 rounded-lg border bg-paper/95 overflow-hidden shadow-[0_2px_10px_rgba(26,35,64,0.1)] flex flex-col ${
        scoreAnim ? 'parisian-badge-score-pop border-wine/35 ring-2 ring-wine/20' : 'border-line/80'
      } ${className}`}
      aria-label={`${profile.name}, ${currentRole}, ${parisianPercent}% Parisian`}
    >
      <div className="flex items-start gap-2 px-2 pt-2 pr-2.5 min-h-0 flex-1">
        <img
          src={mascotSrc}
          alt=""
          className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-md border border-line/50 object-cover object-top"
        />
        <p className="min-w-0 flex-1 text-[9px] sm:text-[10.5px] text-navy/55 leading-[1.2] line-clamp-2">
          <span className="underline decoration-navy/35 underline-offset-[2px]">{currentRole}</span>
          <span className="text-navy/40"> ({effectiveLevel})</span>
        </p>
      </div>

      <div className="flex items-center gap-2 px-2 pr-2.5 pb-2 pt-1 mt-auto">
        <div className="h-2 flex-1 min-w-0 rounded-full bg-line/70 overflow-hidden">
          <div
            className={`h-full rounded-full bg-wine ${scoreAnim ? 'transition-all duration-700 ease-out' : 'transition-all duration-500'}`}
            style={{ width: `${parisianPercent}%` }}
          />
        </div>
        <ParisianScoreFlip value={parisianPercent} scoreAnim={scoreAnim} />
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
