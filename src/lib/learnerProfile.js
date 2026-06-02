import { normalizeLearnerGender } from './learnerGender';

const PROFILE_KEY = 'nativa-learner-profile';
const LEGACY_GENDER_KEY = 'nativa-learner-gender';
const LEGACY_PERCENT_KEY = 'nativa-parisian-percent';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const PARISIAN_MASCOTS = {
  woman: '/assets/parisian-woman.png',
  man: '/assets/parisian-man.png',
};

const LEVEL_INDEX = Object.fromEntries(CEFR_LEVELS.map((l, i) => [l, i]));

const DEFAULT_PROFILE = {
  name: '',
  email: '',
  authMethod: null,
  gender: null,
  claimedLevel: null,
  assessedLevel: null,
  parisianPercent: 0,
  sampleCount: 0,
  onboardingComplete: false,
  lastStrength: null,
  lastWeakness: null,
  updatedAt: null,
};

function normalizeLevel(level) {
  const v = String(level || '').trim().toUpperCase();
  return CEFR_LEVELS.includes(v) ? v : null;
}

function migrateLegacyProfile() {
  try {
    const gender = normalizeLearnerGender(localStorage.getItem(LEGACY_GENDER_KEY));
    const rawPercent = localStorage.getItem(LEGACY_PERCENT_KEY);
    const parisianPercent = rawPercent != null && rawPercent !== ''
      ? Math.max(0, Math.min(100, Number.parseInt(rawPercent, 10) || 0))
      : 0;
    if (!gender && !parisianPercent) return null;
    return {
      ...DEFAULT_PROFILE,
      gender,
      parisianPercent,
    };
  } catch {
    return null;
  }
}

export function loadLearnerProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const claimedLevel = normalizeLevel(parsed.claimedLevel);
      let parisianPercent = Math.max(0, Math.min(100, Number(parsed.parisianPercent) || 0));
      const sampleCount = Math.max(0, Number(parsed.sampleCount) || 0);
      const name = String(parsed.name || '').trim().slice(0, 48);
      const gender = normalizeLearnerGender(parsed.gender);
      if (name && gender && claimedLevel && sampleCount === 0 && parisianPercent === 0) {
        parisianPercent = getInitialParisianPercent(claimedLevel);
      }
      const finalized = finalizeProfile({
        ...parsed,
        gender,
        claimedLevel,
        assessedLevel: normalizeLevel(parsed.assessedLevel),
        parisianPercent,
        sampleCount,
        name,
      });
      // Heal profiles saved when only level was required (stale onboardingComplete flag).
      if (parsed.onboardingComplete && !finalized.onboardingComplete) {
        saveLearnerProfile(finalized);
      }
      return finalized;
    }
  } catch {}

  const legacy = migrateLegacyProfile();
  if (legacy) {
    saveLearnerProfile(legacy);
    return legacy;
  }
  return { ...DEFAULT_PROFILE };
}

export function isProfileSetupComplete(profile) {
  const hasLevel = !!profile?.claimedLevel;
  const hasGoogle = profile?.authMethod === 'google' && !!profile?.name?.trim();
  const hasEmail = profile?.authMethod === 'email'
    && !!String(profile?.email || '').trim()
    && !!profile?.name?.trim();
  return hasLevel && (hasGoogle || hasEmail);
}

export function needsWelcomeOnboarding(profile) {
  return !isProfileSetupComplete(profile);
}

/** Clear onboarding choices so the welcome modal can run again. */
export function resetWelcomeOnboarding(profile) {
  return saveLearnerProfile({
    ...profile,
    name: '',
    email: '',
    authMethod: null,
    gender: null,
    claimedLevel: null,
    parisianPercent: 0,
  });
}

function finalizeProfile(profile) {
  const normalized = {
    ...DEFAULT_PROFILE,
    ...profile,
    gender: normalizeLearnerGender(profile.gender),
    claimedLevel: normalizeLevel(profile.claimedLevel),
    assessedLevel: normalizeLevel(profile.assessedLevel),
    parisianPercent: Math.max(0, Math.min(100, Number(profile.parisianPercent) || 0)),
    sampleCount: Math.max(0, Number(profile.sampleCount) || 0),
    name: String(profile.name || '').trim().slice(0, 48),
    email: String(profile.email || '').trim().slice(0, 120),
    authMethod: profile.authMethod === 'google' || profile.authMethod === 'email'
      ? profile.authMethod
      : null,
  };
  return {
    ...normalized,
    onboardingComplete: isProfileSetupComplete(normalized),
  };
}

export function saveLearnerProfile(profile) {
  const next = {
    ...finalizeProfile(profile),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    if (next.gender) localStorage.setItem(LEGACY_GENDER_KEY, next.gender);
    localStorage.setItem(LEGACY_PERCENT_KEY, String(next.parisianPercent));
  } catch {}
  return next;
}

export function getEffectiveLevel(profile) {
  return profile?.assessedLevel || profile?.claimedLevel || 'A2';
}

export function mergeAssessedLevel(currentLevel, newLevel, sampleCount) {
  const next = normalizeLevel(newLevel);
  if (!next) return normalizeLevel(currentLevel);
  const current = normalizeLevel(currentLevel);
  if (!current || sampleCount <= 1) return next;

  const currentIdx = LEVEL_INDEX[current] ?? 2;
  const nextIdx = LEVEL_INDEX[next] ?? 2;
  const weight = Math.min(0.45, 0.12 + sampleCount * 0.04);
  const blended = currentIdx * (1 - weight) + nextIdx * weight;
  const rounded = Math.round(blended);
  return CEFR_LEVELS[Math.max(0, Math.min(CEFR_LEVELS.length - 1, rounded))];
}

const PARISIAN_BUMP = { A1: 2, A2: 4, B1: 6, B2: 8, C1: 10, C2: 12 };

/** Starting Parisian % from self-assessed CEFR level at onboarding. */
export function getInitialParisianPercent(level) {
  const map = { A1: 6, A2: 14, B1: 28, B2: 42, C1: 58, C2: 74 };
  return map[normalizeLevel(level)] ?? 6;
}

export function bumpParisianPercent(currentPercent, assessedLevel) {
  const bump = PARISIAN_BUMP[assessedLevel] || 3;
  return Math.min(100, (Number(currentPercent) || 0) + bump);
}

export function gainParisianExperience(profile, amount = 1) {
  const bump = Math.max(0, Number(amount) || 0);
  return saveLearnerProfile({
    ...profile,
    parisianPercent: Math.min(100, (Number(profile.parisianPercent) || 0) + bump),
  });
}

export function applySampleAssessment(profile, { level, strength, weakness, learnerGender }) {
  const assessedLevel = mergeAssessedLevel(
    profile.assessedLevel || profile.claimedLevel,
    level,
    profile.sampleCount + 1,
  );
  const sampleCount = profile.sampleCount + 1;
  const parisianPercent = bumpParisianPercent(profile.parisianPercent, assessedLevel || level);
  const gender = normalizeLearnerGender(learnerGender) || profile.gender;

  return saveLearnerProfile({
    ...profile,
    assessedLevel,
    sampleCount,
    parisianPercent,
    gender,
    lastStrength: strength || profile.lastStrength,
    lastWeakness: weakness || profile.lastWeakness,
  });
}

export function applyInterviewReport(profile, report, claimedLevel) {
  const assessedLevel = normalizeLevel(report?.overallLevel) || profile.assessedLevel;
  const parisianPercent = report?.parisianPercent != null
    ? Math.max(0, Math.min(100, Math.round(report.parisianPercent)))
    : profile.parisianPercent;
  const gender = normalizeLearnerGender(report?.learnerGender) || profile.gender;

  return saveLearnerProfile({
    ...profile,
    claimedLevel: normalizeLevel(claimedLevel) || profile.claimedLevel,
    assessedLevel,
    parisianPercent,
    gender,
    sampleCount: Math.max(profile.sampleCount, 5),
  });
}

const LEVEL_BADGE_ASSETS = new Set(['a1', 'a2', 'b1', 'b2', 'c1']);

/** Public badge PNG for a CEFR level (`/badge-a1.png`, etc.). C2 maps to C1 asset. */
export function getLevelBadgeSrc(level) {
  const id = normalizeLevel(level).toLowerCase();
  const file = LEVEL_BADGE_ASSETS.has(id) ? id : 'c1';
  return `/badge-${file}.png`;
}

// Legacy exports used by ParisianCornerBadge
export function getStoredLearnerGender() {
  return loadLearnerProfile().gender;
}

export function setStoredLearnerGender(gender) {
  const profile = loadLearnerProfile();
  return saveLearnerProfile({ ...profile, gender: normalizeLearnerGender(gender) }).gender;
}

export function getStoredParisianPercent() {
  return loadLearnerProfile().parisianPercent;
}

export function setStoredParisianPercent(percent) {
  const profile = loadLearnerProfile();
  return saveLearnerProfile({ ...profile, parisianPercent: percent }).parisianPercent;
}
