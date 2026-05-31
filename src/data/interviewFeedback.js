/** Default feedback lines — seeded into data/interview-feedback.json for all users. */
import defaultFeedback from '../../data/interview-feedback.json';

export const DEFAULT_INTERVIEW_FEEDBACK = defaultFeedback;

export function mergeInterviewFeedback(stored = {}) {
  return { ...DEFAULT_INTERVIEW_FEEDBACK, ...stored };
}

export function getQuestionFeedbackLines(store, questionId, hasMistake) {
  const entry = store?.[questionId];
  const key = hasMistake ? 'judgment' : 'congratulations';
  const lines = entry?.[key];
  if (Array.isArray(lines) && lines.length > 0) return lines;
  return hasMistake ? FALLBACK_JUDGMENT : FALLBACK_CONGRATULATIONS;
}

const FALLBACK_JUDGMENT = [
  {
    narrator: 'lea',
    text: "Bon, y a des trucs à ajuster pour sonner parisien.",
    translation: 'OK, a few things to tweak to sound Parisian.',
  },
  {
    narrator: 'jules',
    text: "On te montre la version qu'on utiliserait ici.",
    translation: "We'll show you the version we'd use here.",
  },
];

const FALLBACK_CONGRATULATIONS = [
  {
    narrator: 'jules',
    text: "Nickel, là c'est propre. Rien à redire.",
    translation: 'Nice, that\'s clean. Nothing to fix.',
  },
  {
    narrator: 'lea',
    text: "Continue comme ça, t'es sur la bonne voie.",
    translation: 'Keep it up, you\'re on the right track.',
  },
];
