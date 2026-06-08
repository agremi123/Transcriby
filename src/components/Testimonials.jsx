import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Container, Reveal, SectionLabel, Star } from './atoms';

const TESTIS = [
  {
    quote:
      "Parisly helped me finally speak French without fear of making mistakes. It's like having a personal coach available 24/7.",
    name: 'Emma B.',
    loc: 'Montreal, Canada',
    rating: 5,
    grad: 'linear-gradient(135deg,#C9A0A8,#8B1E2D)',
  },
  {
    quote:
      'The corrections feel incredibly natural and have helped me so much with my TCF prep. I recommend it 100%!',
    name: 'Lucas M.',
    loc: 'Lyon, France',
    rating: 4,
    grad: 'linear-gradient(135deg,#1A2340,#C9A0A8)',
  },
  {
    quote:
      "I love the real-time transcription — it helps me understand and improve my accent in a way no other tool has.",
    name: 'Sophie R.',
    loc: 'Brussels, Belgium',
    rating: 5,
    grad: 'linear-gradient(135deg,#D9D2C2,#1A2340)',
  },
  {
    quote:
      "A learning experience unlike anything I'd tried before. Precise, elegant, and remarkably effective.",
    name: 'Karim A.',
    loc: 'Casablanca, Morocco',
    rating: 5,
    grad: 'linear-gradient(135deg,#EFE8DA,#8B1E2D)',
  },
  {
    quote:
      "My French colleagues can no longer tell I'm a beginner. Thank you, Parisly.",
    name: 'Yuki T.',
    loc: 'Tokyo, Japan',
    rating: 5,
    grad: 'linear-gradient(135deg,#8B1E2D,#1A2340)',
  },
];

function Stars({ count = 5, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} filled={i < count} size={size} />
      ))}
    </div>
  );
}

export default function Testimonials() {
  const [page, setPage] = React.useState(0);
  const perPage = 3;
  const total = Math.max(1, TESTIS.length - perPage + 1);
  const visible = TESTIS.slice(page, page + perPage);

  const go = (d) => setPage((p) => Math.max(0, Math.min(total - 1, p + d)));

  return (
    <section id="testimonials" className="relative py-24 md:py-28 overflow-hidden">
      <Container>
        <div className="text-center mb-14">
          <Reveal>
            <SectionLabel>They speak better. And it shows.</SectionLabel>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="font-display text-[44px] md:text-[56px] leading-[1.02] text-navy">
              Loved by <span className="italic text-wine">thousands of learners.</span>
            </h2>
          </Reveal>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={page === 0}
            className="absolute -left-2 md:-left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-navy/20 bg-paper text-navy hover:bg-navy hover:text-ivory disabled:opacity-30 disabled:cursor-not-allowed transition-colors z-10 flex items-center justify-center"
            aria-label="Previous testimonials"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M9 2L4 7l5 5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={page === total - 1}
            className="absolute -right-2 md:-right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-navy/20 bg-paper text-navy hover:bg-navy hover:text-ivory disabled:opacity-30 disabled:cursor-not-allowed transition-colors z-10 flex items-center justify-center"
            aria-label="Next testimonials"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M5 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 px-2 md:px-10">
            <AnimatePresence mode="popLayout">
              {visible.map((t, i) => (
                <motion.div
                  key={`${page}-${t.name}`}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-paper border border-line p-7 flex flex-col"
                >
                  <p className="font-display text-[19px] leading-[1.45] text-navy/90 italic">
                    "{t.quote}"
                  </p>
                  <div className="mt-auto pt-7 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full" style={{ background: t.grad }} />
                      <div>
                        <div className="text-[13.5px] text-navy font-medium">{t.name}</div>
                        <div className="text-[12px] text-navy/55">{t.loc}</div>
                      </div>
                    </div>
                    <Stars count={t.rating} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-10">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`h-[3px] rounded-full transition-all duration-300 ${
                  i === page ? 'w-7 bg-wine' : 'w-3 bg-navy/20 hover:bg-navy/40'
                }`}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
