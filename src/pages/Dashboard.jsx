import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AudioDemoCard } from '../components/Hero';

const LEVELS = [
  { id: 'A1', label: 'A1', title: 'Beginner', desc: 'You can say hello, introduce yourself and ask simple questions.' },
  { id: 'A2', label: 'A2', title: 'Elementary', desc: 'You can order food and buy a cinema ticket.' },
  { id: 'B1', label: 'B1', title: 'Intermediate', desc: 'You can talk about your day, your hobbies and your plans.' },
  { id: 'B2', label: 'B2', title: 'Upper Intermediate', desc: 'You can talk about many topics and share your opinion with confidence.' },
  { id: 'C1', label: 'C1', title: 'Advanced', desc: 'You can express yourself fluently and understand complex ideas and nuances.' },
];

export default function Dashboard() {
  const [params] = useSearchParams();
  const topic = params.get('topic') || null;
  const [selectedLevel, setSelectedLevel] = React.useState(null);

  return (
    <div className="fixed inset-0 bg-paper flex flex-col">
      {!selectedLevel ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        >
          <div className="max-w-[1200px] w-full text-center space-y-12">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display text-[48px] leading-[1.2] tracking-[-0.015em] text-navy"
            >
              How's your <span className="text-wine italic">French</span>?
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid grid-cols-5 gap-4"
            >
              {LEVELS.map((level, index) => (
                <motion.button
                  key={level.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  onClick={() => setSelectedLevel(level.id)}
                  className="flex flex-col gap-3 p-6 border border-line/70 rounded-lg hover:border-wine/50 hover:bg-wine/5 transition-all duration-200 cursor-pointer text-left"
                >
                  <span className="font-mono text-[24px] font-bold text-wine">{level.label}</span>
                  <span className="font-display text-[16px] text-navy">{level.title}</span>
                  <p className="text-[13px] leading-snug text-navy/70">
                    {level.desc}
                  </p>
                </motion.button>
              ))}
            </motion.div>
          </div>
        </motion.div>
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
