import { Container, Reveal, ButtonGhost } from './atoms';

const LEVELS = [
  {
    id: 'A1',
    label: 'A1',
    title: 'Beginner',
    desc: 'You can say hello, introduce yourself and ask simple questions.',
    icon: '👋',
  },
  {
    id: 'A2',
    label: 'A2',
    title: 'Elementary',
    desc: 'You can order food and buy a cinema ticket.',
    icon: '☕',
  },
  {
    id: 'B1',
    label: 'B1',
    title: 'Intermediate',
    desc: 'You can talk about your day, your hobbies and your plans.',
    icon: '💬',
  },
  {
    id: 'B2',
    label: 'B2',
    title: 'Upper Intermediate',
    desc: 'You can talk about many topics and share your opinion with confidence.',
    icon: '👥',
  },
  {
    id: 'C1',
    label: 'C1',
    title: 'Advanced',
    desc: 'You can express yourself fluently and understand complex ideas and nuances.',
    icon: '📖',
  },
];

function LevelCard({ level, delay }) {
  return (
    <Reveal delay={delay}>
      <div className="flex flex-col items-center text-center h-full">
        <div className="text-[48px] mb-4">{level.icon}</div>
        <span className="font-display text-[28px] font-bold text-navy mb-1">{level.label}</span>
        <p className="text-[13px] font-medium text-navy mb-3">{level.title}</p>
        <p className="text-[13px] leading-[1.6] text-navy/65 flex-1">{level.desc}</p>
        <div className="w-full h-1 bg-gradient-to-r from-wine to-wine mt-4 rounded-full" />
      </div>
    </Reveal>
  );
}

export function ProficiencyLevels() {
  return (
    <section className="py-24 md:py-32 relative">
      <Container>
        <div className="max-w-[900px] mx-auto">
          <div className="mb-16 flex flex-col items-center text-center">
            <Reveal delay={0.1}>
              <h2 className="font-display text-[52px] md:text-[64px] leading-[0.95] tracking-[-0.015em] text-navy mb-2">
                How's your
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <h2 className="font-display text-[52px] md:text-[64px] leading-[0.95] tracking-[-0.015em] text-wine italic mb-8">
                French?
              </h2>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="w-16 h-1 bg-wine rounded-full mb-6" />
            </Reveal>
            <Reveal delay={0.4}>
              <ButtonGhost>Find out with Nativa</ButtonGhost>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 md:gap-4">
            {LEVELS.map((level, i) => (
              <LevelCard key={level.id} level={level} delay={0.5 + i * 0.08} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
