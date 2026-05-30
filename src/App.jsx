import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import Hero from './components/Hero';
import { UniversitiesBar, Features } from './components/Features';
import { ProficiencyLevels } from './components/ProficiencyLevels';
import Comparison from './components/Comparison';
import Testimonials from './components/Testimonials';
import Pricing from './components/Pricing';
import Faq from './components/Faq';
import { CTABanner, Footer } from './components/Footer';
import Dashboard from './pages/Dashboard';

function LandingPage() {
  return (
    <div className="relative">
      <Nav />
      <Hero />
      <UniversitiesBar />
      <ProficiencyLevels />
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
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
