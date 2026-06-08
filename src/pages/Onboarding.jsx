import React from 'react';
import { motion } from 'framer-motion';
import { LEVEL_ILLUSTRATIONS, LEVEL_CARD_IMAGES, LevelCardImage } from '../components/LevelIllustrations';

const LEVELS = [
  {
    id: 'A1',
    title: 'You can say hello, introduce yourself and ask simple questions.',
    illustration: LEVEL_ILLUSTRATIONS.A1,
    cardImage: LEVEL_CARD_IMAGES.A1,
  },
  {
    id: 'A2',
    title: 'You can order food and buy a cinema ticket.',
    illustration: LEVEL_ILLUSTRATIONS.A2,
    cardImage: LEVEL_CARD_IMAGES.A2,
  },
  {
    id: 'B1',
    title: 'You can talk about your day, your hobbies and your plans.',
    illustration: LEVEL_ILLUSTRATIONS.B1,
    cardImage: LEVEL_CARD_IMAGES.B1,
  },
  {
    id: 'B2',
    title: 'You can talk about many topics and share your opinion with confidence.',
    illustration: LEVEL_ILLUSTRATIONS.B2,
    cardImage: LEVEL_CARD_IMAGES.B2,
  },
  {
    id: 'C1',
    title: 'You can express yourself fluently and understand complex ideas and nuances.',
    illustration: LEVEL_ILLUSTRATIONS.C1,
    cardImage: LEVEL_CARD_IMAGES.C1,
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

      <div className="relative z-10 max-w-[1900px] mx-auto px-4 md:px-8 py-20">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h1 className="font-display text-[56px] md:text-[64px] leading-[1.1] tracking-[-0.02em] text-[#1A2340] mb-4">
            How&apos;s your <span className="italic text-[#8B1E2D]">French</span>&nbsp;?
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
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5 md:gap-6 xl:gap-8 mb-16"
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
                className="w-full cursor-pointer overflow-hidden rounded-2xl border border-[#E8DFD5] bg-white text-center shadow-sm transition-all duration-300 hover:shadow-md group"
              >
                {level.cardImage ? (
                  <LevelCardImage
                    src={level.cardImage}
                    alt={`${level.id} — ${level.title}`}
                  />
                ) : (
                  <>
                {/* Level label */}
                <div className="text-[28px] font-mono font-bold text-[#8B1E2D] mb-4 group-hover:scale-110 transition-transform p-6 pb-0">
                  {level.id}
                </div>

                {/* Illustration */}
                <div className="flex justify-center mb-5 min-h-[120px] items-center opacity-90 group-hover:opacity-100 transition-opacity px-6">
                  <Illustration />
                </div>

                {/* Description */}
                <p className="text-[14px] text-[#5B5047] leading-relaxed font-medium px-6 pb-6">
                  {level.title}
                </p>
                  </>
                )}
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
            <span>Find out with Parisly</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="group-hover:translate-x-1 transition-transform">
              <path d="M4 10h12M14 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
