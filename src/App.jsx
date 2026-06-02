import React from 'react';
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
import ParisianCornerBadge from './components/ParisianCornerBadge';
import WelcomeOnboarding from './components/WelcomeOnboarding';
import { LearnerProfileProvider, useLearnerProfile } from './context/LearnerProfileContext';
import { isProfileSetupComplete } from './lib/learnerProfile';

function WelcomeResetButton() {
  const { profile, resetWelcomeOnboarding } = useLearnerProfile();
  if (!isProfileSetupComplete(profile)) return null;

  return (
    <button
      type="button"
      onClick={resetWelcomeOnboarding}
      className="fixed bottom-4 left-4 z-50 rounded-full border border-line/80 bg-paper/95 px-3.5 py-2 text-[11px] font-medium text-navy/55 shadow-sm hover:border-wine/35 hover:text-wine transition-colors"
    >
      Redo welcome
    </button>
  );
}

function LandingPage() {
  return (
    <div className="relative">
      <WelcomeResetButton />
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

export default function App() {
  return (
    <BrowserRouter>
      <LearnerProfileProvider>
        <ParisianCornerBadge />
        <WelcomeOnboarding />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/expressions" element={<MyExpressions />} />
          <Route path="/targets" element={<MyTargets />} />
        </Routes>
      </LearnerProfileProvider>
    </BrowserRouter>
  );
}
