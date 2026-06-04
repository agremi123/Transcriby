import { motion } from 'framer-motion';
import { Container, Reveal, SectionLabel } from './atoms';

const ICONS = {
  mic: (
    <path
      d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v4M8 22h8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  sparkle: (
    <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 16l.7 1.8L21.5 18l-1.8.7L19 20l-.7-1.3L16.5 18l1.8-.2L19 16z" />
    </g>
  ),
  target: (
    <g stroke="currentColor" strokeWidth="1.4" fill="none">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </g>
  ),
  headphones: (
    <path
      d="M4 14v-2a8 8 0 0116 0v2M4 14a2 2 0 012-2h1v6H6a2 2 0 01-2-2v-2zm16 0a2 2 0 00-2-2h-1v6h1a2 2 0 002-2v-2z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  trend: (
    <path
      d="M3 17l5-5 4 4 8-9M14 7h7v7"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
};

function FeatureCard({ icon, title, desc, delay }) {
  return (
    <Reveal delay={delay}>
      <div className="group relative bg-paper/70 border border-line p-6 h-full hover:border-wine/40 hover:bg-paper transition-all duration-300">
        <div className="text-wine mb-5">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
            {ICONS[icon]}
          </svg>
        </div>
        <h3 className="font-display text-[22px] text-navy leading-tight mb-2">{title}</h3>
        <p className="text-[13.5px] leading-[1.65] text-navy/65">{desc}</p>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-wine scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500" />
      </div>
    </Reveal>
  );
}

export function UniversitiesBar() {
  const items = [
    { name: 'InnerFrench', style: 'font-display italic text-[22px]' },
    { name: 'EASY FRENCH', style: 'font-display text-[20px] tracking-[0.15em]' },
    { name: 'RFI Français Facile', style: 'font-display italic text-[18px]' },
    { name: 'Français Authentique', style: 'font-display italic text-[19px]' },
    { name: 'CHOSES À SAVOIR', style: 'font-display text-[17px] tracking-[0.1em]' },
    { name: 'Coffee Break French', style: 'font-display italic text-[18px]' },
  ];

  return (
    <section className="relative py-14 border-y border-line bg-paper/40 overflow-hidden">
      <Container>
        <Reveal>
          <p className="text-center eyebrow text-navy/55 mb-9">
            All your favorite French podcasts, gathered here
          </p>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-10 items-center">
          {items.map((it, i) => (
            <motion.div
              key={it.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 0.55, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.05 }}
              className="text-center text-navy hover:opacity-90 transition-opacity"
            >
              <span className={it.style}>{it.name}</span>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function Features() {
  const cards = [
    {
      icon: 'mic',
      title: 'Real-time correction',
      desc: 'Nativa corrects your grammar and pronunciation as you speak, instantly.',
    },
    {
      icon: 'sparkle',
      title: 'Natural phrasing',
      desc: 'Get native-sounding suggestions to express yourself like a true French speaker.',
    },
    {
      icon: 'target',
      title: 'TCF/TEF prep',
      desc: 'Practice with real exam simulations and boost your oral score with confidence.',
    },
    {
      icon: 'headphones',
      title: 'Live captions',
      desc: 'See your speech transcribed in real time so you never lose track of what you said.',
    },
    {
      icon: 'trend',
      title: 'Progress tracking',
      desc: 'Analyze your progress and watch your fluency improve day after day.',
    },
  ];

  return (
    <section id="features" className="py-24 md:py-28 relative">
      <Container>
        <div className="flex items-end justify-between flex-wrap gap-6 mb-14">
          <div>
            <SectionLabel>Built for your fluency</SectionLabel>
            <h2 className="font-display text-[44px] md:text-[56px] leading-[1.02] text-navy max-w-[640px]">
              Everything you need
              <br />
              to speak French with <span className="italic text-wine">ease.</span>
            </h2>
          </div>
          <a href="#" className="group inline-flex items-center gap-2 text-wine text-[14px] font-medium">
            Explore all features
            <svg
              className="transition-transform duration-300 group-hover:translate-x-1"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
            >
              <path
                d="M1 7h12m0 0L8 2m5 5l-5 5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
          {cards.map((c, i) => (
            <FeatureCard key={c.title} {...c} delay={i * 0.07} />
          ))}
        </div>
      </Container>
    </section>
  );
}
