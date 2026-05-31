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
import { LearnerProfileProvider } from './context/LearnerProfileContext';

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
