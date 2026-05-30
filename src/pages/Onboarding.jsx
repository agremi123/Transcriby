import React from 'react';
import { motion } from 'framer-motion';

// Simple SVG illustrations for each level
const LevelIllustrations = {
  A1: () => (
    <svg viewBox="0 0 120 120" className="w-16 h-16">
      {/* Simple waving person */}
      <circle cx="60" cy="35" r="12" fill="#1A2340" />
      <rect x="52" y="50" width="16" height="20" rx="2" fill="#1A2340" />
      <line x1="60" y1="70" x2="60" y2="90" stroke="#1A2340" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="55" x2="42" y2="68" stroke="#1A2340" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="55" x2="75" y2="62" stroke="#1A2340" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="70" x2="50" y2="88" stroke="#1A2340" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="70" x2="70" y2="88" stroke="#1A2340" strokeWidth="3" strokeLinecap="round" />
      {/* Waving hand */}
      <path d="M 75 52 Q 80 45 85 48" stroke="#1A2340" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  ),

  A2: () => (
    <svg viewBox="0 0 120 120" className="w-16 h-16">
      {/* Person at café counter */}
      <circle cx="40" cy="30" r="10" fill="#1A2340" />
      <rect x="34" y="42" width="12" height="18" rx="1" fill="#1A2340" />
      <line x1="40" y1="60" x2="40" y2="75" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="45" x2="28" y2="55" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="45" x2="52" y2="55" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="60" x2="32" y2="75" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="60" x2="48" y2="75" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />
      {/* Simple café counter */}
      <rect x="60" y="50" width="45" height="25" rx="3" fill="none" stroke="#1A2340" strokeWidth="2" />
      <circle cx="82" cy="65" r="4" fill="#1A2340" />
      <circle cx="95" cy="65" r="4" fill="#1A2340" />
    </svg>
  ),

  B1: () => (
    <svg viewBox="0 0 120 120" className="w-16 h-16">
      {/* Two people talking */}
      {/* Person 1 */}
      <circle cx="30" cy="35" r="9" fill="#1A2340" />
      <rect x="25" y="47" width="10" height="15" rx="1" fill="#1A2340" />
      <line x1="30" y1="62" x2="30" y2="75" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="50" x2="20" y2="58" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="50" x2="40" y2="58" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="62" x2="23" y2="75" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="62" x2="37" y2="75" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />

      {/* Person 2 */}
      <circle cx="90" cy="35" r="9" fill="#1A2340" />
      <rect x="85" y="47" width="10" height="15" rx="1" fill="#1A2340" />
      <line x1="90" y1="62" x2="90" y2="75" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="50" x2="80" y2="58" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="50" x2="100" y2="58" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="62" x2="83" y2="75" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="62" x2="97" y2="75" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />

      {/* Simple connection line */}
      <line x1="40" y1="40" x2="80" y2="40" stroke="#C9A0A8" strokeWidth="1.5" strokeDasharray="3,2" />
    </svg>
  ),

  B2: () => (
    <svg viewBox="0 0 120 120" className="w-16 h-16">
      {/* Three people around table */}
      {/* Person 1 - left */}
      <circle cx="30" cy="32" r="8" fill="#1A2340" />
      <rect x="26" y="42" width="8" height="12" rx="1" fill="#1A2340" />
      <line x1="30" y1="54" x2="30" y2="68" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />

      {/* Person 2 - top */}
      <circle cx="60" cy="22" r="8" fill="#1A2340" />
      <rect x="56" y="32" width="8" height="12" rx="1" fill="#1A2340" />
      <line x1="60" y1="44" x2="60" y2="58" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />

      {/* Person 3 - right */}
      <circle cx="90" cy="32" r="8" fill="#1A2340" />
      <rect x="86" y="42" width="8" height="12" rx="1" fill="#1A2340" />
      <line x1="90" y1="54" x2="90" y2="68" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />

      {/* Table */}
      <circle cx="60" cy="70" r="18" fill="none" stroke="#1A2340" strokeWidth="2" />

      {/* Glasses on table */}
      <circle cx="45" cy="70" r="2.5" fill="#1A2340" />
      <circle cx="75" cy="70" r="2.5" fill="#1A2340" />
    </svg>
  ),

  C1: () => (
    <svg viewBox="0 0 120 120" className="w-16 h-16">
      {/* Person with glasses holding book */}
      <circle cx="60" cy="32" r="11" fill="#1A2340" />
      {/* Glasses */}
      <circle cx="52" cy="31" r="4" fill="none" stroke="#1A2340" strokeWidth="1.5" />
      <circle cx="68" cy="31" r="4" fill="none" stroke="#1A2340" strokeWidth="1.5" />
      <line x1="56" y1="31" x2="64" y2="31" stroke="#1A2340" strokeWidth="1.5" />

      <rect x="50" y="46" width="20" height="20" rx="2" fill="#1A2340" />
      <line x1="60" y1="46" x2="60" y2="66" stroke="#8B5E5F" strokeWidth="1" />

      {/* Arms holding book */}
      <line x1="50" y1="48" x2="38" y2="52" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="70" y1="48" x2="82" y2="52" stroke="#1A2340" strokeWidth="2.5" strokeLinecap="round" />

      {/* Legs */}
      <line x1="56" y1="66" x2="56" y2="85" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />
      <line x1="64" y1="66" x2="64" y2="85" stroke="#1A2340" strokeWidth="2" strokeLinecap="round" />

      {/* Speech bubble */}
      <path d="M 75 15 Q 95 15 95 25 Q 95 35 75 35 L 72 38 L 75 35 Z" fill="#C9A0A8" opacity="0.6" />
      <text x="78" y="26" fontSize="8" fill="#1A2340" fontWeight="600">oui</text>
    </svg>
  ),
};

const LEVELS = [
  {
    id: 'A1',
    title: 'Can introduce yourself and ask basic questions',
    illustration: LevelIllustrations.A1,
  },
  {
    id: 'A2',
    title: 'Can order food and buy tickets',
    illustration: LevelIllustrations.A2,
  },
  {
    id: 'B1',
    title: 'Can talk about your day and hobbies',
    illustration: LevelIllustrations.B1,
  },
  {
    id: 'B2',
    title: 'Can comfortably join group conversations',
    illustration: LevelIllustrations.B2,
  },
  {
    id: 'C1',
    title: 'Can express nuanced ideas naturally',
    illustration: LevelIllustrations.C1,
  },
];

export default function Onboarding() {
  const handleGetStarted = () => {
    window.open('/dashboard', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F6F1E8] to-[#F2EBDA] relative overflow-hidden">
      {/* Subtle Paris skyline background */}
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="none">
          {/* Eiffel tower outline */}
          <line x1="600" y1="50" x2="600" y2="280" stroke="#1A2340" strokeWidth="1.5" />
          <line x1="560" y1="280" x2="640" y2="280" stroke="#1A2340" strokeWidth="1" />
          <path d="M 550 150 L 600 120 L 650 150" stroke="#1A2340" strokeWidth="1" fill="none" />

          {/* Simple building silhouettes */}
          <rect x="100" y="200" width="80" height="180" stroke="#1A2340" strokeWidth="1" fill="none" />
          <rect x="900" y="220" width="90" height="160" stroke="#1A2340" strokeWidth="1" fill="none" />
        </svg>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h1 className="font-display text-[56px] md:text-[64px] leading-[1.1] tracking-[-0.02em] text-[#1A2340] mb-4">
            How's your <span className="italic text-[#8B1E2D]">French</span>?
          </h1>
          <p className="text-[18px] text-[#5B5047] max-w-2xl mx-auto leading-relaxed">
            Discover your natural French level by exploring what you can already do. No tests, just honest conversations.
          </p>
        </motion.div>

        {/* Level Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-3 mb-16"
        >
          {LEVELS.map((level, index) => {
            const Illustration = level.illustration;
            return (
              <motion.div
                key={level.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(139, 30, 45, 0.12)' }}
                className="bg-white rounded-2xl p-6 text-center border border-[#E8DFD5] shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group"
              >
                {/* Level label */}
                <div className="text-[28px] font-mono font-bold text-[#8B1E2D] mb-4 group-hover:scale-110 transition-transform">
                  {level.id}
                </div>

                {/* Illustration */}
                <div className="flex justify-center mb-5 h-20 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Illustration />
                </div>

                {/* Description */}
                <p className="text-[14px] text-[#5B5047] leading-relaxed font-medium">
                  {level.title}
                </p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center"
        >
          <button
            onClick={handleGetStarted}
            className="inline-flex items-center gap-3 px-10 py-4 bg-[#8B1E2D] text-white rounded-2xl font-medium text-[16px] hover:bg-[#6B1620] transition-all duration-300 shadow-md hover:shadow-lg active:scale-95"
          >
            <span>Find out with Nativa</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="group-hover:translate-x-1 transition-transform">
              <path d="M4 10h12M14 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
