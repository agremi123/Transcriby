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
import { isProfileSetupComplete } from './lib/learnerProfile';



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
  const { completeOnboarding, profile } = useLearnerProfile();
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    // Strip the leftover # from Supabase's implicit auth redirect
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (handledRef.current) return;
    import('./lib/supabaseClient').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && !isProfileSetupComplete(profile)) {
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
        }
      });
    });
  }, []);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <LearnerProfileProvider>
        <GoogleAuthHandler />
        <WelcomeOnboarding />
        {import.meta.env.DEV && <DevPanel />}
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/expressions" element={<MyExpressions />} />
          <Route path="/targets" element={<MyTargets />} />
          <Route path="/reading" element={<ReadingExercise />} />
        </Routes>
      </LearnerProfileProvider>
    </BrowserRouter>
  );
}
