import React from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav';
import { ParisianProfileSquare } from '../components/ParisianCornerBadge';
import { Container } from '../components/atoms';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getLevelTargets, groupTargetsByPath, PATH_CATEGORIES } from '../lib/levelTargets';
import {
  loadSelectedTargetIds,
  loadTargetProgress,
  PARISIAN_XP_EVENT,
  toggleSelectedTarget,
} from '../lib/targetProgress';

function practiceUrl(topic) {
  return `/?practice=${encodeURIComponent(topic)}#nativa-demo`;
}

const PATH_HINTS = {
  Grammar: 'Structures & tenses',
  Vocabulary: 'Words & topics',
  Speaking: 'Say it like a Parisian',
  Listening: 'Train your ear',
};

function TargetRow({ target, progress }) {
  return (
    <li className="border-t border-line/60 first:border-t-0">
      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[14px] text-navy leading-snug">{target.label}</h3>
          <p className="mt-0.5 text-[12px] text-navy/50 leading-relaxed line-clamp-2">{target.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-navy/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-wine transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-navy/40 tabular-nums w-7 text-right">{progress}%</span>
        </div>
        <Link
          to={practiceUrl(target.topic)}
          className="font-display text-[12px] italic text-wine hover:text-wine2 transition-colors"
        >
          Practice →
        </Link>
      </div>
    </li>
  );
}

function PathColumn({ category, targets, progressMap }) {
  return (
    <section className="flex flex-col min-h-0 border border-line/70 bg-ivory/30">
      <header className="px-4 py-3 border-b border-line/60 bg-paper/80">
        <h2 className="font-display text-[17px] text-navy leading-tight">{category}</h2>
        <p className="mt-0.5 text-[11px] text-navy/45">{PATH_HINTS[category]}</p>
      </header>
      {targets.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-navy/45 text-center">Nothing here yet.</p>
      ) : (
        <ul className="flex-1 overflow-auto">
          {targets.map((target) => (
            <TargetRow
              key={target.id}
              target={target}
              progress={Math.max(0, Math.min(100, Number(progressMap[target.id]) || 0))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MyTargets() {
  const { effectiveLevel, profile } = useLearnerProfile();
  const levelInfo = React.useMemo(
    () => getLevelTargets(effectiveLevel, profile.parisianPercent),
    [effectiveLevel, profile.parisianPercent],
  );
  const grouped = React.useMemo(
    () => groupTargetsByPath(levelInfo.targets),
    [levelInfo.targets],
  );
  const [progressVersion, setProgressVersion] = React.useState(0);
  const progressMap = React.useMemo(() => loadTargetProgress(), [progressVersion, profile.parisianPercent]);

  React.useEffect(() => {
    const refresh = () => setProgressVersion((v) => v + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener(PARISIAN_XP_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PARISIAN_XP_EVENT, refresh);
    };
  }, []);

  const goalLevel = levelInfo.atMaxLevel ? levelInfo.currentLevel : levelInfo.nextLevel;

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="pt-[96px] pb-16">
        <Container className="max-w-[1120px]">
          <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <Link to="/" className="text-[13px] text-navy/45 hover:text-wine transition-colors">
                ← Back
              </Link>
              <h1 className="mt-4 font-display text-[34px] sm:text-[40px] leading-tight text-navy">
                {levelInfo.atMaxLevel ? (
                  <>Keep your <span className="text-wine italic">Parisian edge</span></>
                ) : (
                  <>
                    4 ways to reach{' '}
                    <span className="text-wine italic">{goalLevel}</span>
                  </>
                )}
              </h1>
              <p className="mt-2 text-[15px] text-navy/60 leading-relaxed max-w-xl">
                {levelInfo.atMaxLevel
                  ? 'Pick subjects in each column — every completed task adds Parisian experience to your profile.'
                  : `Tackle grammar, vocabulary, speaking, and listening on your path to ${goalLevel} (${levelInfo.nextRole}). Practice on the homepage earns Parisian XP.`}
              </p>
              <p className="mt-2 text-[13px] text-navy/45">
                You are <span className="text-wine font-display">{levelInfo.currentLevel}</span>
                {!levelInfo.atMaxLevel && (
                  <>
                    {' '}
                    → next: <span className="text-navy/70 font-display">{levelInfo.nextLevel}</span>
                  </>
                )}
              </p>
            </div>
            <div className="shrink-0 sm:pt-8">
              <ParisianProfileSquare className="shadow-[0_8px_28px_rgba(26,35,50,0.08)]" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {PATH_CATEGORIES.map((category) => (
              <PathColumn
                key={category}
                category={category}
                targets={grouped[category] || []}
                progressMap={progressMap}
              />
            ))}
          </div>

          <p className="mt-8 text-[13px] text-navy/40 leading-relaxed max-w-2xl">
            Complete practice exercises on the homepage to fill each subject. You gain Parisian experience
            as you progress — watch your profile badge update in the nav and above.
          </p>
        </Container>
      </main>
    </div>
  );
}
