import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpeechmaticsTranscription } from '../hooks/useSpeechmaticsTranscription';
import { NARRATORS, normalizeNarratorId, useNarratorDialogue } from '../lib/narratorAudio';
import { HighlightedSpeech } from '../lib/HighlightedSpeech';
import { NarratorHoverText } from '../lib/NarratorHoverText';
import {
  lookupNarratorTranslation,
  registerNarratorLineTranslations,
  resolveNarratorTranslation,
} from '../lib/narratorTranslations';
import { getAskerPerformanceLine, mergeInterviewFeedback } from '../data/interviewFeedback';
import {
  buildCorrectionNarrationText,
  extractCorrectedFromRaw,
  isStrictCorrectionMatch,
  matchesCorrectionTarget,
  prepareCorrectionForDisplay,
  splitCorrectionParagraphs,
} from '../lib/correctionFormat';
import { DiffText } from '../lib/DiffText';
import { registerCorrectionKeyterms } from '../lib/deepgramKeyterms';
import { detectLearnerGenderFromFrench, normalizeLearnerGender } from '../lib/learnerGender';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getEffectiveLevel } from '../lib/learnerProfile';
import { Logo } from './atoms';
import { joinTranscriptSegments, segmentNeedsLeadingSpace } from '../lib/transcriptJoin';

const PARISIAN_MASCOTS = {
  woman: '/assets/parisian-woman.png',
  man: '/assets/parisian-man.png',
};

/** Shown on a fully correct answer; profile bar gains CORRECT_ANSWER_PERCENT_BUMP. */
const CORRECT_ANSWER_PARISIAN_PTS = 2;
const CORRECT_ANSWER_PERCENT_BUMP = 5;

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Pause after level pick so scroll + layout settle before TTS */
const INTRO_AUDIO_DELAY_MS = 1600;

/** Keep mic open briefly after stop so Deepgram can finalize the last words */
const RECORDING_STOP_GRACE_MS = 900;
const RECORDING_STOP_SETTLE_MS = 150;

const MIN_ANSWER_LINES = 3;

function countAnswerLines(text, utteranceCount = 0) {
  const trimmed = text?.trim() || '';
  if (!trimmed && utteranceCount === 0) return 0;

  const byNewline = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bySentence = trimmed
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return Math.max(byNewline.length, bySentence.length, utteranceCount);
}

function hasMinimumAnswerLines(text, utteranceCount = 0) {
  return countAnswerLines(text, utteranceCount) >= MIN_ANSWER_LINES;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scriptLine(narrator, text, translation) {
  return { narrator: normalizeNarratorId(narrator), text, translation };
}

const INTRO_QUESTIONS = [
  {
    id: 'name',
    narrator: 'lea',
    question: "Comment tu t'appelles ? Présente-toi un peu.",
    translation: "What's your name? Introduce yourself a little.",
  },
  {
    id: 'origin',
    narrator: 'jules',
    question: "Tu viens d'où ? C'est comment chez toi ?",
    translation: 'Where are you from? What\'s it like back home?',
  },
  {
    id: 'work',
    narrator: 'lea',
    question: "Tu fais quoi dans la vie, au quotidien ?",
    translation: 'What do you do in life, day to day?',
  },
];

function formatQuestionCounter(step, total = INTRO_QUESTIONS.length) {
  return `Question ${step}/${total}`;
}

function QuestionProgressBadge({ step, total = INTRO_QUESTIONS.length, className = '', align = 'left', overlay = false, compact = false }) {
  const pill = (
    <div className={`inline-flex items-center rounded-full border border-line/70 bg-paper ${
      compact ? 'gap-2 pl-2.5 pr-3 py-1' : 'gap-2.5 pl-3 pr-3.5 py-1.5'
    }`}>
      <span className={`tracking-[0.22em] uppercase text-wine font-semibold leading-none ${
        compact ? 'text-[8px]' : 'text-[9px]'
      }`}>
        Question
      </span>
      <span className={`font-display text-wine tabular-nums leading-none ${
        compact ? 'text-[14px] sm:text-[15px]' : 'text-[16px] sm:text-[17px]'
      }`}>
        <span className="font-semibold">{step}</span>
        <span className="text-wine/35 font-normal">/</span>
        <span className="text-wine/75">{total}</span>
      </span>
    </div>
  );

  if (overlay) {
    return (
      <div
        className={`shrink-0 ${className}`.trim()}
        aria-label={formatQuestionCounter(step, total)}
      >
        {pill}
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 pointer-events-none ${align === 'left' ? 'justify-start' : 'justify-center'} ${className}`.trim()}
      aria-label={formatQuestionCounter(step, total)}
    >
      {pill}
    </div>
  );
}

const DEV_SKIP_ANSWERS = {
  A1: [
    "Bonjour, je m'appelle Marie. J'ai vingt-cinq ans. Je suis contente, je viens d'Espagne.",
    "Je viens de Madrid. C'est une grande ville, il fait chaud et les gens sont sympas.",
    "Je suis étudiante. Je vais à l'université le matin et je travaille dans un café le week-end.",
    "J'apprends le français parce que j'aime la France. Je veux parler comme les Parisiens, pas seulement à l'école.",
    "Le matin je me lève à sept heures. Je prends le petit-déjeuner, je vais en cours, et le soir je regarde la télé avec ma coloc.",
  ],
  A2: [
    "Salut, moi c'est Marie, j'ai vingt-six ans. Je suis contente d'être ici, je parle français depuis un an et demi.",
    "Je viens de Lisbonne, au Portugal. C'est une ville ensoleillée près de la mer, la bouffe est excellente et la vie n'est pas trop chère.",
    "Je suis barista dans un café du centre. Je commence tôt, je fais des lattes toute la matinée, et l'après-midi je fais parfois des courses pour le boss.",
    "J'apprends le français parce que mon mec est parisien et je veux suivre quand sa famille parle vite. Je veux le vrai français de rue, pas le français des manuels.",
    "En général je me lève vers sept heures et demie, je prends un café, je vais au boulot. Le soir je dîne avec des amis ou j'appelle ma mère avant de dormir vers onze heures.",
  ],
  B1: [
    "Salut, je m'appelle Marie. J'ai vingt-sept ans et je suis contente d'être là. Je parle français depuis deux ans, mais je sais que j'ai encore un accent.",
    "Je viens de Barcelone, en Espagne. C'est une ville dynamique, il y a beaucoup de soleil et la vie est assez relax, même si parfois c'est un peu bruyant.",
    "Je travaille comme designer graphique, en remote la plupart du temps. Le matin je bois mon café, je réponds aux mails, et l'après-midi je crée des logos pour des start-ups.",
    "J'apprends le français parce que mon copain est parisien et je veux me sentir à l'aise avec sa famille. Je veux parler comme à Paris, avec les vraies expressions, pas comme dans les cours.",
    "Le matin je me lève vers huit heures, je fais du yoga, puis je m'installe devant mon ordi. Le soir j'aime bien dîner avec des amis dans le 11ème, ou regarder une série avant de dormir vers minuit.",
  ],
  B2: [
    "Bonjour, moi c'est Marie, j'ai vingt-huit ans. Je suis contente de passer ce test — j'habite à Paris depuis dix-huit mois mais je sens que je parle encore un peu comme une manuelle.",
    "Je viens de Milan, en Italie. C'est une ville où tout va vite, les gens gesticulent beaucoup, et la bouffe est incroyable. Paris me manquait le soleil au début, mais j'adore l'énergie ici.",
    "Je suis product manager dans une start-up tech près de République. Mon quotidien c'est beaucoup de réunions, des specs à rédiger, et essayer de calmer les devs quand une release part en vrille.",
    "Franchement j'apprends le français parce que je veux m'intégrer pour de vrai — pas juste survivre au boulot. Parler parisien, c'est avoir accès à l'humour, aux sous-entendus, à la vraie vie sociale.",
    "Typiquement je me lève vers sept heures trente, je commande un flat white au café du coin, je boucle avant dix heures. Le soir je retrouve des potes pour un verre, ou je flâne le long du canal avant de rentrer vers une heure du mat'.",
  ],
  C1: [
    "Salut, je m'appelle Marie, j'ai trente ans. Je suis ravie d'être là — ça fait trois ans que je vis à Paris et je me dis que mon français est presque crédible, mais il me manque encore des automatismes parisiens.",
    "Je suis née à Séville, mais j'ai grandi entre Madrid et Barcelone. J'ai toujours aimé les villes où la culture se mélange aux terrasses — Paris, pour moi, c'est un peu ça, en plus exigeant.",
    "Je dirige une petite agence de branding dans le 10ème. Entre les briefs clients, les recrues à coacher et les deadlines impossibles, ma journée ressemble à un sprint permanent, mais j'adore ça.",
    "Si j'affine mon français parisien, c'est parce que je refuse de rester la consultante étrangère polie. Je veux le registre des dîners entre potes, les blagues qui passent, le français qui sonne vraiment local.",
    "Le matin je me lève tôt, je lis les actus en français, je prends le métro ligne 9 en évitant l'heure de pointe. Le soir, soit j'enchaîne un apéro qui finit tard, soit je rentre épuisée avec une bière du frigo et une série en VO.",
  ],
};

function buildDevSkipInterviewData(levelId, existingAnswers = [], existingAssessments = []) {
  const templates = DEV_SKIP_ANSWERS[levelId] || DEV_SKIP_ANSWERS.B1;

  const answers = INTRO_QUESTIONS.map((_, i) => {
    const existing = existingAnswers[i]?.trim();
    return existing || templates[i];
  });

  const assessments = INTRO_QUESTIONS.map((_, i) => existingAssessments[i] || levelId);

  return { answers, assessments };
}

function buildIntroScript() {
  return [
    scriptLine(
      'lea',
      "Salut — trois questions perso pour voir si ton français est assez parisien.",
      'Hi — three personal questions to see if your French is Parisian enough.',
    ),
    scriptLine(
      'jules',
      "Réponds en français, naturellement ; après chaque réponse, on te dit où tu en es.",
      'Answer in French, naturally; after each answer, we tell you where you stand.',
    ),
  ];
}

function normalizeForCompare(text) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function assessAnswer(text, learnerLevel) {
  try {
    const res = await fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, assessOnly: true, learnerLevel }),
    });
    const data = await res.json();
    return data.level || null;
  } catch {
    return null;
  }
}

async function fetchCorrection(text, learnerLevel) {
  try {
    const res = await fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, register: 'Parisien', learnerLevel }),
    });
    const data = await res.json();
    const raw = data.corrected?.trim() || text.trim();
    const extracted = extractCorrectedFromRaw(raw, text.trim());
    const display = prepareCorrectionForDisplay(text, extracted);
    registerCorrectionKeyterms(text, display);
    return {
      corrected: display,
      translation: data.translation?.trim() || null,
    };
  } catch {
    return { corrected: text.trim(), translation: null };
  }
}

function getCorrectionReader(questionIndex) {
  return questionIndex % 2 === 0 ? 'lea' : 'jules';
}

function buildCorrectionPlayLine(original, corrected, questionIndex) {
  const orig = original.trim();
  const corr = (corrected || orig).trim();
  if (normalizeForCompare(orig) === normalizeForCompare(corr)) {
    return scriptLine('lea', "Grammaticalement, celle-là elle passe. Rien à redire.", 'Grammar-wise, that one works. Nothing to fix.');
  }
  return scriptLine(
    getCorrectionReader(questionIndex),
    buildCorrectionNarrationText(orig, corr),
    'The Parisian correction.',
  );
}

function buildAskerCorrectionLine(original, corrected, askerId = 'lea') {
  const orig = original.trim();
  const corr = (corrected || orig).trim();
  if (normalizeForCompare(orig) === normalizeForCompare(corr)) {
    return scriptLine(
      askerId,
      "Franchement, celle-là elle passe. Rien à changer.",
      'Honestly, that one works. Nothing to change.',
    );
  }
  return scriptLine(
    askerId,
    buildCorrectionNarrationText(orig, corr),
    'The Parisian correction.',
  );
}

function buildAskerCorrectionReadLine(original, corrected, askerId = 'lea') {
  const orig = original.trim();
  const corr = (corrected || orig).trim();
  if (normalizeForCompare(orig) === normalizeForCompare(corr)) {
    return scriptLine(
      askerId,
      "Franchement, c'est déjà bon. On change rien.",
      'Honestly, it is already good. No change.',
    );
  }
  return scriptLine(askerId, corr, null);
}

function hasParisianMistake(original, corrected) {
  const orig = String(original || '').trim();
  const corr = String(corrected || '').trim();
  if (!corr || isStrictCorrectionMatch(orig, corr)) return false;
  if (matchesCorrectionTarget(orig, corr)) return false;
  return true;
}

function AnswerSuccessBadge({ points = CORRECT_ANSWER_PARISIAN_PTS, compact = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 ml-2 align-middle whitespace-nowrap">
      <svg
        width={compact ? 16 : 18}
        height={compact ? 16 : 18}
        viewBox="0 0 48 48"
        fill="none"
        stroke="#16a34a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden
      >
        <path d="M42 12L18 36l-12-12" />
      </svg>
      <span className="parisian-exp-bump inline-flex items-center justify-center rounded-full border border-green-600/20 bg-green-600/[0.06] px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] leading-none text-green-700 tabular-nums">
        +{points} pts Parisian
      </span>
    </span>
  );
}

function linesFromFeedback(rawLines) {
  return rawLines.map((line) => scriptLine(line.narrator, line.text, line.translation));
}

function getSpeakText(utterances, settledText, partialTranscript) {
  return joinTranscriptSegments(
    utterances.map((u) => u.text).join(' '),
    settledText,
    partialTranscript,
  );
}

function computeFinalLevel(levelId, assessments) {
  const levels = assessments.filter(Boolean);
  const avgIdx = levels.length
    ? Math.round(levels.reduce((s, l) => s + LEVEL_ORDER.indexOf(l), 0) / levels.length)
    : LEVEL_ORDER.indexOf('A2');
  return LEVEL_ORDER[Math.min(avgIdx, LEVEL_ORDER.length - 1)] || levelId || 'A2';
}

/** One sentence each — played at the end before the rating card. */
function buildFinalVerdictLines(levelId, assessments) {
  const finalLevel = computeFinalLevel(levelId, assessments);
  const claimedIdx = LEVEL_ORDER.indexOf(levelId);
  const assessedIdx = LEVEL_ORDER.indexOf(finalLevel);

  if (assessedIdx >= claimedIdx) {
    return [
      scriptLine(
        'lea',
        `Bon. On te situe plutôt ${finalLevel}.`,
        `OK. We place you around ${finalLevel}.`,
      ),
      scriptLine(
        'jules',
        levelId === finalLevel
          ? "T'avais visé juste. Rare, ça."
          : `Honnêtement, ${finalLevel} — c'est plus crédible.`,
        levelId === finalLevel
          ? 'You aimed right. That\'s rare.'
          : `Honestly, ${finalLevel} — that's more believable.`,
      ),
    ];
  }

  return [
    scriptLine(
      'jules',
      `On est plutôt ${finalLevel}, clairement.`,
      `We're seeing ${finalLevel}, clearly.`,
    ),
    scriptLine(
      'lea',
      'Au moins maintenant tu sais où tu en es.',
      'At least now you know where you stand.',
    ),
  ];
}

function getVerdictMood(claimedLevel, assessedLevel, overallScore = 50) {
  const claimedIdx = LEVEL_ORDER.indexOf(claimedLevel);
  const assessedIdx = LEVEL_ORDER.indexOf(assessedLevel);
  if (assessedIdx >= claimedIdx || clampScore(overallScore) >= 58) return 'Pas mal !';
  return 'Pas ouf..';
}

const VERDICT_TRAIT_COUNT = 4;

/** Min score (inclusive) for each CEFR band on a trait gauge. */
const TRAIT_LEVEL_MIN_SCORE = [0, 17, 34, 51, 67, 84];

const INTERVIEW_TRAIT_LABELS = [
  'Grammar accuracy',
  'Vocabulary Variety',
  'Parisian style',
  'Conjugation skills',
  'Accent & pronunciation',
  'Flow and rhythm',
  'Listening skills',
  'Cultural Understanding',
];

const TRAIT_HINTS = {
  'Grammar accuracy': 'Verb forms, agreements, tenses',
  'Vocabulary Variety': 'Range and precision of word choice',
  'Parisian style': 'Local register vs textbook French',
  'Conjugation skills': 'Verb forms in context',
  'Accent & pronunciation': 'How natural you sound',
  'Flow and rhythm': 'Pace and continuity when you speak',
  'Listening skills': 'Following spoken French',
  'Cultural Understanding': 'References, tone, and local context',
};

const STRENGTH_TRAIT_FALLBACK = [
  'Vocabulary Variety',
  'Accent & pronunciation',
  'Flow and rhythm',
  'Listening skills',
];

const WEAKNESS_TRAIT_FALLBACK = [
  'Grammar accuracy',
  'Parisian style',
  'Conjugation skills',
  'Cultural Understanding',
];

function getTraitLevelFromScore(score) {
  const s = clampScore(score);
  for (let i = LEVEL_ORDER.length - 1; i >= 0; i--) {
    if (s >= TRAIT_LEVEL_MIN_SCORE[i]) return LEVEL_ORDER[i];
  }
  return 'A1';
}

function getTraitProgressToNextLevel(score) {
  const s = clampScore(score);
  const level = getTraitLevelFromScore(s);
  const idx = LEVEL_ORDER.indexOf(level);
  if (idx >= LEVEL_ORDER.length - 1) {
    return { level, nextLevel: null, percentToNext: 0, progressInBand: 1 };
  }
  const nextLevel = LEVEL_ORDER[idx + 1];
  const bandMin = TRAIT_LEVEL_MIN_SCORE[idx];
  const bandMax = TRAIT_LEVEL_MIN_SCORE[idx + 1];
  const progressInBand = Math.min(1, Math.max(0, (s - bandMin) / (bandMax - bandMin)));
  const percentToNext = Math.round((1 - progressInBand) * 100);
  return {
    level,
    nextLevel,
    percentToNext: Math.max(1, Math.min(99, percentToNext)),
    progressInBand,
  };
}

function padTraitsToCount(traits, count, fallbackLabels, defaultScore) {
  const out = (traits || [])
    .filter((t) => t?.label && INTERVIEW_TRAIT_LABELS.includes(t.label))
    .map((t) => ({
      label: t.label,
      hint: t.hint || TRAIT_HINTS[t.label] || '',
      score: clampScore(t.score, defaultScore),
    }));
  const used = new Set(out.map((t) => t.label));
  for (const label of fallbackLabels) {
    if (out.length >= count) break;
    if (used.has(label)) continue;
    used.add(label);
    out.push({
      label,
      hint: TRAIT_HINTS[label] || '',
      score: defaultScore,
    });
  }
  return out.slice(0, count);
}

function normalizeVerdictTraits(report) {
  return {
    ...report,
    strengths: padTraitsToCount(
      report.strengths,
      VERDICT_TRAIT_COUNT,
      STRENGTH_TRAIT_FALLBACK,
      clampScore((report.overallScore ?? 55) + 12, 72),
    ),
    weaknesses: padTraitsToCount(
      report.weaknesses,
      VERDICT_TRAIT_COUNT,
      WEAKNESS_TRAIT_FALLBACK,
      clampScore((report.overallScore ?? 55) - 14, 42),
    ),
  };
}

function enrichReportForVerdict(report, claimedLevel, assessments) {
  const lines = buildFinalVerdictLines(claimedLevel, assessments);
  const lea = lines.find((l) => l.narrator === 'lea');
  const jules = lines.find((l) => l.narrator === 'jules');
  return normalizeVerdictTraits({
    ...report,
    summary: null,
    verdictMood: getVerdictMood(claimedLevel, report.overallLevel, report.overallScore),
    leaVerdict: lea?.text ?? '',
    julesVerdict: jules?.text ?? '',
    leaVerdictTranslation: lea?.translation ?? null,
    julesVerdictTranslation: jules?.translation ?? null,
  });
}

/** Admin skip — lands on this rating preview (temporary). */
const ADMIN_SKIP_VERDICT_REPORT = {
  overallLevel: 'B1',
  overallScore: 68,
  parisianPercent: 74,
  learnerGender: 'woman',
  verdictMood: 'Pas mal !',
  leaVerdict: 'Bon. On te situe plutôt B1.',
  julesVerdict: "T'avais visé juste. Rare, ça.",
  leaVerdictTranslation: 'OK. We place you around B1.',
  julesVerdictTranslation: 'You aimed right. That\'s rare.',
  strengths: [
    { label: 'Vocabulary Variety', hint: 'Range and precision of word choice', score: 82 },
    { label: 'Accent & pronunciation', hint: 'How natural you sound', score: 76 },
    { label: 'Flow and rhythm', hint: 'Pace and continuity when you speak', score: 74 },
    { label: 'Listening skills', hint: 'Following spoken French', score: 70 },
  ],
  weaknesses: [
    { label: 'Grammar accuracy', hint: 'Verb forms, agreements, tenses', score: 44 },
    { label: 'Parisian style', hint: 'Local register vs textbook French', score: 46 },
    { label: 'Conjugation skills', hint: 'Verb forms in context', score: 48 },
    { label: 'Cultural Understanding', hint: 'References, tone, and local context', score: 40 },
  ],
};

function clampScore(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildFallbackSummary(strengths, weaknesses, overallLevel) {
  const strengthPhrase = {
    'Vocabulary Variety': 'the range of words you use',
    'Accent & pronunciation': 'your accent — it sounds natural',
    'Flow and rhythm': 'how smoothly you speak',
    'Listening skills': 'how you follow spoken French',
    'Conjugation skills': 'your verb forms in context',
    'Cultural Understanding': 'how you pick up cultural nuance',
  };
  const weaknessPhrase = {
    'Grammar accuracy': 'your grammar slips sometimes',
    'Parisian style': 'you still sound textbook rather than Parisian',
    'Conjugation skills': 'verb forms still need work',
    'Cultural Understanding': 'local references still feel thin',
  };

  const s0 = strengthPhrase[strengths[0]?.label] || 'speaking';
  const s1 = strengthPhrase[strengths[1]?.label] || 'your accent sounds nice';
  const w0 = weaknessPhrase[weaknesses[0]?.label] || 'a few Parisian habits are missing';
  const w1 = weaknessPhrase[weaknesses[1]?.label];

  let text = `You're good at ${s0}, and ${s1}. But ${w0}`;
  if (w1) text += `, and ${w1}`;
  text += `. Overall you're around ${overallLevel} level.`;
  return text;
}

function resolveLearnerGender(apiGender, answers) {
  return normalizeLearnerGender(apiGender)
    || detectLearnerGenderFromFrench(answers.filter(Boolean).join('\n\n'));
}

function buildFallbackReport(answers, assessments, levelId) {
  const overallLevel = computeFinalLevel(levelId, assessments);
  const baseScore = 42 + LEVEL_ORDER.indexOf(overallLevel) * 9;
  const answerBonus = Math.min(answers.length * 2, 8);
  const overallScore = clampScore(baseScore + answerBonus, 55);

  const strengths = STRENGTH_TRAIT_FALLBACK.map((label, i) => ({
    label,
    hint: TRAIT_HINTS[label],
    score: clampScore(overallScore + 14 - i * 2, 72),
  }));
  const weaknesses = WEAKNESS_TRAIT_FALLBACK.map((label, i) => ({
    label,
    hint: TRAIT_HINTS[label],
    score: clampScore(overallScore - 12 - i * 2, 42),
  }));

  return {
    overallLevel,
    overallScore,
    summary: buildFallbackSummary(strengths, weaknesses, overallLevel),
    parisianPercent: computeParisianPercent({ overallScore, strengths, weaknesses }),
    learnerGender: resolveLearnerGender(null, answers),
    strengths,
    weaknesses,
  };
}

async function fetchInterviewReport(answers, levelId, assessments) {
  const combined = answers.filter(Boolean).join('\n\n');
  if (!combined.trim()) return buildFallbackReport(answers, assessments, levelId);

  try {
    const res = await fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: combined,
          assessOnly: true,
          interviewReport: true,
          claimedLevel: levelId,
          learnerLevel: levelId,
        }),
    });
    const data = await res.json();
    const strengths = (data.strengths || []).map((t) => ({
      label: t.label || 'Strength',
      hint: t.hint || '',
      score: clampScore(t.score, 70),
    }));
    const weaknesses = (data.weaknesses || []).map((t) => ({
      label: t.label || 'Area to improve',
      hint: t.hint || '',
      score: clampScore(t.score, 45),
    }));

    if (!strengths.length && !weaknesses.length) {
      return buildFallbackReport(answers, assessments, levelId);
    }

    const fallback = buildFallbackReport(answers, assessments, levelId);

    const report = {
      overallLevel: data.overallLevel || computeFinalLevel(levelId, assessments),
      overallScore: clampScore(data.overallScore, 55),
      summary: data.summary?.trim() || buildFallbackSummary(
        strengths.length ? strengths : fallback.strengths,
        weaknesses.length ? weaknesses : fallback.weaknesses,
        data.overallLevel || fallback.overallLevel,
      ),
      learnerGender: resolveLearnerGender(data.learnerGender, answers),
      strengths: strengths.length ? strengths : fallback.strengths,
      weaknesses: weaknesses.length ? weaknesses : fallback.weaknesses,
    };
    report.parisianPercent = computeParisianPercent(report);
    return enrichReportForVerdict(report, levelId, assessments);
  } catch {
    return enrichReportForVerdict(buildFallbackReport(answers, assessments, levelId), levelId, assessments);
  }
}

function computeParisianPercent(report) {
  const parisianLabels = ['Parisian style', 'Flow and rhythm', 'Cultural Understanding', 'Accent & pronunciation'];
  const traits = [
    ...(report.strengths || []).filter((t) => parisianLabels.includes(t.label)),
    ...(report.weaknesses || []).filter((t) => parisianLabels.includes(t.label)),
  ];
  if (!traits.length) return clampScore(report.overallScore, 50);
  const avgTrait = traits.reduce((sum, t) => sum + t.score, 0) / traits.length;
  return clampScore(Math.round(avgTrait * 0.6 + report.overallScore * 0.4), report.overallScore);
}

function computeClaimVerdict(claimedLevel, assessedLevel) {
  return {
    agree: claimedLevel === assessedLevel,
    level: assessedLevel,
    claimedLevel,
  };
}

function buildLearnPathUrl(mode, levelId) {
  if (mode === 'discover') return '/?learn=discover#nativa-demo';
  return `/?learn=${mode}&level=${encodeURIComponent(levelId)}#nativa-demo`;
}

const TRAIT_IMPROVE_MODE = {
  'Grammar accuracy': 'vocab',
  'Vocabulary Variety': 'vocab',
  'Parisian style': 'discover',
  'Conjugation skills': 'vocab',
  'Accent & pronunciation': 'speak',
  'Flow and rhythm': 'speak',
  'Listening skills': 'speak',
  'Cultural Understanding': 'discover',
};

function CircledLevel({ level, size = 'sm', compact = false }) {
  const sizeClass = size === 'lg'
    ? compact
      ? 'w-[4.25rem] h-[4.25rem] sm:w-[4.75rem] sm:h-[4.75rem] text-[1.65rem] sm:text-[1.8rem] text-navy'
      : 'w-[4.75rem] h-[4.75rem] sm:w-[5.25rem] sm:h-[5.25rem] text-[1.85rem] sm:text-[2rem] text-navy'
    : size === 'md'
      ? 'w-9 h-9 text-[13px] text-navy'
      : compact
        ? 'w-6 h-6 text-[9px] text-navy'
        : 'w-6 h-6 text-[10px] text-navy';
  const borderClass = size === 'lg' ? 'border-2 border-navy' : 'border border-navy/20';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-paper font-display font-semibold tabular-nums leading-none shrink-0 ${sizeClass} ${borderClass}`}
      aria-label={`Level ${level}`}
    >
      {level}
    </span>
  );
}

function TraitGaugeRow({ label, score, tone = 'neutral', compact = false }) {
  const barColor = tone === 'strength' ? 'bg-green-600' : tone === 'weakness' ? 'bg-wine' : 'bg-navy/60';
  const { level: traitLevel, nextLevel, progressInBand } = getTraitProgressToNextLevel(score);
  const improveMode = TRAIT_IMPROVE_MODE[label] || 'speak';
  const reachHref = nextLevel ? buildLearnPathUrl(improveMode, nextLevel) : null;
  const percentReached = Math.round(progressInBand * 100);
  const barFillWidth = nextLevel ? percentReached : 100;

  return (
    <div className="space-y-1.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`font-medium text-navy leading-snug ${compact ? 'text-[13px]' : 'text-[13px]'}`}>{label}</span>
          <CircledLevel level={traitLevel} size="sm" compact={compact} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`relative flex-1 min-w-0 rounded-full bg-navy/8 overflow-hidden ${compact ? 'h-3.5' : 'h-3.5 sm:h-4'}`}>
          {nextLevel ? (
            <div
              className={`absolute inset-y-0 left-0 flex items-center justify-end rounded-full px-2 transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.max(barFillWidth, percentReached > 0 ? 16 : 0)}%` }}
            >
              {percentReached > 0 ? (
                <span className="text-[10px] sm:text-[11px] font-semibold text-ivory tabular-nums leading-none">
                  {percentReached}%
                </span>
              ) : null}
            </div>
          ) : (
            <>
              <div className={`absolute inset-0 rounded-full ${barColor}`} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-semibold text-ivory tabular-nums leading-none">
                100%
              </span>
            </>
          )}
        </div>
        {nextLevel && reachHref ? (
          <a
            href={reachHref}
            className="text-[12px] font-display px-3 py-1.5 rounded-full border border-wine/25 text-wine/65 hover:bg-wine hover:text-ivory hover:border-wine hover:shadow-sm transition-all duration-200 shrink-0 whitespace-nowrap"
          >
            Reach {nextLevel}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function FrenchQuote({ text, translation, className, highlightSpeech, playbackTime, timings, speechText }) {
  const paragraphs = splitCorrectionParagraphs(text);

  if (highlightSpeech && speechText) {
    return (
      <NarratorHoverText
        text={text.replace(/\n\n+/g, ' ')}
        translation={translation}
        highlightSpeech
        speechPlaybackTime={playbackTime}
        speechTimings={timings}
        quote
        className={className}
        wrapperClassName="relative w-full min-w-0"
      />
    );
  }

  return (
    <NarratorHoverText
      text={paragraphs.join('\n\n')}
      translation={translation}
      quote
      className={className}
      wrapperClassName="relative w-full min-w-0"
    />
  );
}

function VerdictResultsTitle({ compact = false }) {
  return (
    <header className="text-center shrink-0 w-full">
      <h2
        className={`font-display leading-[1.06] tracking-[-0.02em] text-navy ${
          compact
            ? 'text-[clamp(1.85rem,3.8vw,2.35rem)]'
            : 'text-[clamp(2.25rem,4.5vw,3.25rem)]'
        }`}
      >
        Tes <span className="text-wine italic">résultats</span>
      </h2>
      <div className={`bg-wine mx-auto ${compact ? 'w-16 h-0.5 mt-1.5' : 'w-20 h-1 mt-2 sm:mt-2.5'}`} aria-hidden />
    </header>
  );
}

function VerdictNarratorColumn({
  narratorId,
  line,
  translation,
  compact,
  isSpeaking,
  isOtherSpeaking,
  onToggleReplay,
  replayDisabled,
  speechPlaybackTime,
  speechTimings,
  speechText,
}) {
  const n = NARRATORS[narratorId];
  const highlightLine = Boolean(
    isSpeaking
    && line
    && speechText
    && speechText === line,
  );

  return (
    <div
      className={`flex flex-col items-center text-center min-w-0 transition-all duration-500 ease-out ${
        compact ? 'gap-2.5' : 'gap-3'
      } ${isSpeaking ? 'z-20' : isOtherSpeaking ? 'z-0 opacity-45 scale-[0.97]' : 'z-10'}`}
    >
      <motion.div
        className="relative shrink-0 overflow-visible pt-4 sm:pt-5"
        animate={
          isSpeaking
            ? { scale: 1.1, y: -6 }
            : { scale: 1, y: 0 }
        }
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        style={{ transformOrigin: 'center bottom' }}
      >
        <div
          className={`rounded-full overflow-hidden transition-shadow duration-500 ${
            compact ? 'w-[6.75rem] h-[6.75rem] sm:w-[7.5rem] sm:h-[7.5rem]' : 'w-32 h-32 sm:w-36 sm:h-36'
          } ${
            isSpeaking
              ? 'ring-4 ring-wine shadow-[0_18px_36px_-10px_rgba(122,31,46,0.36)]'
              : 'ring-2 ring-wine/25'
          }`}
        >
          <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
        </div>
      </motion.div>
      <span className={`font-display text-navy/60 ${compact ? 'text-[15px] sm:text-[16px]' : 'text-[15px] sm:text-[16px]'}`}>{n.name}</span>
      {line ? (
        <div className="w-full flex justify-center px-1">
          <div className="inline-flex min-w-0 max-w-[min(100%,300px)] items-start gap-1.5">
            {!replayDisabled ? (
              <div className="flex shrink-0 items-center self-start -mt-2">
                <NarratorLinePlayButton
                  onClick={() => onToggleReplay?.(narratorId)}
                  label={`Replay ${n.name}`}
                  isPlaying={highlightLine}
                />
              </div>
            ) : null}
            <NarratorHoverText
              text={line}
              translation={translation}
              quote
              highlightSpeech={highlightLine}
              speechPlaybackTime={speechPlaybackTime}
              speechTimings={speechTimings}
              className={`font-display italic leading-[1.35] transition-colors ${
                compact ? 'text-[14px] sm:text-[15px]' : 'text-[14px] sm:text-[16px]'
              } ${isSpeaking ? 'text-wine' : 'text-navy/80'}`}
              wrapperClassName="relative min-w-0 flex-1 text-left"
              tooltipClassName="top-[calc(100%+6px)] text-[12px] z-[60]"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FrenchOpinionReport({
  report,
  loading,
  claimedLevel,
  compact = false,
  activeNarrator = null,
  playing = false,
  speechPlaybackTime,
  speechTimings,
  speechText,
  onToggleReplay,
  replayDisabled = false,
}) {
  if (loading) {
    return (
      <div className="w-full max-w-[560px] mx-auto rounded-2xl border border-line/60 bg-white/90 px-5 py-10 flex justify-center">
        <ProcessDots />
      </div>
    );
  }

  if (!report) return null;

  const level = report.overallLevel || claimedLevel || 'B1';
  const mood = report.verdictMood || getVerdictMood(claimedLevel, level, report.overallScore);
  const moodClass = mood === 'Pas mal !' ? 'text-wine' : 'text-navy/70';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[560px] mx-auto rounded-2xl border border-wine/15 bg-white/95 shadow-sm overflow-hidden text-left"
    >
      <div className={`border-b border-wine/10 bg-gradient-to-b from-ivory/50 to-paper/80 overflow-visible ${
        compact ? 'px-4 sm:px-6 py-4 sm:py-5' : 'px-4 sm:px-6 py-7 sm:py-8'
      }`}>
        <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end ${
          compact ? 'gap-3 sm:gap-4' : 'gap-4 sm:gap-6'
        }`}>
          <VerdictNarratorColumn
            narratorId="lea"
            line={report.leaVerdict}
            translation={report.leaVerdictTranslation}
            compact={compact}
            isSpeaking={playing && activeNarrator === 'lea'}
            isOtherSpeaking={playing && activeNarrator === 'jules'}
            onToggleReplay={onToggleReplay}
            replayDisabled={replayDisabled}
            speechPlaybackTime={speechPlaybackTime}
            speechTimings={speechTimings}
            speechText={speechText}
          />
          <div className={`flex flex-col items-center justify-center text-center shrink-0 self-center ${compact ? 'gap-1.5 px-0.5' : 'gap-2 px-1 sm:px-2'}`}>
            <CircledLevel level={level} size="lg" compact={compact} />
            <p className={`font-display italic leading-none ${moodClass} ${
              compact ? 'text-[18px] sm:text-[21px]' : 'text-[20px] sm:text-[24px]'
            }`}>
              {mood}
            </p>
          </div>
          <VerdictNarratorColumn
            narratorId="jules"
            line={report.julesVerdict}
            translation={report.julesVerdictTranslation}
            compact={compact}
            isSpeaking={playing && activeNarrator === 'jules'}
            isOtherSpeaking={playing && activeNarrator === 'lea'}
            onToggleReplay={onToggleReplay}
            replayDisabled={replayDisabled}
            speechPlaybackTime={speechPlaybackTime}
            speechTimings={speechTimings}
            speechText={speechText}
          />
        </div>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${
        compact ? 'gap-4 px-4 sm:px-6 py-4 sm:py-5' : 'gap-5 px-5 py-5'
      }`}>
        {report.strengths?.length > 0 ? (
          <div className="min-w-0">
            <p className={`text-[10px] tracking-[0.14em] uppercase text-green-700/80 font-semibold ${compact ? 'mb-2' : 'mb-3'}`}>
              Strengths
            </p>
            <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
              {report.strengths.map((t) => (
                <TraitGaugeRow
                  key={t.label}
                  label={t.label}
                  score={t.score}
                  tone="strength"
                  compact={compact}
                />
              ))}
            </div>
          </div>
        ) : null}

        {report.weaknesses?.length > 0 ? (
          <div className={`min-w-0 sm:border-l sm:border-wine/10 ${compact ? 'sm:pl-3.5' : 'sm:pl-5'}`}>
            <p className={`text-[10px] tracking-[0.14em] uppercase text-wine/80 font-semibold ${compact ? 'mb-2' : 'mb-3'}`}>
              Weaknesses
            </p>
            <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
              {report.weaknesses.map((t) => (
                <TraitGaugeRow
                  key={t.label}
                  label={t.label}
                  score={t.score}
                  tone="weakness"
                  compact={compact}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function CorrectionPanel({
  original,
  corrected,
  correctedTranslation,
  questionIndex,
  onPlay,
  playing,
  playDisabled,
  speechPlaybackTime,
  speechTimings,
  speechText,
}) {
  const displayCorrected = React.useMemo(
    () => prepareCorrectionForDisplay(original, corrected),
    [original, corrected],
  );
  const same = normalizeForCompare(original) === normalizeForCompare(displayCorrected);
  const reader = getCorrectionReader(questionIndex);
  const highlightSpeech = playing && speechText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 w-full rounded-xl bg-white border border-wine/15 overflow-hidden text-left shadow-sm"
    >
      <div className="px-3 py-2 bg-wine/5 border-b border-wine/10">
        <p className="text-[9px] tracking-[0.18em] uppercase text-wine font-semibold">
          {same ? 'Verdict' : 'Parisian correction'}
        </p>
      </div>
      <div className="px-3 py-3 space-y-2">
        {same ? (
          <div className="flex items-start gap-2.5">
            <NarratorHoverText
              text={highlightSpeech ? speechText : 'Rien à corriger, Léa valide celle-là.'}
              translation={
                highlightSpeech
                  ? lookupNarratorTranslation(speechText)
                  : 'Nothing to fix — Léa approves that one.'
              }
              highlightSpeech={highlightSpeech}
              speechPlaybackTime={speechPlaybackTime}
              speechTimings={speechTimings}
              quote={highlightSpeech}
              className="font-display text-[14px] text-navy/65 italic flex-1"
              wrapperClassName="relative flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={onPlay}
              disabled={playDisabled || playing}
              className="flex-shrink-0 w-9 h-9 rounded-full border border-wine/30 inline-flex items-center justify-center text-wine hover:bg-wine/5 transition-colors disabled:opacity-40"
              aria-label="Play verdict"
            >
              {playing ? (
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
                </svg>
              ) : (
                <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden>
                  <path d="M0 0 L11 6.5 L0 13 Z" fill="currentColor" opacity="0.75" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] text-navy/40 mb-0.5">You said</p>
              <p className="font-display text-[14px] text-navy/50 line-through decoration-wine/25 whitespace-pre-line">
                {original}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-wine/75 mb-0.5">Say it like this</p>
              <div className="flex items-start gap-2.5">
                <FrenchQuote
                  text={displayCorrected}
                  translation={correctedTranslation}
                  highlightSpeech={highlightSpeech}
                  playbackTime={speechPlaybackTime}
                  timings={speechTimings}
                  speechText={speechText}
                  className="font-display text-[15px] text-navy leading-snug italic flex-1 min-w-0 break-words"
                />
                <button
                  type="button"
                  onClick={onPlay}
                  disabled={playDisabled || playing}
                  className="flex-shrink-0 w-9 h-9 rounded-full border border-wine/30 inline-flex items-center justify-center text-wine hover:bg-wine/5 transition-colors disabled:opacity-40"
                  aria-label={`Play — ${NARRATORS[reader].name} reads it`}
                  title={`${NARRATORS[reader].name} reads it`}
                >
                  {playing ? (
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden>
                      <path d="M0 0 L11 6.5 L0 13 Z" fill="currentColor" opacity="0.75" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-navy/40">
                {NARRATORS[reader].name} can read it for you
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function ProcessDots({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-wine/45"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  );
}

function SpeakWriteToggle({ mode, onChange, disabled, compact = false, className = '' }) {
  return (
    <div className={`relative flex items-center rounded-full p-0.5 bg-navy/[0.06] w-fit shrink-0 ${className}`.trim()}>
      <div
        className="absolute top-0.5 bottom-0.5 rounded-full bg-wine transition-all duration-200"
        style={{
          width: 'calc((100% - 4px) / 2)',
          left: mode === 'write' ? 'calc(2px + (100% - 4px) / 2)' : '2px',
        }}
      />
      {[
        { id: 'speak', label: 'Speak' },
        { id: 'write', label: 'Write' },
      ].map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(m.id)}
          className={`relative z-10 font-display tracking-wide rounded-full capitalize transition-colors duration-200 disabled:opacity-40 ${
            compact ? 'text-[15px] px-3.5 py-1' : 'text-[16px] px-4 py-1.5'
          } ${mode === m.id ? 'text-ivory' : 'text-navy/45 hover:text-navy/70'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function questionLineTypography(question, translation) {
  const totalChars = question.length + (translation?.length || 0);
  if (totalChars > 100 || question.length > 58) {
    return 'text-[16px] sm:text-[17px] leading-[1.35]';
  }
  if (totalChars > 70 || question.length > 44) {
    return 'text-[17px] sm:text-[18px] leading-[1.35]';
  }
  return 'text-[18px] sm:text-[20px] leading-[1.3]';
}

function getNarratorSpeechContainerClass(compact = false) {
  return `rounded-xl bg-ivory/40 border border-line/60 shadow-[0_2px_12px_-8px_rgba(26,35,64,0.12)] w-full min-w-0 ${
    compact ? 'px-3 py-2.5' : 'px-3.5 py-3'
  }`;
}

function CorrectionLabelBadge({ compact = false }) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border border-line/70 bg-paper whitespace-nowrap ${
        compact ? 'px-2.5 py-1' : 'px-3 py-1.5'
      }`}
      aria-label="Correction"
    >
      <span
        className={`tracking-[0.22em] uppercase text-wine font-semibold leading-none ${
          compact ? 'text-[8px]' : 'text-[9px]'
        }`}
      >
        Correction
      </span>
    </div>
  );
}

function CorrectionDisplayBar({
  text,
  translation,
  onReplay,
  replayDisabled = false,
  playing = false,
  speechPlaybackTime,
  speechTimings,
  speechText,
  replayLabel = 'Replay correction',
  compact = false,
  inline = false,
}) {
  const highlightBubble = playing && speechText && speechText === text;
  const lineMetricsClass = compact
    ? 'text-[14px] sm:text-[15px] leading-[1.45]'
    : 'text-[16px] sm:text-[18px] leading-[1.45]';
  const lineBodyClass = compact ? 'text-navy/70 italic' : 'text-navy/80 italic';

  return (
    <div
      className={`w-full shrink-0 pointer-events-auto ${
        inline
          ? `${compact ? 'mt-2.5 pt-2.5' : 'mt-3 pt-3'} border-t border-line/50`
          : compact ? 'mb-1' : 'mb-1.5'
      }`}
      aria-live="polite"
    >
      <div
        className={
          inline
            ? 'w-full min-w-0 overflow-visible'
            : `rounded-xl bg-ivory/40 border border-line/60 shadow-[0_2px_12px_-8px_rgba(26,35,64,0.12)] w-full min-w-0 overflow-visible ${
                compact ? 'px-3 py-3' : 'px-4 py-3.5'
              }`
        }
      >
        <div className={`flex items-start w-full min-w-0 ${compact ? 'gap-3' : 'gap-4'}`}>
          <div
            className={`flex shrink-0 items-center ${compact ? 'gap-2' : 'gap-2.5'} pt-0.5`}
            aria-label="Correction controls"
          >
            <CorrectionLabelBadge compact={compact} />
            {!replayDisabled && (
              <NarratorLinePlayButton
                onClick={onReplay}
                label={replayLabel}
                isPlaying={highlightBubble}
              />
            )}
          </div>

          <div
            className={`flex-1 min-w-0 border-l border-line/55 ${
              compact ? 'pl-3' : 'pl-4'
            }`}
          >
            <NarratorHoverText
              text={text}
              translation={translation}
              quote
              highlightSpeech={highlightBubble}
              speechPlaybackTime={speechPlaybackTime}
              speechTimings={speechTimings}
              scrollable
              scrollClassName={`overflow-y-auto scroll-premium overscroll-contain w-full min-w-0 ${
                compact ? 'max-h-[min(22dvh,120px)]' : 'max-h-[min(28dvh,168px)]'
              }`}
              className={`font-display break-words text-left [overflow-wrap:anywhere] [hyphens:auto] ${lineBodyClass} ${lineMetricsClass}`}
              wrapperClassName="relative flex flex-col items-stretch text-left min-w-0 w-full overflow-visible"
              tooltipClassName="top-[calc(100%+6px)] text-[11px] sm:text-[12px] z-[60]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnswerInput({
  inputMode,
  onInputModeChange,
  writeText,
  onWriteTextChange,
  utterances,
  settledText,
  partialTranscript,
  isRecording,
  isStoppingRecording = false,
  status,
  onToggleRecording,
  disabled,
  onWriteFinish,
  writeFinishDisabled = false,
  leftAction = null,
  underlineCorrection = null,
  showMicHint = false,
  micHintText = 'Answer them here',
  stopHintText = "Press when you're done",
  minAnswerLines = MIN_ANSWER_LINES,
  answerLineCount = 0,
  showMinLinesHint = false,
  questionStep,
  questionTotal = INTRO_QUESTIONS.length,
  showQuestionProgress = false,
  headerRightAction = null,
  showAnswerSuccess = false,
  parisianPointsAward = CORRECT_ANSWER_PARISIAN_PTS,
  rightInfo = null,
  compact = false,
  correctionContent = null,
  answerNarratorName = 'Léa',
}) {
  const hasSpeakContent = getSpeakText(utterances, settledText, partialTranscript).length > 0;
  const micActive = isRecording || isStoppingRecording;
  const micHighlighted = showMicHint && inputMode === 'speak' && !micActive && !hasSpeakContent;
  const stopHighlighted = showMicHint && inputMode === 'speak' && micActive;

  const micHint = (text) => (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: [0, -4, 0] }}
      transition={{
        opacity: { duration: 0.4 },
        y: { repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 0.2 },
      }}
      className="flex flex-col items-center pointer-events-none"
    >
      <span className={`font-display italic text-wine whitespace-nowrap text-center leading-none bg-paper/95 rounded-full border border-wine/20 shadow-sm ${
        compact ? 'text-[11px] px-2.5 py-1' : 'text-[12px] px-3 py-1.5'
      }`}>
        {text}
      </span>
      <svg
        width="10"
        height="8"
        viewBox="0 0 10 8"
        fill="none"
        aria-hidden
        className="block shrink-0 -mt-px"
      >
        <path d="M5 8L0 0H10L5 8Z" fill="#8B1E2D" opacity="0.65" />
      </svg>
    </motion.div>
  );

  const linesRemaining = Math.max(0, minAnswerLines - answerLineCount);
  const meetsMinLines = answerLineCount >= minAnswerLines;
  const liveSpeakText = getSpeakText(utterances, settledText, partialTranscript);
  const lastSpeakTextRef = React.useRef('');
  if (liveSpeakText) lastSpeakTextRef.current = liveSpeakText;
  const visibleSpeakText = liveSpeakText || (isStoppingRecording ? lastSpeakTextRef.current : '');
  const hasVisibleSpeakContent = visibleSpeakText.length > 0;
  const showCorrectionUnderline = Boolean(
    underlineCorrection?.original
    && underlineCorrection?.corrected
    && visibleSpeakText.trim() === underlineCorrection.original.trim(),
  );
  const correctedForUnderline = showCorrectionUnderline
    ? prepareCorrectionForDisplay(underlineCorrection.original, underlineCorrection.corrected)
    : '';

  return (
    <div className="flex flex-col shrink-0 w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 w-full shrink-0">
        <div className="justify-self-start min-w-0">
          {showQuestionProgress && questionStep ? (
            <QuestionProgressBadge
              step={questionStep}
              total={questionTotal}
              overlay
              compact={compact}
            />
          ) : null}
        </div>
        <SpeakWriteToggle mode={inputMode} onChange={onInputModeChange} disabled={disabled} compact={compact} />
        <div className="justify-self-end min-w-0 flex justify-end">
          {headerRightAction}
        </div>
      </div>

      {inputMode === 'write' ? (
        <div className={`relative overflow-visible ${compact ? 'mt-3' : 'mt-3.5'} ${compact ? 'pb-12' : 'pb-14'}`}>
          <div className="rounded-xl bg-ivory/40 border border-line/60">
            <div
              className={`px-4 overflow-y-auto scroll-premium ${
                compact ? 'pt-3 pb-5 min-h-[12.5rem] max-h-[12.5rem]' : 'pt-3 pb-6 min-h-[15rem] max-h-[15rem]'
              }`}
            >
              {disabled ? (
                <p
                  className={`font-display leading-[1.45] text-navy break-words whitespace-pre-wrap ${
                    compact ? 'text-[19px] sm:text-[21px]' : 'text-[21px] sm:text-[23px]'
                  }`}
                >
                  {showCorrectionUnderline ? (
                    <DiffText
                      original={underlineCorrection.original}
                      corrected={correctedForUnderline}
                      side="original"
                    />
                  ) : (
                    <>
                      {writeText}
                      {showAnswerSuccess && (
                        <AnswerSuccessBadge points={parisianPointsAward} compact={compact} />
                      )}
                    </>
                  )}
                </p>
              ) : (
                <>
                  <label className="sr-only" htmlFor="assessment-answer">Your answer</label>
                  <textarea
                    id="assessment-answer"
                    value={writeText}
                    onChange={(e) => onWriteTextChange(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        onWriteFinish?.();
                      }
                    }}
                    placeholder="Écris ta réponse en français…"
                    rows={compact ? 4 : 5}
                    className={`w-full bg-transparent font-display leading-[1.45] text-navy placeholder:text-navy/25 outline-none resize-none ${
                      compact ? 'text-[19px] sm:text-[21px] min-h-[6.5rem]' : 'text-[21px] sm:text-[23px] min-h-[8.25rem]'
                    }`}
                  />
                </>
              )}
              {disabled && correctionContent}
            </div>
          </div>

          {leftAction ? (
            <div className={`absolute left-0 bottom-0 z-10 ${compact ? 'pl-2 pb-1' : 'pl-2.5 pb-1.5'}`}>
              {leftAction}
            </div>
          ) : null}

          {rightInfo ? (
            <div className={`absolute right-0 bottom-0 z-10 ${compact ? 'pr-2 pb-1.5' : 'pr-2.5 pb-2'}`}>
              {rightInfo}
            </div>
          ) : null}

          {!disabled && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 z-10">
              <button
                type="button"
                onClick={onWriteFinish}
                disabled={writeFinishDisabled}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 border-paper font-display italic transition-colors shadow-[0_2px_10px_-4px_rgba(26,35,64,0.18)] ${
                  compact ? 'px-3.5 h-10 text-[15px]' : 'px-4 h-11 text-[16px]'
                } ${
                  writeFinishDisabled
                    ? 'bg-wine/15 text-wine/35 cursor-default'
                    : 'bg-wine text-ivory hover:bg-wine2'
                }`}
                aria-label="Fini"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2 6.5l2.5 2.5L10 3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Fini
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`relative overflow-visible ${compact ? 'mt-3' : 'mt-3.5'} ${compact ? 'pb-12' : 'pb-14'}`}>
          <div
            className={`relative rounded-xl bg-ivory/40 border transition-colors duration-300 ${
              micHighlighted || stopHighlighted
                ? 'border-wine/45'
                : 'border-line/60'
            }`}
          >
            <div className={`px-4 overflow-y-auto scroll-premium ${
              compact ? 'pt-3 pb-5 min-h-[12.5rem] max-h-[12.5rem]' : 'pt-3 pb-6 min-h-[15rem] max-h-[15rem]'
            }`}>
              <p className={`font-display leading-[1.4] text-navy break-words ${
                compact ? 'text-[19px] sm:text-[21px]' : 'text-[21px] sm:text-[23px] leading-[1.45]'
              }`}>
                {hasVisibleSpeakContent ? (
                  <>
                    {showCorrectionUnderline ? (
                      <DiffText
                        original={underlineCorrection.original}
                        corrected={correctedForUnderline}
                        side="original"
                      />
                    ) : (
                      utterances.map((u) => (
                        <span key={u.id}>{u.text}{' '}</span>
                      ))
                    )}
                    {!showCorrectionUnderline && settledText && (
                      <span className="font-semibold">
                        {settledText}
                        {partialTranscript && segmentNeedsLeadingSpace(partialTranscript) ? ' ' : null}
                      </span>
                    )}
                    {!showCorrectionUnderline && partialTranscript && (
                      <span className="text-navy/40 italic">{partialTranscript}</span>
                    )}
                    {!showCorrectionUnderline && !liveSpeakText && visibleSpeakText && (
                      <span className="text-navy/70">{visibleSpeakText}</span>
                    )}
                    {showAnswerSuccess && hasVisibleSpeakContent && (
                      <AnswerSuccessBadge points={parisianPointsAward} compact={compact} />
                    )}
                  </>
                ) : status === 'connecting' ? (
                  <span className="inline-flex items-center gap-2.5 font-display italic text-navy/45 text-[14px] sm:text-[15px]">
                    <span className="block h-1.5 w-20 overflow-hidden rounded-full bg-wine/15">
                      <span className="block h-full w-1/2 rounded-full bg-wine/50 animate-pulse" />
                    </span>
                    Setting up the mic…
                  </span>
                ) : isRecording ? (
                  <span className="font-display italic text-wine/70 text-[15px] sm:text-[16px]">Ready! You can start speaking.</span>
                ) : null}
              </p>
              {correctionContent}
            </div>
            {/* Blinking call-to-action — appears whenever a narrator has asked and
                we're waiting for a spoken answer. Tapping it starts recording. */}
            {micHighlighted && (
              <button
                type="button"
                onClick={onToggleRecording}
                className="absolute inset-0 z-[1] flex items-center justify-center px-5 text-center rounded-xl"
                aria-label={`Tap to answer ${answerNarratorName}`}
              >
                <span className={`font-display italic text-wine animate-pulse ${compact ? 'text-[17px]' : 'text-[19px]'}`}>
                  Tap here to answer {answerNarratorName}
                </span>
              </button>
            )}
          </div>

          {leftAction ? (
            <div className={`absolute left-0 bottom-0 z-10 ${compact ? 'pl-2 pb-1' : 'pl-2.5 pb-1.5'}`}>
              {leftAction}
            </div>
          ) : null}

          {rightInfo ? (
            <div className={`absolute right-0 bottom-0 z-10 ${compact ? 'pr-2 pb-1.5' : 'pr-2.5 pb-2'}`}>
              {rightInfo}
            </div>
          ) : null}

          {/* Mic is absolutely positioned so it never moves */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 z-10">
            <div className="relative flex flex-col items-center">
              <div className={`absolute left-1/2 -translate-x-1/2 ${compact ? '-top-[46px]' : '-top-[56px]'}`} />

              <button
                type="button"
                onClick={onToggleRecording}
                disabled={disabled || status === 'connecting' || isStoppingRecording}
                className={`relative w-11 h-11 rounded-full inline-flex items-center justify-center border-2 border-paper text-ivory transition-colors duration-300 shadow-[0_2px_10px_-4px_rgba(26,35,64,0.18)] ${
                  micActive || stopHighlighted
                    ? 'bg-wine'
                    : micHighlighted
                      ? 'bg-wine2'
                      : 'bg-wine hover:bg-wine2'
                } disabled:opacity-40`}
                aria-label={micActive ? 'Stop recording' : 'Start recording'}
              >
                {micActive ? (
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="11" height="14" viewBox="0 0 16 20" fill="none" aria-hidden>
                    <rect x="5" y="1" width="6" height="11" rx="3" fill="currentColor" />
                    <path d="M2 9.5a6 6 0 0012 0M8 16v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                )}
                {(micHighlighted || stopHighlighted) && (
                  <span className="absolute inset-0 rounded-full border border-wine/40 animate-ping-narrator pointer-events-none" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {(showMinLinesHint || (answerLineCount > 0 && !meetsMinLines)) && (
        <p
          className={`text-center text-[12px] italic ${
            showMinLinesHint && !meetsMinLines ? 'text-wine' : 'text-navy/45'
          }`}
          role="status"
        >
          {meetsMinLines
            ? 'Enough lines — you can submit your answer.'
            : `At least ${minAnswerLines} lines to continue (${answerLineCount}/${minAnswerLines})${
                linesRemaining === 1 ? ' — one more line.' : ''
              }`}
        </p>
      )}
    </div>
  );
}

function NarratorLinePlayButton({ onClick, label, isPlaying = false, size = 'md', className = '' }) {
  const sm = size === 'sm';
  const boxClass = sm ? 'w-5 h-5' : 'w-7 h-7';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 ${boxClass} rounded-full border border-wine/25 inline-flex items-center justify-center text-wine hover:bg-wine/5 transition-colors ${className}`.trim()}
      aria-label={isPlaying ? `Pause ${label}` : label}
      title={isPlaying ? 'Pause' : label}
    >
      {isPlaying ? (
        <svg width={sm ? 7 : 8} height={sm ? 9 : 10} viewBox="0 0 10 12" fill="none" aria-hidden>
          <rect x="1" y="1" width="3" height="10" rx="0.75" fill="currentColor" opacity="0.8" />
          <rect x="6" y="1" width="3" height="10" rx="0.75" fill="currentColor" opacity="0.8" />
        </svg>
      ) : (
        <svg width={sm ? 8 : 9} height={sm ? 10 : 11} viewBox="0 0 11 13" fill="none" aria-hidden>
          <path d="M0 0 L11 6.5 L0 13 Z" fill="currentColor" opacity="0.75" />
        </svg>
      )}
    </button>
  );
}

function NarratorPair({
  activeNarrator,
  spokenLinesByNarrator,
  lastLineByNarrator,
  lastTranslationByNarrator,
  playing,
  featuredId,
  currentQuestion = null,
  onToggleReplay,
  replayDisabled,
  speechPlaybackTime,
  speechTimings,
  speechText,
  suppressNarratorLineId = null,
  speechInContainer = true,
  compact = false,
  heroMode = false,
  duoProminent = false,
}) {
  const hasFeatured = Boolean(featuredId);
  const narratorIds = heroMode && featuredId ? [featuredId] : ['lea', 'jules'];
  const largePortrait = (heroMode && hasFeatured) || duoProminent;

  return (
    <div className={`shrink-0 justify-items-center w-full overflow-visible ${
      heroMode
        ? 'flex flex-col items-center'
        : `grid grid-cols-2 ${
            duoProminent
              ? compact ? 'gap-4 sm:gap-8' : 'gap-6 sm:gap-10'
              : compact ? 'gap-2 sm:gap-6' : 'gap-4 sm:gap-12'
          }`
    }`}>
      {narratorIds.map((id) => {
        const n = NARRATORS[id];
        const isFeatured = featuredId === id;
        const isOther = hasFeatured && !isFeatured;
        const isSoloHero = heroMode && isFeatured;
        const isSpeaking = playing && activeNarrator === id;
        const spokenLine = spokenLinesByNarrator?.[id];
        const ownsLine = spokenLine?.narrator === id;
        const lineText = ownsLine ? spokenLine.text : null;
        const lineTranslation = ownsLine
          ? resolveNarratorTranslation(lineText, spokenLine.translation ?? lastTranslationByNarrator?.[id])
          : null;
        const isQuestionLine = Boolean(
          currentQuestion
          && currentQuestion.narrator === id
          && lineText
          && lineText.trim() === currentQuestion.question.trim(),
        );
        const highlightBubble = playing
          && activeNarrator === id
          && ownsLine
          && speechText
          && lineText
          && speechText === lineText;
        const questionTypeClass = isQuestionLine
          ? questionLineTypography(currentQuestion.question, currentQuestion.translation)
          : '';
        const lineMetricsClass = isQuestionLine
          ? questionTypeClass
          : isSoloHero || duoProminent
            ? 'text-[16px] sm:text-[18px] leading-[1.35]'
            : 'text-[14px] sm:text-[15px] leading-[1.35]';
        const playAlignClass = lineMetricsClass.includes('leading-[1.3]')
          ? 'h-[1.3em]'
          : 'h-[1.35em]';
        const lineBodyClass = isQuestionLine
          ? 'text-navy not-italic'
          : `${isSoloHero || duoProminent ? 'text-navy/80' : 'text-navy/70'} italic`;
        const hideLineForCorrection = suppressNarratorLineId === id;
        const columnGapClass = hideLineForCorrection
          ? compact ? 'gap-0.5' : 'gap-1'
          : isSoloHero || duoProminent
            ? compact ? 'gap-2' : 'gap-3'
            : compact ? 'gap-1.5' : 'gap-2.5';

        return (
          <div
            key={id}
            className={`flex flex-col items-center text-center w-full min-w-0 overflow-visible isolate transition-all duration-500 ease-out ${columnGapClass} ${
              isSoloHero || duoProminent ? 'max-w-md' : ''
            } ${
              isFeatured ? 'z-10' : 'z-0'
            } ${isOther ? 'opacity-40 scale-[0.9] sm:scale-[0.88]' : 'opacity-100 scale-100'}`}
          >
            <motion.div
              className={`relative shrink-0 overflow-visible ${
                isSoloHero
                  ? 'pt-3 sm:pt-8'
                  : duoProminent
                    ? 'pt-6 sm:pt-7'
                    : isFeatured
                      ? compact ? 'pt-5 sm:pt-6' : 'pt-6 sm:pt-7'
                      : compact ? 'pt-4 sm:pt-5' : 'pt-5 sm:pt-6'
              }`}
              animate={
                isSpeaking
                  ? {
                      scale: isSoloHero ? 1.14 : largePortrait ? 1.12 : isFeatured ? 1.12 : 1.08,
                      y: 0,
                    }
                  : { scale: 1, y: 0 }
              }
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              style={{ transformOrigin: 'center bottom' }}
            >
              <div
                className={`rounded-full overflow-hidden transition-shadow duration-500 ${
                  isSoloHero
                    ? 'w-24 h-24 sm:w-48 sm:h-48 shadow-[0_16px_40px_-10px_rgba(122,31,46,0.32)]'
                    : duoProminent
                    ? 'w-32 h-32 sm:w-40 sm:h-40 shadow-[0_14px_36px_-10px_rgba(122,31,46,0.3)]'
                    : isFeatured
                    ? compact
                      ? 'w-24 h-24 sm:w-28 sm:h-28 shadow-[0_10px_28px_-8px_rgba(122,31,46,0.28)]'
                      : 'w-28 h-28 sm:w-32 sm:h-32 shadow-[0_12px_32px_-8px_rgba(122,31,46,0.28)]'
                    : compact
                      ? 'w-16 h-16 sm:w-20 sm:h-20'
                      : 'w-[4.5rem] h-[4.5rem] sm:w-24 sm:h-24'
                } ${
                  isSpeaking
                    ? isSoloHero
                      ? 'ring-4 ring-wine shadow-[0_24px_48px_-12px_rgba(122,31,46,0.42)]'
                      : 'ring-4 ring-wine shadow-[0_18px_36px_-10px_rgba(122,31,46,0.36)]'
                    : isSoloHero || duoProminent
                      ? 'ring-[3px] ring-wine/70'
                      : isFeatured
                      ? 'ring-[3px] ring-wine/70'
                      : lineText
                        ? 'ring-2 ring-line/60'
                        : 'ring-2 ring-line/40'
                }`}
              >
                <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
              </div>
            </motion.div>
            <span
              className={`font-display text-center w-full transition-all duration-500 ${
                isSoloHero || duoProminent
                  ? 'text-[18px] sm:text-[20px] text-navy'
                  : isFeatured
                  ? compact ? 'text-[15px] sm:text-[16px] text-navy' : 'text-[17px] sm:text-[18px] text-navy'
                  : compact ? 'text-[13px] sm:text-[14px] text-navy/55' : 'text-[14px] sm:text-[15px] text-navy/55'
              }`}
            >
              {n.name}
            </span>
            {lineText && !hideLineForCorrection && (() => {
              const useSpeechContainer = speechInContainer;
              const lineRow = useSpeechContainer ? (
                // Play button sits at the top-left; the text's FIRST line is indented
                // to clear it, and every following line flows full-width underneath the
                // button (no wasted column of empty space below it).
                <div className={`relative w-full min-w-0 ${lineMetricsClass}`}>
                  {!replayDisabled && (
                    <div className="absolute left-0 top-0 z-10">
                      <NarratorLinePlayButton
                        onClick={() => onToggleReplay?.(id)}
                        label={`Replay ${n.name}`}
                        isPlaying={highlightBubble}
                        size="sm"
                      />
                    </div>
                  )}
                  <NarratorHoverText
                    text={lineText}
                    translation={lineTranslation}
                    quote={!isQuestionLine}
                    highlightSpeech={highlightBubble}
                    speechPlaybackTime={speechPlaybackTime}
                    speechTimings={speechTimings}
                    scrollable={isQuestionLine || useSpeechContainer}
                    scrollClassName="w-full"
                    className={`font-display break-words text-left ${replayDisabled ? '' : '[text-indent:1.9rem]'} ${lineBodyClass}`}
                    wrapperClassName="relative min-w-0 w-full text-left"
                    tooltipClassName="top-[calc(100%+6px)] text-[11px] sm:text-[12px] z-[60]"
                  />
                </div>
              ) : (
                <div
                  className={`inline-flex w-full min-w-0 items-start gap-1.5 max-w-full ${lineMetricsClass} ${
                    isSoloHero || duoProminent ? 'max-w-lg' : 'max-w-[min(100%,320px)]'
                  }`}
                >
                  {!replayDisabled && (
                    <div className={`flex shrink-0 items-center ${playAlignClass}`}>
                      <NarratorLinePlayButton
                        onClick={() => onToggleReplay?.(id)}
                        label={`Replay ${n.name}`}
                        isPlaying={highlightBubble}
                        size="sm"
                      />
                    </div>
                  )}
                  <NarratorHoverText
                    text={lineText}
                    translation={lineTranslation}
                    quote={!isQuestionLine}
                    highlightSpeech={highlightBubble}
                    speechPlaybackTime={speechPlaybackTime}
                    speechTimings={speechTimings}
                    scrollable={isQuestionLine || useSpeechContainer}
                    scrollClassName="w-full"
                    className={`font-display break-words text-center ${lineBodyClass}`}
                    wrapperClassName="relative flex flex-col min-w-0 overflow-visible flex-1 w-full items-center text-center"
                    tooltipClassName="top-[calc(100%+6px)] text-[11px] sm:text-[12px] z-[60]"
                  />
                </div>
              );
              return (
                <div className="w-full flex justify-center px-1 overflow-visible">
                  {useSpeechContainer ? (
                    <div className={`w-full min-w-0 ${compact ? 'max-w-[min(100%,340px)]' : 'max-w-xl'}`}>
                      <div className={getNarratorSpeechContainerClass(compact)}>{lineRow}</div>
                    </div>
                  ) : (
                    lineRow
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

function DashboardFrame({ portraitArea, mainArea, embedded = false, verdictOnly = false }) {
  return (
    <section
      id="learning-dashboard"
      className={
        embedded
          ? `relative flex flex-col flex-1 min-h-0 overflow-hidden pb-1 ${verdictOnly ? 'px-3 sm:px-4' : 'px-4 sm:px-6'}`
          : 'relative flex flex-col min-h-screen max-h-[100dvh] overflow-hidden px-4 sm:px-6 py-3 sm:py-4'
      }
    >
      <div className="absolute inset-0 bg-paper pointer-events-none" />
      {!embedded && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[min(92vw,680px)] h-[280px] rounded-full bg-navy/[0.03] blur-3xl pointer-events-none" />
      )}

      <div className="relative max-w-[680px] mx-auto flex flex-col flex-1 min-h-0 w-full">
        {!embedded && !verdictOnly && (
          <div className="flex items-center justify-between gap-4 mb-2 shrink-0">
            <Logo className="shrink-0" />
            <p className="text-[10px] tracking-[0.22em] uppercase text-wine font-semibold text-right">
              Parisian test
            </p>
          </div>
        )}

        {embedded && !verdictOnly && (
          <p className="text-[10px] tracking-[0.22em] uppercase text-wine font-semibold text-right mb-1 shrink-0">
            Parisian test
          </p>
        )}

        <div className="relative flex flex-col flex-1 min-h-0">
          {verdictOnly ? (
            <div className="relative flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto w-full">
              {mainArea}
            </div>
          ) : (
            <>
              {!embedded && (
                <div className="absolute -inset-[1px] rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-line/25 via-line/15 to-navy/10" />
              )}

              <div className={`relative rounded-[23px] sm:rounded-[27px] overflow-hidden flex flex-col flex-1 min-h-0 ${
                embedded
                  ? 'bg-paper border border-line/50 shadow-[0_10px_28px_-18px_rgba(139,30,45,0.08)]'
                  : 'bg-paper/98 backdrop-blur-sm border border-white/60 shadow-[0_20px_48px_-24px_rgba(26,35,64,0.16)]'
              }`}>
                <div
                  className={`relative z-10 shrink-0 overflow-visible ${
                    embedded ? 'px-4 sm:px-6 pt-2 sm:pt-3' : 'px-4 sm:px-7 pt-4 sm:pt-5'
                  }`}
                >
                  {portraitArea}
                </div>
                <div
                  className={`relative flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto ${
                    embedded ? 'px-4 sm:px-6 pb-2.5' : 'px-4 sm:px-7 pb-4 sm:pb-5'
                  }`}
                >
                  {mainArea}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function LevelAssessmentDashboard({ levelId, onBack, embedded = false, onVerdictViewChange }) {
  const skipToVerdictRef = React.useRef(false);
  const verdictPlayedRef = React.useRef(false);
  const { effectiveLevel, mergeInterviewReport, recordSample, gainExperience, gainDailyParisianPoints, dailyParisianPoints } = useLearnerProfile();
  const learnerLevel = getEffectiveLevel({ assessedLevel: null, claimedLevel: levelId }) || effectiveLevel;
  const [phase, setPhase] = React.useState('intro');
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [writeText, setWriteText] = React.useState('');
  const [inputMode, setInputMode] = React.useState('speak');
  const [answers, setAnswers] = React.useState([]);
  const [assessments, setAssessments] = React.useState([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [feedbackReady, setFeedbackReady] = React.useState(false);
  const [lastFeedback, setLastFeedback] = React.useState(null);
  const [correcting, setCorrecting] = React.useState(false);
  const [introDelaying, setIntroDelaying] = React.useState(true);
  const [stoppingRecording, setStoppingRecording] = React.useState(false);
  const [interviewReport, setInterviewReport] = React.useState(null);
  const [reportLoading, setReportLoading] = React.useState(false);
  const [feedbackStore, setFeedbackStore] = React.useState(() => mergeInterviewFeedback());
  const [answerRejectedShort, setAnswerRejectedShort] = React.useState(false);

  const {
    utterances,
    partialTranscript,
    settledText,
    status,
    isRecording,
    start,
    stop,
    reset,
  } = useSpeechmaticsTranscription();

  const utterancesRef = React.useRef(utterances);
  const settledRef = React.useRef(settledText);
  const partialRef = React.useRef(partialTranscript);
  React.useEffect(() => {
    utterancesRef.current = utterances;
    settledRef.current = settledText;
    partialRef.current = partialTranscript;
  }, [utterances, settledText, partialTranscript]);

  const {
    playLines,
    replayNarratorLine,
    playNarratorLineAudioOnly,
    playing,
    error,
    activeNarrator,
    speechPlaybackTime,
    speechTimings,
    speechText,
    spokenLinesByNarrator,
    lastLineByNarrator,
    lastTranslationByNarrator,
    clearNarratorLines,
    invalidateSession,
    pauseNarratorPlayback,
  } = useNarratorDialogue();

  const toggleNarratorReplay = React.useCallback((narratorId) => {
    const spokenLine = spokenLinesByNarrator?.[narratorId];
    const lineText = spokenLine?.narrator === narratorId ? spokenLine.text : null;
    const isLinePlaying = Boolean(
      playing
      && activeNarrator === narratorId
      && speechText
      && lineText
      && speechText === lineText,
    );
    if (isLinePlaying) {
      pauseNarratorPlayback();
      return;
    }
    replayNarratorLine(narratorId);
  }, [
    playing,
    activeNarrator,
    speechText,
    spokenLinesByNarrator,
    pauseNarratorPlayback,
    replayNarratorLine,
  ]);

  const currentQuestion = INTRO_QUESTIONS[questionIndex];
  const isLastQuestion = questionIndex >= INTRO_QUESTIONS.length - 1;

  const playQuestionAtIndex = React.useCallback(async (index) => {
    const question = INTRO_QUESTIONS[index];
    if (!question) return;
    clearNarratorLines();
    await playLines([{
      narrator: question.narrator,
      text: question.question,
      translation: question.translation,
    }]);
  }, [playLines, clearNarratorLines]);

  const clearAnswer = React.useCallback(() => {
    setWriteText('');
    reset();
  }, [reset]);

  const stopRecordingForSubmit = React.useCallback(async () => {
    if (!isRecording) {
      return getSpeakText(utterancesRef.current, settledRef.current, partialRef.current).trim();
    }

    setStoppingRecording(true);
    try {
      await wait(RECORDING_STOP_GRACE_MS);
      const preStopText = getSpeakText(
        utterancesRef.current,
        settledRef.current,
        partialRef.current,
      ).trim();
      await stop();
      await wait(RECORDING_STOP_SETTLE_MS);
      const postStopText = getSpeakText(
        utterancesRef.current,
        settledRef.current,
        partialRef.current,
      ).trim();
      return postStopText || preStopText;
    } finally {
      setStoppingRecording(false);
    }
  }, [isRecording, stop]);

  const resolveAnswerText = React.useCallback(async () => {
    if (inputMode === 'write') return writeText.trim();
    return stopRecordingForSubmit();
  }, [inputMode, writeText, stopRecordingForSubmit]);

  React.useEffect(() => {
    registerNarratorLineTranslations([
      ...buildIntroScript(),
      ...INTRO_QUESTIONS.map((q) => ({ text: q.question, translation: q.translation })),
    ]);
  }, []);

  React.useEffect(() => {
    const lines = [];
    for (const entry of Object.values(feedbackStore)) {
      for (const [key, group] of Object.entries(entry || {})) {
        if (key === 'askerPerformance' && group && typeof group === 'object') {
          for (const variant of Object.values(group)) {
            if (variant?.text) lines.push(variant);
          }
          continue;
        }
        if (Array.isArray(group)) lines.push(...group);
      }
    }
    registerNarratorLineTranslations(lines);
  }, [feedbackStore]);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/interview-feedback')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setFeedbackStore(mergeInterviewFeedback(data));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (playing && isRecording) stop();
  }, [playing, isRecording, stop]);

  React.useEffect(() => {
    onVerdictViewChange?.(phase === 'complete');
  }, [phase, onVerdictViewChange]);

  React.useEffect(() => {
    if (phase !== 'complete') {
      verdictPlayedRef.current = false;
    }
  }, [phase]);

  React.useEffect(() => {
    if (phase !== 'complete' || reportLoading || !interviewReport) return;
    if (verdictPlayedRef.current) return;
    verdictPlayedRef.current = true;

    const lines = buildFinalVerdictLines(levelId, assessments);
    registerNarratorLineTranslations(lines);
    let cancelled = false;
    (async () => {
      await playLines(lines);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, reportLoading, interviewReport, levelId, assessments, playLines]);

  React.useEffect(() => {
    let cancelled = false;
    setIntroDelaying(true);
    (async () => {
      await wait(INTRO_AUDIO_DELAY_MS);
      if (cancelled || skipToVerdictRef.current) return;
      setIntroDelaying(false);
      await playLines(buildIntroScript());
      if (cancelled || skipToVerdictRef.current) return;
      clearAnswer();
      setPhase('intro_ack');
    })();
    return () => {
      cancelled = true;
      invalidateSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCompris = async () => {
    if (playing) return;

    if (phase === 'intro_ack') {
      clearAnswer();
      setAnswerRejectedShort(false);
      setInputMode('speak');
      setPhase('awaiting_ack');
      await playQuestionAtIndex(0);
      return;
    }

    if (phase !== 'awaiting_ack') return;
    clearAnswer();
    setAnswerRejectedShort(false);
    setInputMode('speak');
    setPhase('answering');
  };

  const draftAnswerText = inputMode === 'write'
    ? writeText
    : getSpeakText(utterances, settledText, partialTranscript);
  const draftAnswerLineCount = countAnswerLines(
    draftAnswerText.trim(),
    inputMode === 'speak' ? utterances.length : 0,
  );
  const draftMeetsMinLines = hasMinimumAnswerLines(
    draftAnswerText.trim(),
    inputMode === 'speak' ? utterances.length : 0,
  );

  React.useEffect(() => {
    if (phase !== 'answering') setAnswerRejectedShort(false);
  }, [phase, questionIndex]);

  React.useEffect(() => {
    if (draftMeetsMinLines) setAnswerRejectedShort(false);
  }, [draftMeetsMinLines]);

  const handleDone = async (providedText = null) => {
    if (submitting || playing || phase !== 'answering') return;
    setSubmitting(true);
    setFeedbackReady(false);
    setLastFeedback(null);
    const trimmed = (providedText ?? await resolveAnswerText()).trim();
    if (!trimmed) {
      setSubmitting(false);
      return;
    }

    const utteranceCount = inputMode === 'speak' ? utterancesRef.current.length : 0;
    if (!hasMinimumAnswerLines(trimmed, utteranceCount)) {
      setAnswerRejectedShort(true);
      setSubmitting(false);
      return;
    }

    setAnswerRejectedShort(false);
    gainDailyParisianPoints(CORRECT_ANSWER_PARISIAN_PTS); // +2 Parisian points per answered question

    const { corrected, translation } = await fetchCorrection(trimmed, learnerLevel);
    const hasMistake = hasParisianMistake(trimmed, corrected);
    const assessed = await assessAnswer(trimmed, learnerLevel);
    const performanceLine = getAskerPerformanceLine(
      feedbackStore,
      currentQuestion.id,
      currentQuestion.narrator,
      hasMistake,
      inputMode,
    );
    const feedbackLines = linesFromFeedback([performanceLine]);

    setAnswers((prev) => [...prev, trimmed]);
    setAssessments((prev) => [...prev, assessed]);
    setLastFeedback({
      original: trimmed,
      corrected,
      translation,
      hasMistake,
      assessedLevel: assessed,
      correctionShown: false,
    });
    setPhase('review');
    setFeedbackReady(true);

    // Ensure only one visible reaction line (the asker).
    clearNarratorLines();
    await playLines(feedbackLines);
    recordSample(trimmed);

    if (hasMistake) {
      // Auto-reveal the Parisian correction below the answer (no button) and read the
      // corrected version aloud — the effect the old "Make it Parisian" button had.
      const correctedDisplay = prepareCorrectionForDisplay(trimmed, corrected);
      setLastFeedback((prev) => ({ ...prev, corrected: correctedDisplay, correctionShown: true }));
      clearNarratorLines();
      await playLines([buildAskerCorrectionReadLine(
        trimmed,
        correctedDisplay,
        currentQuestion?.narrator || 'lea',
      )]);
    } else {
      gainExperience(CORRECT_ANSWER_PERCENT_BUMP);
    }
    setPhase('feedback');

    setSubmitting(false);
  };

  const submitCurrentAnswer = async () => {
    if (submitting || playing || stoppingRecording) return;
    if (phase === 'answering') await handleDone();
  };

  const toggleRecording = async () => {
    if (playing || submitting || stoppingRecording) return;
    if (isRecording) {
      const text = await stopRecordingForSubmit();
      if (text) {
        // Points are awarded once per answered question inside handleDone (+2).
        if (hasMinimumAnswerLines(text, utterancesRef.current.length)) {
          await handleDone(text);
        } else {
          setAnswerRejectedShort(true);
        }
      }
      return;
    }
    await start();
  };

  const handlePlayCorrection = async () => {
    if (playing || correcting || !lastFeedback?.original || !lastFeedback?.corrected) return;
    await playNarratorLineAudioOnly(buildCorrectionPlayLine(
      lastFeedback.original,
      prepareCorrectionForDisplay(lastFeedback.original, lastFeedback.corrected),
      questionIndex,
    ));
  };

  const loadInterviewReport = React.useCallback(async (answerList, levelAssessments) => {
    setReportLoading(true);
    const report = await fetchInterviewReport(answerList, levelId, levelAssessments);
    setInterviewReport(report);
    mergeInterviewReport(report, levelId);
    setReportLoading(false);
  }, [levelId, mergeInterviewReport]);

  const handleContinue = async () => {
    if (playing || correcting) return;

    setLastFeedback(null);
    setCorrecting(false);

    if (isLastQuestion) {
      setPhase('complete');
      await loadInterviewReport(answers, assessments);
      return;
    }

    clearAnswer();
    setFeedbackReady(false);
    setAnswerRejectedShort(false);
    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);
    clearNarratorLines();
    setPhase('awaiting_ack');
    await playQuestionAtIndex(nextIndex);
  };

  const inputDisabled = submitting || playing || stoppingRecording;
  const showMicHint = phase === 'answering' && !playing && !submitting && !stoppingRecording;

  const trySubmitWrite = () => {
    if (submitting || playing || !writeText.trim()) return;
    if (!hasMinimumAnswerLines(writeText.trim())) {
      setAnswerRejectedShort(true);
      return;
    }
    submitCurrentAnswer();
  };

  const skipToLearnOptions = React.useCallback(async () => {
    skipToVerdictRef.current = true;
    invalidateSession();
    clearNarratorLines();
    if (isRecording) stop();
    setIntroDelaying(false);
    setSubmitting(false);
    setStoppingRecording(false);
    setLastFeedback(null);
    setFeedbackReady(false);
    setCorrecting(false);
    setPhase('complete');
    setReportLoading(false);
    const adminReport = enrichReportForVerdict(ADMIN_SKIP_VERDICT_REPORT, levelId, assessments);
    setInterviewReport(adminReport);
    mergeInterviewReport(adminReport, levelId);
  }, [invalidateSession, clearNarratorLines, isRecording, stop, mergeInterviewReport, levelId]);

  const isVerdictView = phase === 'complete';
  const showQuestionProgress = phase === 'awaiting_ack' || phase === 'answering' || phase === 'review' || phase === 'feedback';
  const questionStep = questionIndex + 1;
  const feedbackAskerName = currentQuestion
    ? NARRATORS[currentQuestion.narrator].name
    : 'Léa';
  const isIntroFlow = phase === 'intro' || phase === 'intro_ack';
  const showHeroPortrait = Boolean(
    currentQuestion
    && (phase === 'awaiting_ack' || phase === 'answering' || phase === 'review' || phase === 'feedback'),
  );
  const showCompris = phase === 'intro_ack' || (phase === 'awaiting_ack' && currentQuestion);
  const showFeedbackCompris = phase === 'feedback' && feedbackReady && !playing && !correcting;
  const suppressNarratorLineId = lastFeedback?.correctionShown && currentQuestion?.narrator
    ? currentQuestion.narrator
    : null;
  const correctionDisplayText = lastFeedback?.correctionShown && lastFeedback?.corrected != null && lastFeedback?.original
    ? prepareCorrectionForDisplay(lastFeedback.original, lastFeedback.corrected)
    : null;
  const correctionDisplay = correctionDisplayText
    ? {
        text: correctionDisplayText,
        translation: lastFeedback.translation,
        onReplay: () => {
          const isCorrectionPlaying = playing
            && speechText
            && speechText === correctionDisplayText;
          if (isCorrectionPlaying) {
            pauseNarratorPlayback();
            return;
          }
          replayNarratorLine(currentQuestion.narrator);
        },
        replayDisabled: submitting || correcting,
        playing,
        speechPlaybackTime,
        speechTimings,
        speechText,
        replayLabel: `Replay ${NARRATORS[currentQuestion.narrator].name}`,
      }
    : null;

  const adminSkipButton = isVerdictView ? (
    <button
      type="button"
      onClick={skipToLearnOptions}
      className="fixed top-[4.75rem] right-5 sm:right-8 z-30 text-[10px] tracking-[0.16em] uppercase text-navy/30 hover:text-wine/80 transition-colors"
      title="Admin: jump to rating screen"
    >
      Admin skip
    </button>
  ) : (
    <button
      type="button"
      onClick={skipToLearnOptions}
      className="absolute top-2 right-4 sm:right-6 z-20 text-[10px] tracking-[0.16em] uppercase text-navy/30 hover:text-wine/80 transition-colors"
      title="Admin: jump to rating screen"
    >
      Admin skip
    </button>
  );

  return (
    <DashboardFrame
      embedded={embedded}
      verdictOnly={isVerdictView}
      portraitArea={!isVerdictView ? (
        <>
      {adminSkipButton}

        <section
          className={`relative shrink-0 w-full overflow-visible transition-all duration-500 ${
            isIntroFlow
              ? 'pb-2'
              : showHeroPortrait
                ? correctionDisplay ? 'pb-0' : 'pb-0.5'
                : 'pb-0.5'
          }`}
          aria-label="Interview prompt"
        >
          <NarratorPair
            compact={embedded}
            heroMode={showHeroPortrait}
            duoProminent={isIntroFlow}
            activeNarrator={activeNarrator}
            spokenLinesByNarrator={spokenLinesByNarrator}
            lastLineByNarrator={lastLineByNarrator}
            lastTranslationByNarrator={lastTranslationByNarrator}
            playing={playing}
            speechPlaybackTime={speechPlaybackTime}
            speechTimings={speechTimings}
            speechText={speechText}
            onToggleReplay={toggleNarratorReplay}
            replayDisabled={submitting || correcting}
            suppressNarratorLineId={suppressNarratorLineId}
            featuredId={
              currentQuestion
              && (phase === 'awaiting_ack' || phase === 'answering' || phase === 'review' || phase === 'feedback')
                ? currentQuestion.narrator
                : null
            }
            currentQuestion={
              currentQuestion
              && (phase === 'awaiting_ack' || phase === 'answering')
                ? currentQuestion
                : null
            }
          />
        </section>
        </>
      ) : null}
      mainArea={isVerdictView ? (
        <>
          {adminSkipButton}
          <div className="flex flex-1 flex-col items-center justify-center min-h-0 w-full gap-3 sm:gap-4 py-1 pb-2 overflow-y-auto">
            <VerdictResultsTitle compact={embedded} />
            <FrenchOpinionReport
              report={interviewReport}
              loading={reportLoading}
              claimedLevel={levelId}
              compact={embedded}
              activeNarrator={activeNarrator}
              playing={playing}
              speechPlaybackTime={speechPlaybackTime}
              speechTimings={speechTimings}
              speechText={speechText}
              onToggleReplay={toggleNarratorReplay}
              replayDisabled={reportLoading}
            />
          </div>
        </>
      ) : (
        <>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <AnimatePresence mode="wait">
        {showCompris && (
          <motion.div
            key={phase === 'intro_ack' ? 'intro-ack' : `ack-${questionIndex}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className={`flex shrink-0 flex-col items-center w-full ${
              phase === 'awaiting_ack'
                ? embedded ? 'mt-5 sm:mt-6' : 'mt-6 sm:mt-7'
                : embedded ? 'mt-5 sm:mt-6' : 'mt-6 sm:mt-8'
            }`}
          >
            <NarratorHoverText
              text="Compris"
              translation="Understood"
              tooltipPosition="below"
              wrapperClassName="relative inline-flex"
            >
              <button
                type="button"
                onClick={handleCompris}
                disabled={playing}
                className={`bg-wine text-ivory rounded-full font-display hover:bg-wine2 transition-all disabled:opacity-40 ${
                  embedded
                    ? 'px-10 py-3 text-[16px] min-w-[168px]'
                    : 'px-14 py-3.5 text-[18px] sm:text-[19px] min-w-[200px]'
                }`}
              >
                Compris
              </button>
            </NarratorHoverText>
          </motion.div>
        )}

        {(phase === 'answering' || phase === 'review' || phase === 'feedback') && currentQuestion && (
          <motion.div
            key={`q-${questionIndex}-${phase}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className={`flex flex-col shrink-0 w-full gap-4 ${
              correctionDisplay
                ? embedded ? 'mt-1' : 'mt-2'
                : embedded ? 'mt-4' : 'mt-7'
            }`}
          >
            <AnswerInput
              compact={embedded}
              answerNarratorName={currentQuestion ? NARRATORS[currentQuestion.narrator].name : 'Léa'}
              correctionContent={correctionDisplay?.text ? (
                <CorrectionDisplayBar
                  inline
                  text={correctionDisplay.text}
                  translation={correctionDisplay.translation}
                  onReplay={correctionDisplay.onReplay}
                  replayDisabled={correctionDisplay.replayDisabled}
                  playing={correctionDisplay.playing}
                  speechPlaybackTime={correctionDisplay.speechPlaybackTime}
                  speechTimings={correctionDisplay.speechTimings}
                  speechText={correctionDisplay.speechText}
                  replayLabel={correctionDisplay.replayLabel}
                  compact={embedded}
                />
              ) : null}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              writeText={writeText}
              onWriteTextChange={setWriteText}
              utterances={utterances}
              settledText={settledText}
              partialTranscript={partialTranscript}
              isRecording={isRecording}
              isStoppingRecording={stoppingRecording}
              status={status}
              onToggleRecording={
                phase === 'answering' && !inputDisabled ? toggleRecording : () => {}
              }
              disabled={phase !== 'answering' || inputDisabled}
              onWriteFinish={trySubmitWrite}
              writeFinishDisabled={
                inputDisabled || !draftMeetsMinLines || !writeText.trim()
              }
              showMicHint={phase === 'answering' && showMicHint && !inputDisabled}
              micHintText="Answer them here"
              minAnswerLines={MIN_ANSWER_LINES}
              answerLineCount={draftAnswerLineCount}
              showMinLinesHint={phase === 'answering' && answerRejectedShort}
              questionStep={questionStep}
              questionTotal={INTRO_QUESTIONS.length}
              showQuestionProgress={showQuestionProgress}
              underlineCorrection={lastFeedback?.hasMistake ? lastFeedback : null}
              showAnswerSuccess={
                Boolean(
                  lastFeedback
                  && !lastFeedback.hasMistake
                  && (phase === 'review' || phase === 'feedback'),
                )
              }
              parisianPointsAward={CORRECT_ANSWER_PARISIAN_PTS}
              rightInfo={
                <div className="relative flex items-center justify-center w-11 h-11 rounded-full bg-wine/[0.06] border-2 border-wine/20 select-none">
                  <div className="flex flex-col items-center gap-[3px] -mt-1.5">
                    <span className="font-display text-[19px] font-bold text-wine leading-none tabular-nums">{dailyParisianPoints}</span>
                    <span className="text-[6.5px] font-mono tracking-wide uppercase text-wine/60 leading-tight">points</span>
                  </div>
                </div>
              }
              headerRightAction={
                showFeedbackCompris ? (
                  <NarratorHoverText
                    text={isLastQuestion ? 'See my rating' : 'Next question'}
                    translation={isLastQuestion ? 'View your level rating' : 'Continue to the next question'}
                    tooltipPosition="below"
                    wrapperClassName="relative inline-flex"
                  >
                    <button
                      type="button"
                      onClick={handleContinue}
                      disabled={playing || correcting}
                      className={`bg-navy text-ivory rounded-full font-display hover:bg-navy/90 transition-all disabled:opacity-40 whitespace-nowrap ${
                        embedded
                          ? 'px-3.5 py-1.5 text-[12px] sm:text-[13px]'
                          : 'px-5 py-2 text-[14px] sm:text-[15px]'
                      }`}
                    >
                      {isLastQuestion ? 'See my rating' : 'Next question'}
                    </button>
                  </NarratorHoverText>
                ) : null
              }
            />

            {phase === 'feedback' && feedbackReady && !lastFeedback?.hasMistake && (
              <p className={`shrink-0 text-[12px] text-navy/50 italic text-center ${embedded ? 'mt-1' : 'mt-2'}`}>
                {playing
                  ? `${feedbackAskerName} is reviewing how you ${inputMode === 'write' ? 'wrote' : 'spoke'}…`
                  : 'Nickel — no correction needed.'}
              </p>
            )}
          </motion.div>
        )}

        {phase === 'intro' && introDelaying && (
          <motion.p
            key="intro-wait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`text-center text-[13px] text-navy/45 italic shrink-0 ${embedded ? 'mt-2' : 'mt-4'}`}
          >
            Léa & Jules are getting ready…
          </motion.p>
        )}

      </AnimatePresence>
      </div>

      {error && (
        <p className="mt-6 text-center text-[13px] text-wine/75">{error}</p>
      )}
        </>
      )}
    />
  );
}
