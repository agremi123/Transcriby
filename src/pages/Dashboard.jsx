import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AudioDemoCard } from '../components/Hero';

const LEVELS = [
  { id: 'A1', label: 'A1', title: 'Beginner', desc: 'Can introduce yourself and ask basic questions', emoji: '👋', color: 'bg-[#C9A0A8]' },
  { id: 'A2', label: 'A2', title: 'Elementary', desc: 'Can order food and buy tickets', emoji: '☕', color: 'bg-[#9B8B7E]' },
  { id: 'B1', label: 'B1', title: 'Intermediate', desc: 'Can talk about your day and hobbies', emoji: '💬', color: 'bg-[#8B1E2D]' },
  { id: 'B2', label: 'B2', title: 'Upper Intermediate', desc: 'Can comfortably join group conversations', emoji: '👥', color: 'bg-[#5B4D7A]' },
  { id: 'C1', label: 'C1', title: 'Advanced', desc: 'Can express nuanced ideas naturally', emoji: '📚', color: 'bg-[#3D3B5C]' },
];

export default function Dashboard() {
  const [params] = useSearchParams();
  const topic = params.get('topic') || null;
  const [selectedLevel, setSelectedLevel] = React.useState(null);

  return (
    <div className="fixed inset-0 bg-paper flex flex-col overflow-y-auto">
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
          <div id="levels-section" className="relative py-20 px-6">
            <div className="max-w-[1400px] mx-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="grid grid-cols-5 gap-6"
              >
                {LEVELS.map((level, index) => (
                  <motion.button
                    key={level.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                    onClick={() => setSelectedLevel(level.id)}
                    className="flex flex-col gap-0 bg-white border border-line/40 rounded-2xl overflow-hidden hover:border-wine/40 hover:shadow-xl transition-all duration-300 cursor-pointer text-left group"
                  >
                    {/* Icon area */}
                    <div className="h-28 bg-ivory/50 flex items-center justify-center group-hover:bg-ivory/70 transition-colors">
                      <span className="text-[48px]">{level.emoji}</span>
                    </div>

                    {/* Content */}
                    <div className="px-5 py-5 flex flex-col gap-3 flex-1">
                      <span className="font-mono text-[18px] font-bold text-wine">{level.label}</span>
                      <span className="font-display text-[13px] font-medium text-navy">{level.title}</span>
                      <p className="text-[13px] leading-snug text-navy/65 flex-1">
                        {level.desc}
                      </p>
                    </div>

                    {/* Color bar */}
                    <div className={`h-1.5 ${level.color}`}></div>
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
        <AudioDemoCard
          fullscreen
          onClose={() => setSelectedLevel(null)}
          initialTopic={topic}
        />
      )}
    </div>
  );
}
