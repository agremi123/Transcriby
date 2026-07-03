import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo, ButtonPrimary, Container, NAV_CTA_CLASS } from './atoms';
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
      <div className="absolute right-full pointer-events-none" style={{ marginTop: 65, marginRight: -20 }}>
        <ParisianProfileSquare compact className="pointer-events-none" />
      </div>
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


// Bouton de déconnexion — visible seulement si une session Supabase est active
// (après login Google/email). Termine la session puis recharge l'app.
function NavLogout() {
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    let subscription;
    (async () => {
      const { supabase } = await import('../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      if (active) setSignedIn(Boolean(session?.user));
      const { data } = supabase.auth.onAuthStateChange((_event, s) => {
        if (active) setSignedIn(Boolean(s?.user));
      });
      subscription = data?.subscription;
    })();
    return () => { active = false; subscription?.unsubscribe?.(); };
  }, []);

  if (!signedIn) return null;

  const handleLogout = async () => {
    try {
      const { supabase } = await import('../lib/supabaseClient');
      await supabase.auth.signOut();
    } catch {}
    // Recharge pour repartir d'un état propre (progression locale conservée).
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      aria-label="Log out"
      className="hidden sm:inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-full border border-navy/15 text-navy/55 hover:text-wine hover:border-wine/35 transition-colors text-[13px] font-medium font-display whitespace-nowrap"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M5 2H2a1 1 0 00-1 1v6a1 1 0 001 1h3M8 9l3-3-3-3M11 6H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Log out
    </button>
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
