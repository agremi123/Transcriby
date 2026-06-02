import React from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../components/Nav';
import { LevelAssessmentDashboard } from '../components/LevelAssessmentDashboard';
import { useLearnerProfile } from '../context/LearnerProfileContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { effectiveLevel, profile } = useLearnerProfile();
  const assessmentLevel = profile?.claimedLevel || effectiveLevel || 'A2';
  const [verdictView, setVerdictView] = React.useState(false);

  return (
    <div className="fixed inset-0 bg-paper flex flex-col overflow-hidden">
      <Nav />
      <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${verdictView ? 'pt-[68px]' : 'pt-[72px]'}`}>
        {!verdictView && (
          <header className="shrink-0 text-center px-6 pt-2 pb-1 z-10">
            <h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.08] tracking-[-0.02em] text-navy">
              How&apos;s your <span className="text-wine italic">French</span>&nbsp;?
            </h1>
            <div className="w-16 h-1 bg-wine mx-auto mt-1.5" aria-hidden />
          </header>
        )}

        <LevelAssessmentDashboard
          embedded
          levelId={assessmentLevel}
          onBack={() => navigate('/')}
          onVerdictViewChange={setVerdictView}
        />
      </div>
    </div>
  );
}
