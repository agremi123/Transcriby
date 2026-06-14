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
  const podcasts = [
    { name: 'InnerFrench', art: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/5f/4b/51/5f4b5121-b307-4b0c-4ba9-3fba7aba161d/mza_1141892237621262066.jpg/600x600bb.jpg' },
    { name: 'Easy French', art: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts122/v4/3a/97/78/3a9778d3-4932-96d9-fb69-95dfae76e61a/mza_11621599327333719166.jpg/600x600bb.jpg' },
    { name: 'RFI Français Facile', art: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/81/15/23/8115239e-731b-e9eb-aeb4-bcc7bab89aae/mza_92410675554346166.jpg/600x600bb.jpg' },
    { name: 'Français Authentique', art: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/e8/5c/ac/e85cacb6-6ef2-e0fa-bbc3-e4bfc135b2bf/mza_10847007516377223831.jpg/600x600bb.jpg' },
    { name: 'Coffee Break French', art: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/73/01/0a/73010a40-85a8-4d98-1f0d-b25d96b8e86f/mza_11764534205288833014.jpg/600x600bb.jpg' },
    { name: 'Choses à Savoir', art: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/55/a8/3155a807-e878-0453-86f7-1842cd32a186/mza_12348316116145026782.jpeg/600x600bb.jpg' },
  ];

  return (
    <section className="relative py-14 border-y border-line bg-paper/40 overflow-hidden">
      <Container>
        <Reveal>
          <p className="text-center eyebrow text-navy/55 mb-9">
            All your favorite French podcasts, gathered here
          </p>
        </Reveal>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 sm:gap-8 items-center justify-items-center">
          {podcasts.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-md ring-1 ring-navy/10 group-hover:ring-wine/40 group-hover:shadow-lg transition-all duration-200">
                <img src={p.art} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <span className="font-display text-[12px] text-navy/55 text-center leading-tight group-hover:text-navy/75 transition-colors">{p.name}</span>
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
      desc: 'Parisly corrects your grammar and pronunciation as you speak, instantly.',
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
