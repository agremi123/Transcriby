import React from 'react';
import {
  applyInterviewReport,
  applySampleAssessment,
  gainParisianExperience,
  getEffectiveLevel,
  getInitialParisianPercent,
  loadLearnerProfile,
  saveLearnerProfile,
} from '../lib/learnerProfile';

const LearnerProfileContext = React.createContext(null);

export function LearnerProfileProvider({ children }) {
  const [profile, setProfile] = React.useState(() => loadLearnerProfile());
  const [experienceHighlightTick, setExperienceHighlightTick] = React.useState(0);

  React.useEffect(() => {
    setProfile(loadLearnerProfile());
  }, []);

  const refreshProfile = React.useCallback(() => {
    setProfile(loadLearnerProfile());
  }, []);

  const setGender = React.useCallback((gender) => {
    setProfile(saveLearnerProfile({ ...loadLearnerProfile(), gender }));
  }, []);

  const completeOnboarding = React.useCallback((claimedLevel, gender, name) => {
    const current = loadLearnerProfile();
    const level = claimedLevel;
    setProfile(saveLearnerProfile({
      ...current,
      claimedLevel: level,
      gender: gender || current.gender,
      name: String(name || '').trim().slice(0, 48),
      parisianPercent: getInitialParisianPercent(level),
    }));
  }, []);

  const setClaimedLevel = React.useCallback((claimedLevel) => {
    setProfile(saveLearnerProfile({
      ...loadLearnerProfile(),
      claimedLevel,
    }));
  }, []);

  const recordSample = React.useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed.length < 8) return null;

    const current = loadLearnerProfile();
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          assessOnly: true,
          learnerLevel: getEffectiveLevel(current),
        }),
      });
      const data = await res.json();
      if (!data?.level) return null;
      const next = applySampleAssessment(current, {
        level: data.level,
        strength: data.strength,
        weakness: data.weakness,
      });
      setProfile(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const mergeInterviewReport = React.useCallback((report, claimedLevel) => {
    const next = applyInterviewReport(loadLearnerProfile(), report, claimedLevel);
    setProfile(next);
    return next;
  }, []);

  const gainExperience = React.useCallback((amount = 1) => {
    const next = gainParisianExperience(loadLearnerProfile(), amount);
    setProfile(next);
    setExperienceHighlightTick((tick) => tick + 1);
    return next;
  }, []);

  const effectiveLevel = getEffectiveLevel(profile);

  const value = React.useMemo(() => ({
    profile,
    effectiveLevel,
    experienceHighlightTick,
    setGender,
    completeOnboarding,
    setClaimedLevel,
    recordSample,
    mergeInterviewReport,
    gainExperience,
    refreshProfile,
  }), [profile, effectiveLevel, experienceHighlightTick, setGender, completeOnboarding, setClaimedLevel, recordSample, mergeInterviewReport, gainExperience, refreshProfile]);

  return (
    <LearnerProfileContext.Provider value={value}>
      {children}
    </LearnerProfileContext.Provider>
  );
}

export function useLearnerProfile() {
  const ctx = React.useContext(LearnerProfileContext);
  if (!ctx) throw new Error('useLearnerProfile must be used within LearnerProfileProvider');
  return ctx;
}
