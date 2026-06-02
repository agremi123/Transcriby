import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo, ButtonPrimary, Container, ParisianExperienceHint } from './atoms';
import ParisianCornerBadge from './ParisianCornerBadge';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getNextLevel } from '../lib/levelTargets';

function NavReachNextLevel() {
  const { pathname } = useLocation();
  const { effectiveLevel } = useLearnerProfile();
  const nextLevel = getNextLevel(effectiveLevel);
  const isActive = pathname === '/targets';
  const ariaLabel = nextLevel ? `How to reach ${nextLevel}` : 'How to keep improving';

  const pillClass = `inline-flex items-center rounded-full border font-display transition-all duration-200 whitespace-nowrap ${
    isActive
      ? 'border-wine bg-wine text-ivory shadow-sm'
      : 'border-wine/25 text-wine/65 hover:bg-wine hover:text-ivory hover:border-wine hover:shadow-sm'
  }`;

  const pill = nextLevel ? (
    <span className={`${pillClass} gap-2 px-3 py-1.5 text-[12px] sm:text-[13px]`}>
      <span className="tracking-[0.14em] uppercase font-medium leading-none text-[10px] opacity-90">
        How to reach
      </span>
      <span className="font-semibold tabular-nums leading-none">{nextLevel}</span>
    </span>
  ) : (
    <span className={`${pillClass} px-3 py-1.5 text-[12px]`}>
      <span className="tracking-[0.14em] uppercase font-medium leading-none text-[10px]">
        How to keep improving
      </span>
    </span>
  );

  return (
    <div className="relative hidden sm:inline-flex items-center">
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
        <div className="flex items-center gap-2.5 sm:gap-3">
          <NavReachNextLevel />
          <ParisianCornerBadge inline />
          {!onJudgePage && (
            <ButtonPrimary to="/dashboard" showArrow={false}>Judge my French</ButtonPrimary>
          )}
        </div>
      </Container>
    </motion.nav>
  );
}
