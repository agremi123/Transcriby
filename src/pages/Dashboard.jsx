import React from 'react';
import { motion } from 'framer-motion';
import { LevelAssessmentDashboard } from '../components/LevelAssessmentDashboard';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { LEVEL_ILLUSTRATIONS, LEVEL_CARD_IMAGES, LevelCardImage } from '../components/LevelIllustrations';

const LEVELS = [
  { id: 'A1', label: 'A1', title: 'Beginner', desc: 'You can say hello, introduce yourself and ask simple questions.', color: 'bg-[#C9A0A8]', cardImage: LEVEL_CARD_IMAGES.A1 },
  { id: 'A2', label: 'A2', title: 'Elementary', desc: 'You can order food and buy a cinema ticket.', color: 'bg-[#9B8B7E]', cardImage: LEVEL_CARD_IMAGES.A2 },
  { id: 'B1', label: 'B1', title: 'Intermediate', desc: 'You can talk about your day, your hobbies and your plans.', color: 'bg-[#8B1E2D]', cardImage: LEVEL_CARD_IMAGES.B1 },
  { id: 'B2', label: 'B2', title: 'Upper Intermediate', desc: 'You can talk about many topics and share your opinion with confidence.', color: 'bg-[#5B4D7A]', cardImage: LEVEL_CARD_IMAGES.B2 },
  { id: 'C1', label: 'C1', title: 'Advanced', desc: 'You can express yourself fluently and understand complex ideas and nuances.', color: 'bg-[#3D3B5C]', cardImage: LEVEL_CARD_IMAGES.C1 },
];

export default function Dashboard() {
  const { setClaimedLevel } = useLearnerProfile();
  const [selectedLevel, setSelectedLevel] = React.useState(null);

  const selectedLevelData = LEVELS.find((l) => l.id === selectedLevel);

  const handleLevelSelect = (levelId) => {
    setClaimedLevel(levelId);
    setSelectedLevel(levelId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`fixed inset-0 bg-paper flex flex-col ${selectedLevel ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      {!selectedLevel ? (
        <>
      {/* Header section */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative">
        <div className="max-w-[1200px] w-full relative z-10 text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h1 className="font-display text-[64px] leading-[1.1] tracking-[-0.02em] text-navy mb-2">
              How's your <span className="text-wine italic">French</span>?
            </h1>
            <div className="w-20 h-1.5 bg-wine mx-auto"></div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center"
          >
            <button
              onClick={() => {
                const el = document.getElementById('levels-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex items-center gap-3 px-8 py-4 border-2 border-wine text-wine rounded-full hover:bg-wine hover:text-ivory transition-all duration-300 font-display text-[16px]"
            >
              Pick your estimated level
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                <path d="M4 10h12M14 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </motion.div>
        </div>
      </div>

      {/* Levels section */}
      <div id="levels-section" className="relative py-20 px-4 md:px-8">
        <div className="max-w-[1900px] mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6 xl:gap-8"
          >
            {LEVELS.map((level, index) => (
              <motion.button
                key={level.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                onClick={() => handleLevelSelect(level.id)}
                className={`block w-full cursor-pointer overflow-hidden rounded-2xl border p-0 text-center transition-all duration-300 hover:shadow-xl group ${
                  selectedLevel === level.id
                    ? 'border-wine shadow-lg ring-2 ring-wine/20'
                    : 'border-line/40 bg-white hover:border-wine/40'
                }`}
              >
                {level.cardImage ? (
                  <LevelCardImage
                    src={level.cardImage}
                    alt={`${level.label} — ${level.title}`}
                  />
                ) : (
                  <>
                    <div className="min-h-[240px] bg-ivory/50 flex items-center justify-center px-4 pt-10 pb-8 group-hover:bg-ivory/70 transition-colors [&_svg]:scale-125">
                      {React.createElement(LEVEL_ILLUSTRATIONS[level.id])}
                    </div>
                    <div className="px-6 py-6 flex flex-col gap-2 flex-1 items-center">
                      <span className="font-display text-[44px] leading-none font-semibold text-wine">{level.label}</span>
                      <span className="font-display text-[16px] font-bold text-navy">{level.title}</span>
                      <p className="text-[14px] leading-relaxed text-navy/65 flex-1">{level.desc}</p>
                    </div>
                    <div className={`h-2 ${level.color}`}></div>
                  </>
                )}
              </motion.button>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Footer section */}
      <div className="py-16 px-6 mt-12">
        <div className="max-w-[1400px] mx-auto flex flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex items-center gap-2 text-navy"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-wine flex-shrink-0">
              <circle cx="8" cy="14" r="2" fill="currentColor"/>
              <circle cx="16" cy="14" r="2" fill="currentColor"/>
              <path d="M12 3C6.48 3 2 6.58 2 11c0 3.25 2.25 6.08 5.35 6.84.18.49.35 1.06.35 1.66 0 2.5-2 5.5-5 5.5h1.5c2 0 3.5-1 3.5-3v-.5c0-1 .5-1.5 1.5-1.5h3c1 0 1.5.5 1.5 1.5v.5c0 2 1.5 3 3.5 3h1.5c-3-1-5-3-5-5.5 0-.6.17-1.17.35-1.66C19.75 17.08 22 14.25 22 11c0-4.42-4.48-8-10-8z" fill="currentColor"/>
            </svg>
            <span className="text-[15px]">Keep learning to take your French to the next level.</span>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            onClick={() => {}}
            className="px-8 py-4 bg-wine text-ivory rounded-full font-display text-[16px] font-medium hover:bg-wine2 transition-all duration-300 shadow-sm hover:shadow-md"
          >
            Find out with Nativa
          </motion.button>
        </div>
      </div>
        </>
      ) : (
        selectedLevelData && (
          <LevelAssessmentDashboard
            key={selectedLevel}
            levelId={selectedLevel}
            levelTitle={selectedLevelData.title}
            onBack={() => setSelectedLevel(null)}
          />
        )
      )}
    </div>
  );
}
