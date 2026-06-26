// ─────────────────────────────────────────────────────────────────────────────
// LEVEL ADAPTATION — single source of truth for how every piece of content
// (the Parisians' conversation, reading, listening, exercises, writing, speaking)
// is tuned to the learner's CEFR level (A1 → C2).
//
// Imported by BOTH backends so they can never drift apart again:
//   - server/handlers.js (production / Vercel)
//   - vite.config.js      (local dev middlewares)
//
// Keep this file dependency-free and plain ESM so it loads in both contexts.
// ─────────────────────────────────────────────────────────────────────────────

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVEL_RANK = Object.fromEntries(CEFR_LEVELS.map((l, i) => [l, i]));

export function normalizeLevel(level) {
  const v = String(level || '').trim().toUpperCase();
  return CEFR_LEVELS.includes(v) ? v : 'A2';
}

/** beginner (A1–A2) · intermediate (B1–B2) · advanced (C1–C2). */
export function levelBand(level) {
  const i = LEVEL_RANK[normalizeLevel(level)];
  if (i <= 1) return 'beginner';
  if (i <= 3) return 'intermediate';
  return 'advanced';
}

// ─── Per-level teaching profile ──────────────────────────────────────────────
// One row per CEFR level. Every directive below is built from this so the whole
// app stays internally consistent: tweak a level here and conversation, reading,
// listening and exercises all shift together.
export const LEVEL_SPEC = {
  A1: {
    label: 'A1 (grand débutant / absolute beginner)',
    grammar: "présent de l'indicatif uniquement ; articles ; être, avoir, verbes en -er courants",
    sentences: 'phrases de 3 à 7 mots, une seule idée par phrase',
    vocab: 'les ~1000 mots les plus fréquents, concrets et du quotidien',
    slang: 'AUCUN argot, aucune contraction familière, aucune expression idiomatique',
    englishSupport: true,        // gloss hard words in English
    readWords: '80 à 120 mots',
    writeWords: '40 à 60 mots',
  },
  A2: {
    label: 'A2 (élémentaire / elementary)',
    grammar: 'présent, passé composé, futur proche (aller + infinitif), négation, articles partitifs',
    sentences: 'phrases courtes et simples, parfois reliées par et / mais / parce que',
    vocab: 'vocabulaire courant et concret du quotidien',
    slang: 'très peu d\'argot ; contractions très courantes seulement (c\'est, y a)',
    englishSupport: true,        // occasional gloss only
    readWords: '150 à 220 mots',
    writeWords: '60 à 90 mots',
  },
  B1: {
    label: 'B1 (intermédiaire / intermediate)',
    grammar: 'tous les temps courants : imparfait vs passé composé, futur simple, conditionnel, pronoms y/en et COD/COI',
    sentences: 'phrases naturelles, propositions reliées par des connecteurs courants',
    vocab: 'vocabulaire courant élargi, quelques expressions idiomatiques fréquentes',
    slang: 'contractions courantes (t\'as, j\'sais pas, j\'suis) ; argot léger expliqué brièvement si rare',
    englishSupport: false,
    readWords: '250 à 350 mots',
    writeWords: '100 à 140 mots',
  },
  B2: {
    label: 'B2 (intermédiaire avancé / upper-intermediate)',
    grammar: 'subjonctif, voix passive, discours indirect, plus-que-parfait, conditionnel passé',
    sentences: 'phrases riches, subordonnées, nuances',
    vocab: 'vocabulaire étendu, expressions idiomatiques parisiennes courantes',
    slang: 'registre parisien naturel, contractions, argot courant employé spontanément',
    englishSupport: false,
    readWords: '350 à 450 mots',
    writeWords: '150 à 200 mots',
  },
  C1: {
    label: 'C1 (avancé / advanced)',
    grammar: 'maîtrise du subjonctif (nuance indicatif/subjonctif), structures complexes imbriquées',
    sentences: 'phrases longues et variées, rythme et style soignés',
    vocab: 'vocabulaire précis et abstrait, synonymes fins, références culturelles',
    slang: 'idiomes parisiens, ironie, sous-entendus, changements de registre',
    englishSupport: false,
    readWords: '400 à 550 mots',
    writeWords: '200 à 280 mots',
  },
  C2: {
    label: 'C2 (quasi-natif / near-native)',
    grammar: 'temps littéraires, stylistique, toute la grammaire sans restriction',
    sentences: 'liberté stylistique totale, comme un natif cultivé',
    vocab: 'vocabulaire riche, littéraire, jeux de mots, allusions',
    slang: 'argot, jeux de mots, allusions culturelles, zéro simplification',
    englishSupport: false,
    readWords: '450 à 600 mots',
    writeWords: '280 à 350 mots',
  },
};

function spec(level) {
  return LEVEL_SPEC[normalizeLevel(level)];
}

// ─── Directive builders ──────────────────────────────────────────────────────
// Each returns a short string injected into an AI prompt. Kept concise on
// purpose — these run on cheap models and the output is cached, but tokens still
// cost money, so we say only what changes behaviour.

/**
 * How the Parisians (Léa & Jules) should TALK to this learner.
 * A1–A2 get short sentences + light English glosses; from B1 it's French-only
 * and progressively more idiomatic, up to full native register at C2.
 */
export function conversationDirective(level) {
  const l = normalizeLevel(level);
  const s = spec(l);
  switch (l) {
    case 'A1':
      return `NIVEAU DE L'ÉTUDIANT : ${s.label}. Réponds TRÈS court (1 phrase, max ~12 mots) et TRÈS simplement : ${s.sentences}. Grammaire : ${s.grammar}. Vocabulaire : ${s.vocab}. ${s.slang}. Pose des questions très simples (oui/non, ou « A ou B ? »). Pour 1 ou 2 mots difficiles SEULEMENT, ajoute la traduction anglaise entre parenthèses juste après, ex. « On y va (let's go) » — n'abuse pas des parenthèses. Sois très encourageant(e) ; ne corrige jamais durement, redonne plutôt la bonne phrase en modèle.`;
    case 'A2':
      return `NIVEAU DE L'ÉTUDIANT : ${s.label}. Réponds court (1-2 phrases simples) : ${s.sentences}. Grammaire : ${s.grammar}. Vocabulaire : ${s.vocab}. ${s.slang}. Si tu emploies UN mot difficile, glose-le brièvement en anglais entre parenthèses (un seul par réponse). Pose des questions simples et reste chaleureux(se).`;
    case 'B1':
      return `NIVEAU DE L'ÉTUDIANT : ${s.label}. Parle à un rythme naturel mais clair : ${s.sentences}. Tu peux employer ${s.slang}. Reste en français (plus de traduction anglaise). Pousse l'étudiant à développer ses réponses.`;
    case 'B2':
      return `NIVEAU DE L'ÉTUDIANT : ${s.label}. Parle comme un vrai Parisien : ${s.slang}, humour pince-sans-rire, rythme soutenu. Français uniquement. Attends de la nuance.`;
    case 'C1':
      return `NIVEAU DE L'ÉTUDIANT : ${s.label}. Sois exigeant(e) : ${s.slang}, aucun ménagement, rythme vif. Attends précision et spontanéité.`;
    default: // C2
      return `NIVEAU DE L'ÉTUDIANT : ${s.label}. Parle exactement comme avec un natif cultivé : ${s.slang}. Tu peux être taquin(e) et cash. Exige un français impeccable et naturel.`;
  }
}

/** Generic exercise difficulty (MCQs, practice questions). */
export function exerciseDirective(level) {
  const s = spec(level);
  const band = levelBand(level);
  if (band === 'beginner') {
    return `Adapte au niveau ${s.label} : énoncés et options très simples (${s.vocab}), grammaire limitée à ${s.grammar}. Teste une seule notion à la fois et rends les mauvaises réponses clairement distinctes.`;
  }
  if (band === 'intermediate') {
    return `Adapte au niveau ${s.label} : ${s.vocab}, grammaire jusqu'à ${s.grammar}. Distracteurs plausibles mais départageables.`;
  }
  return `Adapte au niveau ${s.label} : ${s.vocab}, grammaire incluant ${s.grammar}. Exige de la nuance ; distracteurs subtils et proches.`;
}

/** Exercises built from a reading passage. */
export function readingExerciseDirective(level) {
  return `${exerciseDirective(level)} Les exercices portent sur le texte fourni et restent à la portée d'un apprenant ${normalizeLevel(level)}.`;
}

/** Exercises built from a listening transcript. */
export function listeningExerciseDirective(level) {
  return `${exerciseDirective(level)} Les exercices portent sur la transcription audio et restent à la portée d'un apprenant ${normalizeLevel(level)}.`;
}

/** Writing challenge difficulty + target length. */
export function writingDirective(level) {
  const s = spec(level);
  return `Niveau ${s.label}. Vise un texte d'environ ${s.writeWords}. Grammaire attendue : ${s.grammar}. Vocabulaire : ${s.vocab}. Les consignes, le vocabulaire et les exemples doivent rester à ce niveau.`;
}

/** Speaking-challenge opener + target grammar/vocab difficulty. */
export function speakingPromptDirective(level) {
  const s = spec(level);
  return `Niveau ${s.label}. La question d'ouverture, la structure grammaticale cible et le vocabulaire doivent convenir à ce niveau (grammaire : ${s.grammar} ; vocabulaire : ${s.vocab}). ${spec(level).englishSupport ? 'Garde une formulation très simple et courte.' : ''}`.trim();
}

/**
 * Instruction to REWRITE a native passage/transcript down to the learner's
 * level (a "graded reader" retelling). Used only when no already-graded source
 * is available. B2+ keeps the text essentially as-is.
 */
export function gradePassageDirective(level) {
  const l = normalizeLevel(level);
  const s = spec(l);
  if (LEVEL_RANK[l] >= 3) {
    // B2 and up: keep authentic; only trim, don't dumb down.
    return `Garde le texte authentique et son niveau de langue (niveau ${s.label}). Ne simplifie pas le vocabulaire ; tu peux seulement resserrer pour la longueur.`;
  }
  return `RÉÉCRIS ce texte pour un apprenant ${s.label}, en gardant le même sujet et les mêmes faits mais en le rendant accessible : ${s.sentences} ; grammaire limitée à ${s.grammar} ; ${s.vocab}. Longueur cible : ${s.readWords}. Reste entièrement en français naturel.`;
}

/**
 * Richer replacement for the old 3-band learnerLevelContext() used by the
 * correction prompts. One concise English line the corrector can act on.
 */
export function learnerLevelContext(level) {
  const l = normalizeLevel(level);
  const band = levelBand(l);
  if (band === 'beginner') {
    return `The learner's level is ${l} (beginner). Use simple, encouraging French. Avoid slang they won't understand. Keep corrections gentle and clear.`;
  }
  if (band === 'intermediate') {
    return `The learner's level is ${l} (intermediate). Balance clarity with natural Parisian expressions; you may use common contractions and idioms.`;
  }
  return `The learner's level is ${l} (advanced). Be demanding — expect nuance, idioms, and authentic Parisian register.`;
}

// ─── Leveled content sources ─────────────────────────────────────────────────
// Each source carries a CEFR range. pickSourcesForLevel() returns the ones that
// fit the learner first, then the rest as fallback, so beginners get graded /
// slow material and advanced learners get authentic native content.

/** Podcast/audio sources for the Listening pillar, tagged by level range. */
export const LISTENING_SOURCES = [
  // A1–B1 — slow, clear, learner-made
  { id: 'duolingo',          name: 'Duolingo French Podcast',              level: 'A1-B1', rssUrl: 'https://frpodcast.libsyn.com/rss' },
  { id: 'rfi-facile',        name: 'RFI — Journal en Français Facile',     level: 'A2-B1', rssUrl: 'https://www.rfi.fr/fr/podcasts/journal-en-francais-facile/feed/' },
  { id: 'littletalk',        name: 'Little Talk in Slow French',           level: 'A2-B1', rssUrl: 'https://www.spreaker.com/show/6084166/episodes/feed', hasBuiltinTranscript: true },
  // B1–B2 — graded but natural
  { id: 'innerfrench',       name: 'InnerFrench',                          level: 'B1-B2', rssUrl: 'https://podcast.innerfrench.com/feed.xml' },
  { id: 'francaisauthentique', name: 'Français Authentique',              level: 'B1-B2', rssUrl: 'https://www.francaisauthentique.com/feed/podcast/' },
  { id: 'choses-a-savoir',   name: 'Choses à Savoir',                      level: 'B1-B2', rssUrl: 'https://podcast.ausha.co/choses-a-savoir/rss.xml' },
  // B2–C2 — authentic native
  { id: 'fc-philo',          name: "France Culture — Avec philosophie",    level: 'B2-C2', rssUrl: 'https://radiofrance-podcast.net/podcast09/rss_56107.xml' },
  { id: 'fc-histoire',       name: "France Culture — Le cours de l'histoire", level: 'B2-C2', rssUrl: 'https://radiofrance-podcast.net/podcast09/rss_11549.xml' },
  { id: 'fi-entretien',      name: 'France Inter — Le grand entretien',    level: 'B2-C2', rssUrl: 'https://radiofrance-podcast.net/podcast09/rss_13963.xml' },
  { id: 'fc-chemins',        name: 'Les Chemins de la philosophie',        level: 'C1-C2', rssUrl: 'https://radiofrance-podcast.net/podcast09/rss_14400.xml' },
];

/**
 * Reading sources, tagged by level range.
 *  - type 'rss'      : standard RSS feed; scrape the article body from item link.
 *  - type 'fabulang' : free graded short-story site (no RSS) — scrape the per-
 *                      level index page (`${base}/a1`, `/a2`…) for story links.
 *  - type 'easynews' : Easy French News graded site (feed validated at build).
 * Native press carries no per-level grading, so for A1–B1 we apply
 * gradePassageDirective() to its extracted passage.
 */
export const READING_SOURCES = [
  { id: 'fabulang',     name: 'Fabulang',        level: 'A1-A2', type: 'fabulang', base: 'https://www.fabulang.com/en/fr' },
  { id: 'easyfrnews',   name: 'Easy French News', level: 'A1-B1', type: 'easynews', base: 'https://www.easyfrenchnews.com' },
  { id: 'lactu',        name: "L'ACTU (1jour1actu)", level: 'B1-B1', type: 'rss', rssUrl: 'https://www.1jour1actu.com/feed' },
  { id: 'lemonde',      name: 'Le Monde',        level: 'B1-C2', type: 'rss', rssUrl: 'https://www.lemonde.fr/rss/une.xml' },
  { id: 'franceinfo',   name: 'France Info',     level: 'B1-C2', type: 'rss', rssUrl: 'https://www.francetvinfo.fr/titres.rss' },
  { id: 'lefigaro',     name: 'Le Figaro',       level: 'B2-C2', type: 'rss', rssUrl: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { id: '20minutes',    name: '20 Minutes',      level: 'B1-C2', type: 'rss', rssUrl: 'https://www.20minutes.fr/feeds/rss/actu.xml' },
  { id: 'liberation',   name: 'Libération',      level: 'B2-C2', type: 'rss', rssUrl: 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml' },
  { id: 'lobs',         name: "L'Obs",           level: 'B2-C2', type: 'rss', rssUrl: 'https://www.nouvelobs.com/rss.xml' },
];

function parseRange(range) {
  const parts = String(range || '').split('-');
  const lo = LEVEL_RANK[parts[0]];
  const hi = LEVEL_RANK[parts[parts.length - 1]];
  return (lo == null || hi == null) ? null : [lo, hi];
}

/**
 * Does a source's level range cover the learner's level (with a little stretch)?
 * Stretch one notch each way: a slow A2-B1 source still suits an A1 learner, and
 * a learner can reach one level up. Keeps beginners on graded/slow material while
 * giving enough sources to rotate through.
 */
export function sourceMatchesLevel(sourceLevel, learnerLevel) {
  const r = parseRange(sourceLevel);
  if (!r) return true;
  const li = LEVEL_RANK[normalizeLevel(learnerLevel)];
  return li >= r[0] - 1 && li <= r[1] + 1;
}

const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

/**
 * Sources ordered for this learner: matching ones (shuffled) first, then the
 * rest as fallback. So an A1 learner always tries Fabulang / Duolingo / RFI
 * before any native source.
 */
export function pickSourcesForLevel(sources, level) {
  const l = normalizeLevel(level);
  const matched = shuffle(sources.filter((s) => sourceMatchesLevel(s.level, l)));
  const rest = shuffle(sources.filter((s) => !sourceMatchesLevel(s.level, l)));
  return [...matched, ...rest];
}
