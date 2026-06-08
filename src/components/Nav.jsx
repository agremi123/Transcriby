import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo, ButtonPrimary, Container, NAV_CTA_CLASS, ParisianExperienceHint } from './atoms';
import { ParisianProfileSquare } from './ParisianCornerBadge';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getNextLevel } from '../lib/levelTargets';

function NavReachNextLevel() {
  const { effectiveLevel } = useLearnerProfile();
  const nextLevel = getNextLevel(effectiveLevel);
  const ariaLabel = nextLevel ? `How to reach ${nextLevel}` : 'How to keep improving';

  const pill = nextLevel ? (
    <span className={`${NAV_CTA_CLASS} gap-2`}>
      <span>How to reach</span>
      <span className="font-semibold tabular-nums">{nextLevel}</span>
    </span>
  ) : (
    <span className={NAV_CTA_CLASS}>How to keep improving</span>
  );

  return (
    <div className="relative hidden sm:inline-flex items-center mt-1">
      <div className="absolute right-full flex items-center gap-3" style={{ marginTop: 65, marginRight: -20 }}>
        <div className="flex items-center gap-1.5 pointer-events-none">
          <img src="/assets/remi-avatar.png" alt="Kru Rémi" className="w-5 h-5 rounded-full object-cover object-top shrink-0" />
          <span className="text-[10px] font-mono tracking-[0.04em] text-navy/40 leading-none whitespace-nowrap">
            by <span className="text-navy/60 font-semibold">Kru Rémi</span> · certified French teacher
          </span>
        </div>
        <ParisianProfileSquare compact className="pointer-events-none" />
      </div>
      <ParisianExperienceHint />
      <div className="relative">
        <Link
          to="/targets"
          aria-label={ariaLabel}
          className="relative z-[1] inline-flex whitespace-nowrap"
        >
          {pill}
        </Link>
        <span
          className="absolute inset-0 rounded-full border-2 border-wine animate-ping-tight opacity-35 pointer-events-none"
          aria-hidden
        />
      </div>
    </div>
  );
}


export default function Nav() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = React.useState(false);
  const onJudgePage = pathname === '/dashboard';

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
        scrolled ? 'bg-ivory/85 backdrop-blur border-b border-line' : 'bg-transparent'
      }`}
    >
      <Container className="flex items-center justify-between h-[72px]">
        <Logo />
        <div />
        <div className="flex items-center gap-2.5 sm:gap-3 mr-16">
          <NavReachNextLevel />
        </div>
      </Container>
    </motion.nav>
  );
}
