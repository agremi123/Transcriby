import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import { NARRATORS, useNarratorDialogue } from '../lib/narratorAudio';
import { HighlightedSpeech } from '../lib/HighlightedSpeech';
import { getQuestionFeedbackLines, mergeInterviewFeedback } from '../data/interviewFeedback';
import {
  extractCorrectedFromRaw,
  prepareCorrectionForDisplay,
  splitCorrectionParagraphs,
} from '../lib/correctionFormat';
import { detectLearnerGenderFromFrench, normalizeLearnerGender } from '../lib/learnerGender';

const PARISIAN_MASCOTS = {
  woman: '/assets/parisian-woman.png',
  man: '/assets/parisian-man.png',
};

const READY_PROMPT = {
  id: 'ready',
  narrator: 'jules',
  question: "T'es prêt ?",
  translation: 'Are you ready?',
};

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Pause after level pick so scroll + layout settle before TTS */
const INTRO_AUDIO_DELAY_MS = 1600;

/** Keep mic open briefly after stop so Deepgram can finalize the last words */
const RECORDING_STOP_GRACE_MS = 900;
const RECORDING_STOP_SETTLE_MS = 150;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scriptLine(narrator, text, translation) {
  return { narrator, text, translation };
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
  {
    id: 'why',
    narrator: 'jules',
    question: "Pourquoi tu apprends le français, et pourquoi le parler comme à Paris ?",
    translation: 'Why are you learning French, and why speak it like in Paris?',
  },
  {
    id: 'day',
    narrator: 'lea',
    question: "Raconte-moi ta journée type, du réveil au coucher.",
    translation: 'Tell me about a typical day, from waking up to going to bed.',
  },
];

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

function buildIntroScript(levelId) {
  const levelLines = {
    A1: {
      fr: "Tu t'es mis débutant… intéressant.",
      en: 'You put yourself as a beginner… interesting.',
    },
    A2: {
      fr: 'Tu prétends être élémentaire ? On va voir.',
      en: 'You claim elementary level? We\'ll see.',
    },
    B1: {
      fr: "B1, tu dis ? Hmm, j'ai des doutes.",
      en: 'B1, you say? Hmm, I have doubts.',
    },
    B2: {
      fr: 'Upper intermediate… la barre est haute, hein.',
      en: 'Upper intermediate… the bar is high, huh.',
    },
    C1: {
      fr: "C1 ? Là, y a pas le droit à l'erreur.",
      en: 'C1? No room for mistakes there.',
    },
  };
  const level = levelLines[levelId] || {
    fr: `Tu te mets ${levelId} ? On va vérifier.`,
    en: `You claim ${levelId}? Let's check.`,
  };

  return [
    scriptLine('lea', `Salut ! Bienvenue. ${level.fr}`, `Hi! Welcome. ${level.en}`),
    scriptLine('jules', "On va te poser quelques questions perso, réponds en français, naturellement.", "We're going to ask you a few personal questions, answer in French, naturally."),
    scriptLine('lea', "Parle ou écris, comme tu veux. Quand t'as fini, tu appuies sur stop.", "Speak or write, however you like. When you're done, press stop."),
    scriptLine('jules', "On te dira ce qu'on en pense. Et après, on te propose la version parisienne.", "We'll tell you what we think. Then we'll give you the Parisian version."),
  ];
}

function normalizeForCompare(text) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function assessAnswer(text) {
  try {
    const res = await fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, assessOnly: true }),
    });
    const data = await res.json();
    return data.level || null;
  } catch {
    return null;
  }
}

async function fetchCorrection(text) {
  try {
    const res = await fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, register: 'Parisien' }),
    });
    const data = await res.json();
    const raw = data.corrected?.trim() || text.trim();
    const extracted = extractCorrectedFromRaw(raw, text.trim());
    return prepareCorrectionForDisplay(text, extracted);
  } catch {
    return text.trim();
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
  return scriptLine(getCorrectionReader(questionIndex), corr, 'The Parisian version.');
}

function buildReadyFeedback(answer) {
  const lower = answer.toLowerCase();
  const eager = /oui|prêt|pret|yes|ok|allons|let'?s|carrément|carrement|vas-y/.test(lower);
  if (eager) {
    return [
      scriptLine('jules', "Bien. Pas de pression… enfin si, un peu.", 'Good. No pressure… well, a little.'),
      scriptLine('lea', "Première question, fais-toi plaize.", 'First question, enjoy yourself.'),
    ];
  }
  return [
    scriptLine('lea', "Tu hésites déjà ? On est pas si méchants.", 'Hesitating already? We\'re not that mean.'),
    scriptLine('jules', "Allez, on attaque quand même.", 'Come on, we\'re starting anyway.'),
  ];
}

function hasParisianMistake(original, corrected) {
  return normalizeForCompare(original) !== normalizeForCompare(corrected);
}

function linesFromFeedback(rawLines) {
  return rawLines.map((line) => scriptLine(line.narrator, line.text, line.translation));
}

function getSpeakText(utterances, settledText, partialTranscript) {
  const base = utterances.map((u) => u.text).join(' ');
  const tail = [settledText, partialTranscript].filter(Boolean).join(' ');
  return [base, tail].filter(Boolean).join(' ').trim();
}

function computeFinalLevel(levelId, assessments) {
  const levels = assessments.filter(Boolean);
  const avgIdx = levels.length
    ? Math.round(levels.reduce((s, l) => s + LEVEL_ORDER.indexOf(l), 0) / levels.length)
    : LEVEL_ORDER.indexOf('A2');
  return LEVEL_ORDER[Math.min(avgIdx, LEVEL_ORDER.length - 1)] || levelId || 'A2';
}

function buildFinalScript(levelId, assessments) {
  const finalLevel = computeFinalLevel(levelId, assessments);
  const claimedIdx = LEVEL_ORDER.indexOf(levelId);
  const avgIdx = LEVEL_ORDER.indexOf(finalLevel);

  if (avgIdx >= claimedIdx) {
    return [
      scriptLine('lea', `Bon. Globalement, on te situe plutôt ${finalLevel}. Pas mal.`, `OK. Overall, we'd place you around ${finalLevel}. Not bad.`),
      scriptLine(
        'jules',
        levelId === finalLevel ? "T'avais visé juste. Rare, ça." : `Tu t'étais vendu ${levelId}, honnêtement, ${finalLevel} c'est plus crédible.`,
        levelId === finalLevel ? 'You aimed right. That\'s rare.' : `You sold yourself as ${levelId}, honestly ${finalLevel} is more believable.`,
      ),
      scriptLine('lea', "Continue avec Nativa, et parle comme à Paris, pas comme à l'école.", 'Keep going with Nativa, and speak like Paris, not like school.'),
    ];
  }

  return [
    scriptLine('jules', `Alors… tu pensais être ${levelId} ? On est plutôt ${finalLevel}, clairement.`, `So… you thought you were ${levelId}? We're seeing ${finalLevel}, clearly.`),
    scriptLine('lea', "Pas de honte, au moins maintenant tu sais. Et nous, on est pas méchants… enfin, pas toujours.", 'No shame, at least now you know. And we\'re not mean… well, not always.'),
    scriptLine('jules', "Reviens t'entraîner. Paris t'attend, mais fais tes devoirs.", 'Come back and practice. Paris is waiting, but do your homework.'),
  ];
}

function clampScore(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildFallbackSummary(strengths, weaknesses, overallLevel) {
  const strengthPhrase = {
    'Speaking confidence': 'speaking — you jump in without hesitating',
    'Accent & pronunciation': 'your accent — it sounds natural',
    'Vocabulary': 'the words you use',
  };
  const weaknessPhrase = {
    'Grammar accuracy': 'your grammar slips sometimes',
    'Parisian style': 'you still sound textbook rather than Parisian',
    'Natural flow': 'your rhythm feels a bit stiff',
    'Local expressions': 'you miss the idioms locals use',
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

  const strengths = [
    { label: 'Speaking confidence', hint: "You aren't afraid to speak up", score: clampScore(overallScore + 14, 72) },
    { label: 'Accent & pronunciation', hint: 'How natural you sound', score: clampScore(overallScore + 8, 68) },
    { label: 'Vocabulary', hint: 'Words you know and use', score: clampScore(overallScore + 4, 65) },
  ];
  const weaknesses = [
    { label: 'Parisian style', hint: 'Local register vs textbook French', score: clampScore(overallScore - 18, 42) },
    { label: 'Grammar accuracy', hint: 'Verb forms, agreements, tenses', score: clampScore(overallScore - 12, 48) },
    { label: 'Natural flow', hint: 'Rhythm and pace when you speak', score: clampScore(overallScore - 10, 45) },
    { label: 'Local expressions', hint: 'Idioms Parisians actually use', score: clampScore(overallScore - 20, 38) },
  ];

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
    return report;
  } catch {
    return buildFallbackReport(answers, assessments, levelId);
  }
}

function computeParisianPercent(report) {
  const parisianLabels = ['Parisian style', 'Natural flow', 'Local expressions', 'Accent & pronunciation'];
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
  'Speaking confidence': 'speak',
  'Accent & pronunciation': 'speak',
  'Vocabulary': 'vocab',
  'Grammar accuracy': 'vocab',
  'Parisian style': 'discover',
  'Natural flow': 'speak',
  'Local expressions': 'discover',
};

function TraitGaugeRow({ label, hint, score, tone = 'neutral', levelId }) {
  const barColor = tone === 'strength' ? 'bg-green-600/75' : tone === 'weakness' ? 'bg-wine/75' : 'bg-navy/60';
  const numericScore = clampScore(score);
  const improveMode = TRAIT_IMPROVE_MODE[label] || 'speak';
  const improveHref = buildLearnPathUrl(improveMode, levelId);

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-medium text-navy leading-snug">{label}</span>
          {hint ? (
            <p className="text-[11px] text-navy/45 leading-snug mt-0.5">{hint}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[13px] font-mono tabular-nums text-navy/55">
            {numericScore}
          </span>
          <a
            href={improveHref}
            className="text-[11px] font-display px-2.5 py-1 rounded-full border border-wine/25 text-wine/65 hover:bg-wine hover:text-ivory hover:border-wine hover:shadow-sm transition-all duration-200"
          >
            Improve
          </a>
        </div>
      </div>
      <div className="h-2 rounded-full bg-navy/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function FrenchQuote({ text, className, highlightSpeech, playbackTime, timings, speechText }) {
  const paragraphs = splitCorrectionParagraphs(text);

  if (highlightSpeech && speechText) {
    return (
      <HighlightedSpeech
        text={text.replace(/\n\n+/g, ' ')}
        playbackTime={playbackTime}
        timings={timings}
        quote
        className={className}
      />
    );
  }

  return (
    <p className={className}>
      «
      {paragraphs.map((paragraph, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <>
              <br />
              <br />
            </>
          ) : null}
          {paragraph}
        </React.Fragment>
      ))}
      »
    </p>
  );
}

function FrenchOpinionReport({
  report,
  loading,
  claimedLevel,
}) {
  if (loading) {
    return (
      <div className="w-full max-w-[440px] mx-auto rounded-2xl border border-line/60 bg-white/90 px-5 py-8 flex justify-center">
        <ProcessDots />
      </div>
    );
  }

  if (!report) return null;

  const claimVerdict = computeClaimVerdict(claimedLevel, report.overallLevel);
  const parisianPercent = report.parisianPercent ?? computeParisianPercent(report);
  const isParisian = parisianPercent >= 92;
  const learnerGender = report.learnerGender || 'woman';
  const mascotSrc = PARISIAN_MASCOTS[learnerGender] || PARISIAN_MASCOTS.woman;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[440px] mx-auto rounded-2xl border border-wine/15 bg-white/95 shadow-sm overflow-hidden text-left"
    >
      <div className="px-5 py-4 border-b border-wine/10 bg-wine/[0.04]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-[18px] sm:text-[20px] text-navy leading-snug">
              Léa and Jules{' '}
              {claimVerdict.agree ? (
                <span className="text-green-700">agree</span>
              ) : (
                <span className="text-wine">disagree</span>
              )}
              , you&apos;re{' '}
              <span className="text-wine font-semibold">{claimVerdict.level}</span>.
            </p>
            {!claimVerdict.agree ? (
              <p className="text-[12px] text-navy/50 mt-1">
                You claimed {claimVerdict.claimedLevel}
              </p>
            ) : null}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] tracking-widest uppercase text-navy/35 mb-0.5">Overall</p>
            <p className="font-display text-[28px] text-wine leading-none tabular-nums">
              {report.overallScore}
            </p>
          </div>
        </div>
      </div>

      {report.summary ? (
        <div className="px-5 py-4 border-b border-wine/8 bg-ivory/30">
          <p className="text-[14px] text-navy/85 leading-relaxed font-display italic">
            {report.summary}
          </p>
        </div>
      ) : null}

      <div className="px-5 py-4 space-y-5">
        {report.strengths?.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase text-green-700/80 font-semibold mb-3">
              What you do well
            </p>
            <div className="space-y-3">
              {report.strengths.map((t) => (
                <TraitGaugeRow key={t.label} label={t.label} hint={t.hint} score={t.score} tone="strength" levelId={claimedLevel} />
              ))}
            </div>
          </div>
        )}

        {report.weaknesses?.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase text-wine/80 font-semibold mb-3">
              What to improve
            </p>
            <div className="space-y-3">
              {report.weaknesses.map((t) => (
                <TraitGaugeRow key={t.label} label={t.label} hint={t.hint} score={t.score} tone="weakness" levelId={claimedLevel} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-wine/10 bg-gradient-to-br from-wine/[0.03] to-ivory/50">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-[88px] sm:w-[96px]">
            <img
              src={mascotSrc}
              alt={learnerGender === 'man' ? 'Parisian man' : 'Parisian woman'}
              className="w-full h-auto rounded-lg border border-line/40 shadow-sm"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="text-[11px] text-navy/55">
                  {isParisian ? 'You sound Parisian' : 'On your way to Parisian'}
                </p>
                <p className="font-display text-[22px] text-wine leading-none tabular-nums">
                  {parisianPercent}%
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-navy/8 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-wine/60 to-wine transition-all duration-700"
                  style={{ width: `${parisianPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-navy/40 mt-1.5">
                {isParisian
                  ? 'Nativa verdict: tu sonnes parisien·ne.'
                  : `${100 - parisianPercent}% left before you sound fully Parisian.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CorrectionPanel({
  original,
  corrected,
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
            {highlightSpeech ? (
              <HighlightedSpeech
                text={speechText}
                playbackTime={speechPlaybackTime}
                timings={speechTimings}
                quote
                className="font-display text-[14px] text-navy/65 italic flex-1"
              />
            ) : (
              <p className="font-display text-[14px] text-navy/65 italic flex-1">
                Rien à corriger, Léa valide celle-là.
              </p>
            )}
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

function SpeakWriteToggle({ mode, onChange, disabled }) {
  return (
    <div className="relative flex items-center rounded-full p-0.5 bg-wine/10 w-fit mx-auto">
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
          className={`relative z-10 font-display text-[13px] tracking-wide px-4 py-1.5 rounded-full capitalize transition-colors duration-200 disabled:opacity-40 ${
            mode === m.id ? 'text-ivory' : 'text-navy/45 hover:text-navy/70'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function questionTypography(question, translation) {
  const totalChars = question.length + (translation?.length || 0);
  if (totalChars > 100 || question.length > 58) {
    return {
      question: 'text-[13px] sm:text-[14px] leading-[1.35]',
      translation: 'text-[11px] sm:text-[12px] leading-[1.35]',
    };
  }
  if (totalChars > 70 || question.length > 44) {
    return {
      question: 'text-[14px] sm:text-[15px] leading-[1.35]',
      translation: 'text-[11px] sm:text-[12px] leading-[1.35]',
    };
  }
  return {
    question: 'text-[15px] sm:text-[17px] leading-[1.3]',
    translation: 'text-[12px] sm:text-[13px] leading-[1.35]',
  };
}

function QuestionCard({ label, question, translation, step, total }) {
  const sizes = questionTypography(question, translation);

  return (
    <div className="relative w-full min-w-0 rounded-xl bg-white/90 border border-wine/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-wine/30 to-transparent" />
      <div className="px-3.5 sm:px-4 pt-3 pb-2.5 flex flex-col min-h-0">
        <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
          <span className="text-[9px] tracking-[0.14em] uppercase text-wine/80 font-semibold min-w-0 break-words leading-tight">
            {label}
          </span>
          {total != null && (
            <span className="text-[10px] text-navy/35 tabular-nums shrink-0 pt-0.5">
              {step}/{total}
            </span>
          )}
        </div>
        <div className="max-h-[min(30dvh,168px)] overflow-y-auto scroll-premium pr-0.5 -mr-0.5">
          <p
            lang="fr"
            className={`font-display text-navy break-words [overflow-wrap:anywhere] ${sizes.question}`}
          >
            {question}
          </p>
          {translation && (
            <p className={`mt-1.5 text-navy/45 break-words [overflow-wrap:anywhere] ${sizes.translation}`}>
              {translation}
            </p>
          )}
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
  onWriteSubmit,
  showMicHint = false,
  micHintText = 'answer them here',
  stopHintText = "press when you're done",
}) {
  const hasSpeakContent = getSpeakText(utterances, settledText, partialTranscript).length > 0;
  const micActive = isRecording || isStoppingRecording;
  const micHighlighted = showMicHint && inputMode === 'speak' && !micActive && !hasSpeakContent;
  const stopHighlighted = showMicHint && inputMode === 'speak' && micActive;

  const hintBubble = (text) => (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: [0, -4, 0] }}
      transition={{
        opacity: { duration: 0.4 },
        y: { repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 0.2 },
      }}
      className="absolute bottom-full mb-2 right-0 flex flex-col items-end gap-1 pointer-events-none z-20"
    >
      <span className="font-display text-[12px] italic text-wine whitespace-nowrap bg-paper/95 px-2.5 py-1 rounded-full border border-wine/20 shadow-sm">
        {text}
      </span>
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="mr-3">
        <path d="M5 8L0.669873 0.5L9.33013 0.5L5 8Z" fill="#8B1E2D" opacity="0.65" />
      </svg>
    </motion.div>
  );

  return (
    <div className="mt-3 space-y-2.5 shrink-0">
      <SpeakWriteToggle mode={inputMode} onChange={onInputModeChange} disabled={disabled} />

      {inputMode === 'write' ? (
        <>
          <label className="sr-only" htmlFor="assessment-answer">Your answer</label>
          <textarea
            id="assessment-answer"
            value={writeText}
            onChange={(e) => onWriteTextChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onWriteSubmit?.();
              }
            }}
            onBlur={() => {
              if (writeText.trim()) onWriteSubmit?.();
            }}
            placeholder="Écris ta réponse en français…"
            rows={3}
            disabled={disabled}
            className="w-full px-4 py-3 rounded-xl bg-ivory/50 border border-line/60 font-display text-[16px] leading-relaxed text-navy placeholder:text-navy/25 outline-none focus:border-wine/35 focus:ring-2 focus:ring-wine/10 transition-all resize-none disabled:opacity-60"
          />
        </>
      ) : (
        <div
          className={`relative rounded-xl bg-ivory/50 min-h-[104px] px-4 py-3 transition-all duration-500 ${
            micHighlighted || stopHighlighted
              ? 'border-2 border-wine/45 ring-2 ring-wine/15 shadow-[0_0_24px_-4px_rgba(139,30,45,0.25)]'
              : 'border border-line/60'
          }`}
        >
          <p className="font-display text-[18px] sm:text-[19px] leading-relaxed text-navy min-h-[44px] max-h-[72px] overflow-y-auto break-words">
            {hasSpeakContent ? (
              <>
                {utterances.map((u) => (
                  <span key={u.id}>{u.text}{' '}</span>
                ))}
                {settledText && <span className="font-semibold">{settledText}{' '}</span>}
                {partialTranscript && (
                  <span className="text-navy/40 italic">{partialTranscript}</span>
                )}
              </>
            ) : (
              <span className="text-navy/30 italic inline-flex items-center min-h-[28px]">
                {isStoppingRecording ? (
                  <ProcessDots />
                ) : isRecording ? (
                  'Parle maintenant…'
                ) : (
                  'Appuie sur le micro pour répondre'
                )}
              </span>
            )}
          </p>
          <div className="flex items-center justify-end gap-2 mt-2">
            {(status === 'connecting' || micActive) && (
              <span className="text-[11px] text-wine/70 mr-auto inline-flex items-center min-h-[14px]">
                {status === 'connecting' ? (
                  'Connecting…'
                ) : isStoppingRecording ? (
                  <ProcessDots />
                ) : (
                  'Live'
                )}
              </span>
            )}
            <button
              type="button"
              onClick={onToggleRecording}
              disabled={disabled || status === 'connecting' || isStoppingRecording}
              className={`relative w-10 h-10 rounded-full inline-flex items-center justify-center transition-all duration-300 ${
                stopHighlighted
                  ? 'bg-wine text-ivory scale-110 shadow-md ring-2 ring-wine/30'
                  : micActive
                    ? 'bg-wine text-ivory'
                    : micHighlighted
                      ? 'bg-wine text-ivory scale-110 shadow-md ring-2 ring-wine/30'
                      : 'border border-wine/50 text-wine hover:border-wine hover:bg-wine/5'
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
                <>
                  <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-50" />
                  <span className="absolute inset-0 rounded-full border border-wine animate-pulse opacity-30" />
                </>
              )}
              {micHighlighted && hintBubble(micHintText)}
              {stopHighlighted && hintBubble(stopHintText)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NarratorLinePlayButton({ onClick, label, visible = true }) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`w-7 h-7 rounded-full border border-wine/25 inline-flex items-center justify-center text-wine hover:bg-wine/5 transition-opacity ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-label={label}
      title={label}
    >
      <svg width="9" height="11" viewBox="0 0 11 13" fill="none" aria-hidden>
        <path d="M0 0 L11 6.5 L0 13 Z" fill="currentColor" opacity="0.75" />
      </svg>
    </button>
  );
}

function NarratorPair({
  activeNarrator,
  lastLineByNarrator,
  lastTranslationByNarrator,
  playing,
  askerId,
  onReplay,
  replayDisabled,
  speechPlaybackTime,
  speechTimings,
  speechText,
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-8 shrink-0">
      {(['lea', 'jules']).map((id) => {
        const n = NARRATORS[id];
        const isSpeaking = playing && activeNarrator === id;
        const isAsking = !playing && askerId === id;
        const bubbleText = lastLineByNarrator[id];
        const bubbleTranslation = lastTranslationByNarrator?.[id];
        const highlightBubble = isSpeaking && speechText && speechText === bubbleText;

        return (
          <div key={id} className="flex flex-col items-center gap-2">
            <div className="relative">
              <div
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden transition-all duration-300 ${
                  isSpeaking
                    ? 'ring-[3px] ring-wine shadow-lg scale-105'
                    : isAsking
                      ? 'ring-2 ring-wine/50 shadow-md'
                      : bubbleText
                        ? 'ring-1 ring-line/60'
                        : 'ring-1 ring-line/40 opacity-85'
                }`}
              >
                <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
              </div>
              {isSpeaking && (
                <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-25" />
              )}
            </div>
            <span className="font-display text-[14px] sm:text-[15px] text-navy">{n.name}</span>
            {bubbleText && (
              <div className="group relative w-full max-w-[min(100%,240px)] px-1">
                <div className="grid grid-cols-[28px_1fr_28px] items-start gap-0.5 w-full">
                  <div aria-hidden className="w-7" />
                  {highlightBubble ? (
                    <HighlightedSpeech
                      text={bubbleText}
                      playbackTime={speechPlaybackTime}
                      timings={speechTimings}
                      quote
                      className={`font-display text-[14px] sm:text-[15px] leading-[1.35] text-navy/70 italic break-words text-center min-w-0 ${
                        bubbleTranslation ? 'cursor-help underline decoration-wine/20 decoration-dotted underline-offset-2' : ''
                      }`}
                    />
                  ) : (
                    <p
                      className={`font-display text-[14px] sm:text-[15px] leading-[1.35] text-navy/70 italic break-words text-center min-w-0 ${
                        bubbleTranslation ? 'cursor-help underline decoration-wine/20 decoration-dotted underline-offset-2' : ''
                      }`}
                    >
                      «{bubbleText}»
                    </p>
                  )}
                  <div className="w-7 h-7 flex items-start justify-center pt-0.5">
                    <NarratorLinePlayButton
                      onClick={() => onReplay?.(id)}
                      label={`Replay ${n.name}`}
                      visible={!playing && !replayDisabled}
                    />
                  </div>
                </div>
                {bubbleTranslation && (
                  <p
                    role="tooltip"
                    className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-max max-w-[min(240px,calc(100vw-3rem))] -translate-x-1/2 rounded-lg border border-line/60 bg-paper px-2.5 py-2 text-[11px] sm:text-[12px] leading-snug text-navy/70 shadow-md opacity-0 invisible transition-opacity duration-200 group-hover:opacity-100 group-hover:visible pointer-events-none text-center"
                  >
                    {bubbleTranslation}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DashboardFrame({ children, levelId }) {
  return (
    <section
      id="learning-dashboard"
      className="relative flex flex-col min-h-screen max-h-[100dvh] overflow-hidden px-4 sm:px-6 py-3 sm:py-4"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-paper via-ivory/30 to-paper pointer-events-none" />
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[min(92vw,680px)] h-[280px] rounded-full bg-wine/[0.04] blur-3xl pointer-events-none" />

      <div className="relative max-w-[680px] mx-auto flex flex-col flex-1 min-h-0 w-full">
        <p className="text-center text-[10px] tracking-[0.22em] uppercase text-wine font-semibold mb-2 shrink-0">
          Parisian test · {levelId}
        </p>

        <div className="relative flex flex-col flex-1 min-h-0">
          <div className="absolute -inset-[1px] rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-wine/25 via-line/30 to-navy/15" />
          <div className="absolute -top-2 left-6 w-12 h-12 border-l-2 border-t-2 border-wine/20 rounded-tl-2xl pointer-events-none" />
          <div className="absolute -bottom-2 right-6 w-12 h-12 border-r-2 border-b-2 border-wine/20 rounded-br-2xl pointer-events-none" />

          <div className="relative rounded-[23px] sm:rounded-[27px] bg-paper/95 backdrop-blur-sm border border-white/60 shadow-[0_32px_64px_-24px_rgba(26,35,64,0.22)] overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="h-1 bg-gradient-to-r from-transparent via-wine/70 to-transparent shrink-0" />
            <div className="px-4 sm:px-7 py-4 sm:py-5 flex flex-col flex-1 min-h-0 overflow-y-auto">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LevelAssessmentDashboard({ levelId, levelTitle, onBack }) {
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

  const {
    utterances,
    partialTranscript,
    settledText,
    status,
    isRecording,
    start,
    stop,
    reset,
  } = useDeepgramTranscription();

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
    lastLineByNarrator,
    lastTranslationByNarrator,
    invalidateSession,
  } = useNarratorDialogue();

  const currentQuestion = INTRO_QUESTIONS[questionIndex];
  const isLastQuestion = questionIndex >= INTRO_QUESTIONS.length - 1;

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
    let cancelled = false;
    setIntroDelaying(true);
    (async () => {
      await wait(INTRO_AUDIO_DELAY_MS);
      if (cancelled) return;
      setIntroDelaying(false);
      await playLines(buildIntroScript(levelId));
      if (cancelled) return;
      setPhase('ready');
      setInputMode('speak');
      await playLines([{
        narrator: READY_PROMPT.narrator,
        text: READY_PROMPT.question,
        translation: READY_PROMPT.translation,
      }]);
    })();
    return () => {
      cancelled = true;
      invalidateSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (phase !== 'answering' || questionIndex === 0) return;
    clearAnswer();
    playLines([{
      narrator: currentQuestion.narrator,
      text: currentQuestion.question,
      translation: currentQuestion.translation,
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, phase]);

  const handleReadyDone = async () => {
    if (submitting || playing) return;
    setSubmitting(true);
    const trimmed = await resolveAnswerText();
    if (!trimmed) {
      setSubmitting(false);
      return;
    }

    await playLines(buildReadyFeedback(trimmed));
    clearAnswer();
    setPhase('answering');
    await playLines([{
      narrator: INTRO_QUESTIONS[0].narrator,
      text: INTRO_QUESTIONS[0].question,
      translation: INTRO_QUESTIONS[0].translation,
    }]);
    setSubmitting(false);
  };

  const handleDone = async () => {
    if (submitting || playing || phase !== 'answering') return;
    setSubmitting(true);
    setFeedbackReady(false);
    setLastFeedback(null);
    const trimmed = await resolveAnswerText();
    if (!trimmed) {
      setSubmitting(false);
      return;
    }

    const corrected = await fetchCorrection(trimmed);
    const hasMistake = hasParisianMistake(trimmed, corrected);
    const assessed = await assessAnswer(trimmed);
    const feedbackLines = linesFromFeedback(
      getQuestionFeedbackLines(feedbackStore, currentQuestion.id, hasMistake),
    );

    setAnswers((prev) => [...prev, trimmed]);
    setAssessments((prev) => [...prev, assessed]);
    setLastFeedback({
      original: trimmed,
      corrected,
      hasMistake,
      assessedLevel: assessed,
      correctionShown: false,
    });
    setPhase('feedback');
    setFeedbackReady(true);

    await playLines(feedbackLines);
    setSubmitting(false);
  };

  const submitCurrentAnswer = async () => {
    if (submitting || playing || stoppingRecording) return;
    if (phase === 'ready') await handleReadyDone();
    else if (phase === 'answering') await handleDone();
  };

  const toggleRecording = async () => {
    if (playing || submitting || stoppingRecording) return;
    if (isRecording) {
      const text = await stopRecordingForSubmit();
      if (text) await submitCurrentAnswer();
      return;
    }
    await start();
  };

  const handleCorrect = async () => {
    if (
      correcting
      || playing
      || phase !== 'feedback'
      || !lastFeedback?.original
      || !lastFeedback?.hasMistake
      || lastFeedback.correctionShown
    ) {
      return;
    }
    setCorrecting(true);
    const corrected = await fetchCorrection(lastFeedback.original);
    setLastFeedback((prev) => ({ ...prev, corrected, correctionShown: true }));
    setCorrecting(false);
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
    setReportLoading(false);
  }, [levelId]);

  const handleContinue = async () => {
    if (playing || correcting) return;

    setLastFeedback(null);
    setCorrecting(false);

    if (isLastQuestion) {
      setPhase('complete');
      const reportPromise = loadInterviewReport(answers, assessments);
      await playLines(buildFinalScript(levelId, assessments));
      await reportPromise;
      return;
    }

    clearAnswer();
    setFeedbackReady(false);
    setQuestionIndex((i) => i + 1);
    setPhase('answering');
  };

  const inputDisabled = submitting || playing || stoppingRecording;
  const showMicHint = (phase === 'ready' || phase === 'answering') && !playing && !submitting && !stoppingRecording;

  const trySubmitWrite = () => {
    if (submitting || playing || !writeText.trim()) return;
    submitCurrentAnswer();
  };

  const skipToLearnOptions = React.useCallback(async () => {
    invalidateSession();
    if (isRecording) stop();
    setIntroDelaying(false);
    setSubmitting(false);
    setStoppingRecording(false);
    setLastFeedback(null);
    setFeedbackReady(false);
    setCorrecting(false);
    setPhase('complete');

    const { answers: skipAnswers, assessments: skipAssessments } = buildDevSkipInterviewData(
      levelId,
      answers,
      assessments,
    );
    setAnswers(skipAnswers);
    setAssessments(skipAssessments);
    await loadInterviewReport(skipAnswers, skipAssessments);
  }, [invalidateSession, isRecording, stop, loadInterviewReport, levelId, answers, assessments]);

  return (
    <DashboardFrame levelId={levelId}>
      <button
        type="button"
        onClick={skipToLearnOptions}
        className="absolute top-3 right-4 sm:right-6 z-20 text-[10px] tracking-[0.16em] uppercase text-navy/30 hover:text-wine/80 transition-colors"
        title="Admin: skip interview and open learn options"
      >
        Admin skip
      </button>
      <div className="text-center mb-3 shrink-0">
        <h2 className="font-display text-[24px] sm:text-[28px] leading-[1.1] text-navy">
          Léa & Jules · <span className="italic text-wine">interview</span>
        </h2>
        <p className="mt-1 text-[12px] sm:text-[13px] text-navy/55 max-w-[440px] mx-auto line-clamp-2">
          You claimed <span className="font-medium text-navy">{levelTitle}</span>. Speak or write in French, they'll tell you what they think.
        </p>
      </div>

      <NarratorPair
        activeNarrator={activeNarrator}
        lastLineByNarrator={lastLineByNarrator}
        lastTranslationByNarrator={lastTranslationByNarrator}
        playing={playing}
        speechPlaybackTime={speechPlaybackTime}
        speechTimings={speechTimings}
        speechText={speechText}
        onReplay={replayNarratorLine}
        replayDisabled={submitting || correcting}
        askerId={
          phase === 'ready'
            ? READY_PROMPT.narrator
            : phase === 'answering'
              ? currentQuestion?.narrator
              : null
        }
      />

      <AnimatePresence mode="wait">
        {phase === 'ready' && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="mt-3 flex flex-col flex-1 min-h-0 gap-2"
          >
            <QuestionCard
              label={`${NARRATORS.jules.name} asks`}
              question={READY_PROMPT.question}
              translation={READY_PROMPT.translation}
            />
            <div className="shrink-0 mt-auto pt-1">
            <AnswerInput
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
              onToggleRecording={toggleRecording}
              disabled={inputDisabled}
              onWriteSubmit={trySubmitWrite}
              showMicHint={showMicHint && !inputDisabled}
              micHintText="say if you're ready"
            />
            <div className="mt-3 shrink-0">
              <button
                type="button"
                onClick={onBack}
                className="text-[12px] text-navy/40 hover:text-navy/65 transition-colors"
              >
                ← Pick another level
              </button>
            </div>
            </div>
          </motion.div>
        )}

        {(phase === 'answering' || phase === 'feedback') && currentQuestion && (
          <motion.div
            key={`q-${questionIndex}-${phase}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="mt-3 flex flex-col flex-1 min-h-0 gap-2"
          >
            <QuestionCard
              label={`Q${questionIndex + 1} · ${NARRATORS[currentQuestion.narrator].name}`}
              question={currentQuestion.question}
              translation={currentQuestion.translation}
              step={questionIndex + 1}
              total={INTRO_QUESTIONS.length}
            />

            {phase === 'answering' && (
              <div className="shrink-0 mt-auto pt-1">
                <AnswerInput
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
                  onToggleRecording={toggleRecording}
                  disabled={inputDisabled}
                  onWriteSubmit={trySubmitWrite}
                  showMicHint={showMicHint && !inputDisabled}
                  micHintText="answer them here"
                />
                <div className="mt-3 shrink-0">
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-[12px] text-navy/40 hover:text-navy/65 transition-colors"
                  >
                    ← Pick another level
                  </button>
                </div>
              </div>
            )}

            {phase === 'feedback' && feedbackReady && (
              <div className="mt-3 flex flex-col items-center gap-3 w-full shrink-0">
                {lastFeedback?.hasMistake && lastFeedback?.correctionShown && lastFeedback.corrected != null && (
                  <CorrectionPanel
                    original={lastFeedback.original}
                    corrected={lastFeedback.corrected}
                    questionIndex={questionIndex}
                    onPlay={handlePlayCorrection}
                    playing={playing}
                    playDisabled={correcting || submitting}
                    speechPlaybackTime={speechPlaybackTime}
                    speechTimings={speechTimings}
                    speechText={speechText}
                  />
                )}
                {lastFeedback?.hasMistake && !lastFeedback?.correctionShown ? (
                  <>
                    <p className="text-[12px] text-navy/50 italic text-center">
                      {playing ? 'Léa & Jules are reacting…' : 'Want to see how a Parisian would say it?'}
                    </p>
                    <button
                      type="button"
                      onClick={handleCorrect}
                      disabled={playing || correcting || submitting}
                      className="px-8 py-2.5 bg-wine text-ivory rounded-full font-display text-[14px] hover:bg-wine2 transition-all disabled:opacity-40 min-w-[200px]"
                    >
                      {correcting ? '…' : 'See Parisian correction'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] text-navy/50 italic text-center">
                      {playing ? 'Léa & Jules are reacting…' : 'Ready for the next one?'}
                    </p>
                    <button
                      type="button"
                      onClick={handleContinue}
                      disabled={playing || correcting}
                      className="px-8 py-2.5 bg-navy text-ivory rounded-full font-display text-[14px] hover:bg-navy/90 transition-all disabled:opacity-40 min-w-[160px]"
                    >
                      {isLastQuestion ? 'See final verdict' : 'Continue'}
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}

        {phase === 'intro' && (
          <motion.p
            key="intro-wait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center text-[13px] text-navy/45 italic shrink-0"
          >
            {introDelaying ? 'Léa & Jules are getting ready…' : playing ? 'Listen…' : 'Starting your interview…'}
          </motion.p>
        )}

        {phase === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-col items-center gap-5 shrink-0 w-full"
          >
            <div className="text-center space-y-2">
              <p className="font-display text-[20px] text-navy">Interview terminée.</p>
              <p className="text-[13px] text-navy/55 max-w-[400px] mx-auto">
                Léa & Jules rated your French — here&apos;s what stood out.
              </p>
            </div>

            <FrenchOpinionReport
              report={interviewReport}
              loading={reportLoading}
              claimedLevel={levelId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mt-6 text-center text-[13px] text-wine/75">{error}</p>
      )}
    </DashboardFrame>
  );
}
