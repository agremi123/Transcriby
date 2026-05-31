import React from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav';
import { Container } from '../components/atoms';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getLevelTargets, TARGET_CATEGORIES } from '../lib/levelTargets';
import {
  loadSelectedTargetIds,
  loadTargetProgress,
  toggleSelectedTarget,
} from '../lib/targetProgress';

function practiceUrl(topic) {
  return `/?practice=${encodeURIComponent(topic)}#nativa-demo`;
}

function TargetCard({ target, selected, progress, onToggleSelect }) {
  return (
    <li className={`border bg-ivory/50 transition-colors ${
      selected ? 'border-wine/40 ring-1 ring-wine/10' : 'border-line/70'
    }`}>
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-[9px] tracking-widest uppercase text-navy/35">{target.category}</span>
              {selected && (
                <span className="text-[9px] tracking-widest uppercase text-wine/70">Selected</span>
              )}
            </div>
            <h2 className="font-display text-[17px] text-navy leading-snug">{target.label}</h2>
            <p className="mt-1 text-[14px] text-navy/55 leading-relaxed">{target.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onToggleSelect(target.id)}
            className={`shrink-0 w-8 h-8 rounded-full border transition-colors ${
              selected
                ? 'border-wine bg-wine text-ivory'
                : 'border-navy/15 text-navy/30 hover:border-wine/40 hover:text-wine'
            }`}
            aria-label={selected ? 'Remove from my focus list' : 'Add to my focus list'}
            title={selected ? 'Remove from focus' : 'Add to focus'}
          >
            {selected ? (
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="mx-auto" aria-hidden>
                <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="mx-auto" aria-hidden>
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-navy/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-wine transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-navy/40 tabular-nums w-8 text-right">{progress}%</span>
        </div>

        <Link
          to={practiceUrl(target.topic)}
          className="self-start font-display text-[13px] italic text-wine hover:text-wine2 transition-colors"
        >
          Practice this →
        </Link>
      </div>
    </li>
  );
}

export default function MyTargets() {
  const { effectiveLevel, profile } = useLearnerProfile();
  const levelInfo = React.useMemo(
    () => getLevelTargets(effectiveLevel, profile.parisianPercent),
    [effectiveLevel, profile.parisianPercent],
  );
  const [selectedIds, setSelectedIds] = React.useState(() => loadSelectedTargetIds());
  const [progressVersion, setProgressVersion] = React.useState(0);
  const [activeCategory, setActiveCategory] = React.useState('All');
  const progressMap = React.useMemo(() => loadTargetProgress(), [progressVersion]);

  React.useEffect(() => {
    const refresh = () => setProgressVersion((v) => v + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const handleToggleSelect = (id) => {
    setSelectedIds(toggleSelectedTarget(id));
  };

  const filteredTargets = levelInfo.targets.filter(
    (t) => activeCategory === 'All' || t.category === activeCategory,
  );

  const selectedCount = selectedIds.filter((id) => levelInfo.targets.some((t) => t.id === id)).length;

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="pt-[96px] pb-16">
        <Container className="max-w-[720px]">
          <div className="mb-8">
            <Link to="/" className="text-[13px] text-navy/45 hover:text-wine transition-colors">
              ← Back
            </Link>
            <h1 className="mt-4 font-display text-[40px] leading-tight text-navy">
              My <span className="text-wine italic">targets</span>
            </h1>
            <p className="mt-2 text-[15px] text-navy/60 leading-relaxed">
              {levelInfo.atMaxLevel
                ? 'Fine-tune your Parisian edge — pick skills to keep sharp.'
                : `Choose what to practice to reach ${levelInfo.nextLevel} (${levelInfo.nextRole}).`}
            </p>
          </div>

          <div className="mb-6 p-4 border border-line/70 bg-ivory/40 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] tracking-widest uppercase text-navy/35 mb-1">Your level</p>
              <p className="font-display text-[22px] text-wine leading-none">
                {levelInfo.currentLevel}
                <span className="text-[14px] text-navy/45 ml-2 not-italic">{levelInfo.currentRole}</span>
              </p>
            </div>
            {!levelInfo.atMaxLevel && (
              <div className="flex-1 min-w-0 sm:border-l sm:border-line/50 sm:pl-4">
                <p className="text-[9px] tracking-widest uppercase text-navy/35 mb-1">Next goal</p>
                <p className="font-display text-[22px] text-navy leading-none">
                  {levelInfo.nextLevel}
                  <span className="text-[14px] text-navy/45 ml-2 not-italic">{levelInfo.nextRole}</span>
                </p>
              </div>
            )}
            <div className="flex-1 min-w-0 sm:border-l sm:border-line/50 sm:pl-4">
              <p className="text-[9px] tracking-widest uppercase text-navy/35 mb-1">Parisian progress</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-navy/8 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-wine rounded-full"
                    style={{ width: `${levelInfo.progress}%` }}
                  />
                </div>
                <span className="text-[12px] font-mono text-navy/50 tabular-nums">{levelInfo.progress}%</span>
              </div>
            </div>
          </div>

          {selectedCount > 0 && (
            <p className="mb-4 text-[13px] text-navy/50">
              {selectedCount} target{selectedCount === 1 ? '' : 's'} in your focus list
            </p>
          )}

          <div className="flex flex-wrap gap-2 mb-5">
            {['All', ...TARGET_CATEGORIES].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`font-display text-[12px] px-3 py-1 rounded-full border transition-colors ${
                  activeCategory === cat
                    ? 'border-wine bg-wine text-ivory'
                    : 'border-navy/15 text-navy/50 hover:border-wine/30 hover:text-wine'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredTargets.length === 0 ? (
            <div className="border border-line/70 bg-ivory/50 px-6 py-10 text-center">
              <p className="font-display text-[18px] text-navy/70">No targets in this category.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredTargets.map((target) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  selected={selectedIds.includes(target.id)}
                  progress={Math.max(0, Math.min(100, Number(progressMap[target.id]) || 0))}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </ul>
          )}

          <p className="mt-8 text-[13px] text-navy/40 leading-relaxed">
            Tap <span className="text-navy/55">+</span> to add targets to your focus list.
            Progress increases as you complete practice exercises on the homepage.
          </p>
        </Container>
      </main>
    </div>
  );
}
