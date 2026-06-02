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

/** Review from whoever asked the question — oral or written answer. */
export function getAskerPerformanceLine(store, questionId, askerId, hasMistake, inputMode = 'speak') {
  const entry = store?.[questionId];
  const variant = hasMistake ? 'judgment' : 'congratulations';

  if (inputMode === 'write') {
    const writeDedicated = entry?.askerPerformanceWrite?.[variant];
    if (writeDedicated?.text) {
      return { narrator: askerId, text: writeDedicated.text, translation: writeDedicated.translation };
    }
    const writeFallback = hasMistake ? FALLBACK_ASKER_WRITE_JUDGMENT : FALLBACK_ASKER_WRITE_CONGRATULATIONS;
    return { narrator: askerId, ...writeFallback[askerId === 'jules' ? 'jules' : 'lea'] };
  }

  const dedicated = entry?.askerPerformance?.[variant];
  if (dedicated?.text) {
    return { narrator: askerId, text: dedicated.text, translation: dedicated.translation };
  }

  const fromPool = getQuestionFeedbackLines(store, questionId, hasMistake)
    .find((line) => line.narrator === askerId);
  if (fromPool) return fromPool;

  const fallback = hasMistake ? FALLBACK_ASKER_JUDGMENT : FALLBACK_ASKER_CONGRATULATIONS;
  return { narrator: askerId, ...fallback[askerId === 'jules' ? 'jules' : 'lea'] };
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

const FALLBACK_ASKER_JUDGMENT = {
  lea: {
    text: "On t'a compris à l'oral, mais il manque encore le ton parisien.",
    translation: 'We understood you when you spoke, but the Parisian tone is still missing.',
  },
  jules: {
    text: "T'as parlé clairement, mais ça sonne pas encore comme chez nous.",
    translation: 'You spoke clearly, but it doesn\'t sound like us yet.',
  },
};

const FALLBACK_ASKER_CONGRATULATIONS = {
  lea: {
    text: "À l'oral, c'est fluide — t'as une belle aisance, continue.",
    translation: 'When you speak, it\'s fluent — you sound at ease, keep going.',
  },
  jules: {
    text: "Bien joué à l'oral : naturel, on t'a suivi sans problème.",
    translation: 'Well done speaking: natural, we followed you with no trouble.',
  },
};

const FALLBACK_ASKER_WRITE_JUDGMENT = {
  lea: {
    text: "À l'écrit on t'a compris, mais il manque encore le ton parisien.",
    translation: 'In writing we understood you, but the Parisian tone is still missing.',
  },
  jules: {
    text: "C'est clair sur le papier, mais la forme sonne pas encore comme chez nous.",
    translation: "It's clear on the page, but the phrasing doesn't sound like us yet.",
  },
};

const FALLBACK_ASKER_WRITE_CONGRATULATIONS = {
  lea: {
    text: "Bien écrit — c'est fluide, naturel, on te lit sans effort.",
    translation: 'Well written — it\'s fluent and natural, we read you effortlessly.',
  },
  jules: {
    text: "Nickel à l'écrit : propre, parisien, rien à redire.",
    translation: 'Nice in writing: clean, Parisian, nothing to fix.',
  },
};
