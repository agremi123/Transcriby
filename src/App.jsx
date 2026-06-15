import React from 'react'; // v2
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import Hero from './components/Hero';
import { UniversitiesBar, Features } from './components/Features';
import Comparison from './components/Comparison';
import Testimonials from './components/Testimonials';
import Pricing from './components/Pricing';
import Faq from './components/Faq';
import { CTABanner, Footer } from './components/Footer';
import Dashboard from './pages/Dashboard';
import MyExpressions from './pages/MyExpressions';
import MyTargets from './pages/MyTargets';
import ReadingExercise from './pages/ReadingExercise';
import WelcomeOnboarding from './components/WelcomeOnboarding';
import DevPanel from './components/DevPanel';
import { LearnerProfileProvider, useLearnerProfile } from './context/LearnerProfileContext';
import { isProfileSetupComplete, loadLearnerProfile } from './lib/learnerProfile';

// Lazy so the 3D libraries (Three.js) load ONLY on /avatar-test and never
// weigh down the main app bundle.
const AvatarTest = React.lazy(() => import('./pages/AvatarTest'));



function LandingPage() {
  return (
    <div className="relative">
      <Nav />
      <Hero />
      <UniversitiesBar />
<Features />
      <Comparison />
      <Testimonials />
      <Pricing />
      <Faq />
      <CTABanner />
      <Footer />
    </div>
  );
}

function GoogleAuthHandler() {
  const { completeOnboarding } = useLearnerProfile();
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    let subscription;
    // Do NOT strip the hash up front — Supabase needs to read the
    // #access_token from the OAuth redirect to establish the session first.
    const stripHash = () => {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };

    const handleSession = (session) => {
      if (handledRef.current || !session?.user) return;
      // Read the freshest profile from storage (closure value may be stale).
      const profile = loadLearnerProfile();
      if (isProfileSetupComplete(profile)) { stripHash(); return; }
      handledRef.current = true;
      const user = session.user;
      const name = user.user_metadata?.full_name?.split(' ')[0]
        || user.user_metadata?.name?.split(' ')[0]
        || user.email?.split('@')[0]
        || 'Ami';
      completeOnboarding(profile.claimedLevel || 'B1', {
        authMethod: 'google',
        email: user.email,
        name,
      });
      stripHash();
    };

    import('./lib/supabaseClient').then(({ supabase }) => {
      // Fires once Supabase has parsed the OAuth redirect (SIGNED_IN /
      // INITIAL_SESSION) — avoids the race where getSession() runs too early.
      const { data } = supabase.auth.onAuthStateChange((_event, session) => handleSession(session));
      subscription = data?.subscription;
      // Also handle an already-established session.
      supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));
    });

    return () => { try { subscription?.unsubscribe(); } catch {} };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <LearnerProfileProvider>
        <GoogleAuthHandler />
        <WelcomeOnboarding />
        {/* Kru Rémi credit — fixed bottom-left. Low z + pointer-events guard so it
            never steals clicks from the demo / modals layered above it. */}
        <a href="https://kruremi.com" target="_blank" rel="noopener noreferrer"
          className="fixed bottom-3 left-3 z-20 hidden sm:flex items-center gap-2 group pointer-events-none [&>*]:pointer-events-auto"
        >
          <img src="/assets/remi-avatar.jpg" alt="Kru Rémi"
            className="w-8 h-8 rounded-full object-cover object-top ring-2 ring-wine/60 group-hover:ring-wine transition-all shrink-0" />
          <span className="font-display text-[12px] italic text-navy/60 leading-none whitespace-nowrap">
            by <span className="text-navy font-semibold not-italic group-hover:text-wine transition-colors">Kru Rémi</span>
            <span className="text-navy/40"> · certified French teacher</span>
          </span>
        </a>
        {import.meta.env.DEV && <DevPanel />}
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/expressions" element={<MyExpressions />} />
          <Route path="/targets" element={<MyTargets />} />
          <Route path="/reading" element={<ReadingExercise />} />
          {/* Dev-only 3D avatar test harness — not exposed in production */}
          {import.meta.env.DEV && (
            <Route
              path="/avatar-test"
              element={
                <React.Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-paper text-navy/40 font-display italic">Loading 3D…</div>}>
                  <AvatarTest />
                </React.Suspense>
              }
            />
          )}
        </Routes>
      </LearnerProfileProvider>
    </BrowserRouter>
  );
}
