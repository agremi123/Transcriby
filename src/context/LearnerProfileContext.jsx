import React from 'react';
import {
  applyInterviewReport,
  applySampleAssessment,
  gainParisianExperience,
  getEffectiveLevel,
  getInitialParisianPercent,
  loadLearnerProfile,
  resetWelcomeOnboarding as resetWelcomeOnboardingProfile,
  saveLearnerProfile,
} from '../lib/learnerProfile';
import { PARISIAN_XP_EVENT } from '../lib/targetProgress';

const LearnerProfileContext = React.createContext(null);

export function LearnerProfileProvider({ children }) {
  const [profile, setProfile] = React.useState(() => loadLearnerProfile());
  const [experienceHighlightTick, setExperienceHighlightTick] = React.useState(0);

  React.useEffect(() => {
    setProfile(loadLearnerProfile());
  }, []);

  const gainExperience = React.useCallback((amount = 1) => {
    const next = gainParisianExperience(loadLearnerProfile(), amount);
    setProfile(next);
    setExperienceHighlightTick((tick) => tick + 1);
    return next;
  }, []);

  React.useEffect(() => {
    const onParisianXp = (event) => {
      const amount = Number(event?.detail?.amount) || 0;
      if (amount > 0) gainExperience(amount);
    };
    window.addEventListener(PARISIAN_XP_EVENT, onParisianXp);
    return () => window.removeEventListener(PARISIAN_XP_EVENT, onParisianXp);
  }, [gainExperience]);

  const refreshProfile = React.useCallback(() => {
    setProfile(loadLearnerProfile());
  }, []);

  const resetWelcomeOnboarding = React.useCallback(() => {
    setProfile(resetWelcomeOnboardingProfile(loadLearnerProfile()));
  }, []);

  const setGender = React.useCallback((gender) => {
    setProfile(saveLearnerProfile({ ...loadLearnerProfile(), gender }));
  }, []);

  const completeOnboarding = React.useCallback((claimedLevel, { name, email, authMethod } = {}) => {
    const current = loadLearnerProfile();
    const level = claimedLevel;
    setProfile(saveLearnerProfile({
      ...current,
      claimedLevel: level,
      name: String(name || '').trim().slice(0, 48),
      email: String(email || '').trim().slice(0, 120),
      authMethod: authMethod === 'google' || authMethod === 'email' ? authMethod : null,
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
    resetWelcomeOnboarding,
  }), [profile, effectiveLevel, experienceHighlightTick, setGender, completeOnboarding, setClaimedLevel, recordSample, mergeInterviewReport, gainExperience, refreshProfile, resetWelcomeOnboarding]);

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
