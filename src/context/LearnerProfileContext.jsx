import React from 'react';
import {
  applyInterviewReport,
  applySampleAssessment,
  gainParisianExperience,
  spendParisianExperience,
  getEffectiveLevel,
  getInitialParisianPercent,
  getLevelExercisesDone,
  markLevelExerciseDone,
  getLevelArticleCounts,
  getLevelLastType,
  incrementLevelArticle,
  loadLearnerProfile,
  resetWelcomeOnboarding as resetWelcomeOnboardingProfile,
  saveLearnerProfile,
} from '../lib/learnerProfile';
import {
  addDailyParisianPoints,
  DAILY_PARISIAN_POINTS_EVENT,
  loadDailyParisianPoints,
} from '../lib/dailyParisianPoints';
import { PARISIAN_XP_EVENT } from '../lib/targetProgress';

const LearnerProfileContext = React.createContext(null);

export function LearnerProfileProvider({ children }) {
  const [profile, setProfile] = React.useState(() => loadLearnerProfile());
  const [experienceHighlightTick, setExperienceHighlightTick] = React.useState(0);
  const [dailyParisianPoints, setDailyParisianPoints] = React.useState(
    () => loadDailyParisianPoints().points,
  );

  React.useEffect(() => {
    setProfile(loadLearnerProfile());
    setDailyParisianPoints(loadDailyParisianPoints().points);
  }, []);

  React.useEffect(() => {
    const syncDaily = () => setDailyParisianPoints(loadDailyParisianPoints().points);
    window.addEventListener(DAILY_PARISIAN_POINTS_EVENT, syncDaily);
    return () => window.removeEventListener(DAILY_PARISIAN_POINTS_EVENT, syncDaily);
  }, []);

  const gainExperience = React.useCallback((amount = 1) => {
    const next = gainParisianExperience(loadLearnerProfile(), amount);
    setProfile(next);
    setExperienceHighlightTick((tick) => tick + 1);
    return next;
  }, []);

  const spendExperience = React.useCallback((amount = 5) => {
    const next = spendParisianExperience(loadLearnerProfile(), amount);
    setProfile(next);
    return next;
  }, []);

  // Mark one exercise "stop" done at the learner's current level (idempotent).
  const markExerciseDone = React.useCallback((type) => {
    const current = loadLearnerProfile();
    const level = getEffectiveLevel(current);
    if (getLevelExercisesDone(current, level).includes(type)) return;
    setProfile(markLevelExerciseDone(current, level, type));
  }, []);

  // Record one finished exercise (article / podcast / prompt) for the current
  // level + skill. Two finished exercises = one completed challenge.
  const incrementArticle = React.useCallback((type) => {
    const current = loadLearnerProfile();
    const level = getEffectiveLevel(current);
    setProfile(incrementLevelArticle(current, level, type));
  }, []);

  const gainDailyParisianPoints = React.useCallback((amount) => {
    const next = addDailyParisianPoints(amount);
    setDailyParisianPoints(next);
    window.dispatchEvent(new CustomEvent(DAILY_PARISIAN_POINTS_EVENT, { detail: { points: next } }));
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
    levelExercisesDone: getLevelExercisesDone(profile, effectiveLevel),
    markExerciseDone,
    levelArticleCounts: getLevelArticleCounts(profile, effectiveLevel),
    levelLastType: getLevelLastType(profile, effectiveLevel),
    incrementArticle,
    experienceHighlightTick,
    setGender,
    completeOnboarding,
    setClaimedLevel,
    recordSample,
    mergeInterviewReport,
    gainExperience,
    spendExperience,
    dailyParisianPoints,
    gainDailyParisianPoints,
    refreshProfile,
    resetWelcomeOnboarding,
  }), [profile, effectiveLevel, experienceHighlightTick, dailyParisianPoints, setGender, completeOnboarding, setClaimedLevel, recordSample, mergeInterviewReport, gainExperience, spendExperience, markExerciseDone, gainDailyParisianPoints, refreshProfile, resetWelcomeOnboarding]);

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
