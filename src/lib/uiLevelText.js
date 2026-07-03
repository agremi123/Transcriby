// ─────────────────────────────────────────────────────────────────────────────
//  Texte d'interface adapté au niveau de l'apprenant.
//  Règle : A1–A2 = anglais (l'élève débute, l'interface ne doit pas être un
//  obstacle) ; B1–B2 = français simple ; C1–C2 = français naturel.
//  Usage : uiText('judgeMyFrench', effectiveLevel)
// ─────────────────────────────────────────────────────────────────────────────

const BAND = { A1: 'beginner', A2: 'beginner', B1: 'mid', B2: 'mid', C1: 'adv', C2: 'adv' };

export function uiBand(level) {
  // Accepte aussi les sous-niveaux ("A2.1", "B1.2") : on lit le code CEFR de tête.
  const m = String(level || '').trim().toUpperCase().match(/^([ABC][12])/);
  return (m && BAND[m[1]]) || 'beginner';
}

// beginner / mid / adv — si une variante manque, on retombe sur la précédente.
const STRINGS = {
  // Hero (landing)
  heroTitle1:     { beginner: 'Speak French',                 mid: 'Parle français' },
  heroTitle2:     { beginner: 'Like a Parisien.',             mid: 'Comme un Parisien.', adv: 'Comme un vrai Parisien.' },
  heroSubtitle:   { beginner: "Learn Parisian French with Kru Rémi, who'll guide you to your next milestone",
                    mid: 'Le français parisien avec Kru Rémi — prochaine étape :',
                    adv: 'Le français parisien avec Kru Rémi — cap sur' },
  judgeMyFrench:  { beginner: 'Judge my French',              mid: 'Juge mon français' },
  pickChallenge:  { beginner: 'PICK YOUR CHALLENGE',          mid: 'CHOISIS TON DÉFI' },
  reading:        { beginner: 'Reading',                      mid: 'Lecture' },
  listening:      { beginner: 'Listening',                    mid: 'Écoute' },
  speaking:       { beginner: 'Speaking',                     mid: 'Oral' },
  writing:        { beginner: 'Writing',                      mid: 'Écriture' },
  discoverWord:   { beginner: 'Discover a Parisian word',     mid: 'Découvre un mot parisien' },
  startSpeaking:  { beginner: 'Start speaking',               mid: 'Commence à parler', adv: 'Lance-toi à l’oral' },

  // Dashboard « Judge my French » (titre en 3 morceaux : avant / accent / après)
  dashTitlePre:    { beginner: "How's your",                  mid: 'Il est où, ton', adv: 'Où en est ton' },
  dashTitleAccent: { beginner: 'French',                      mid: 'français' },
  dashTitlePost:   { beginner: '?',                           mid: '?' },

  // Nav
  navReach:         { beginner: 'How to reach',               mid: 'Comment atteindre' },
  navKeepImproving: { beginner: 'How to keep improving',      mid: 'Comment continuer à progresser' },

  // Assessment
  nextQuestion:   { beginner: 'Next question',                mid: 'Question suivante' },
  seeRating:      { beginner: 'See my rating',                mid: 'Voir mon niveau' },

  // My Targets (progression)
  progressTitlePre:    { beginner: 'My Parisian',             mid: 'Ma progression' },
  progressTitleAccent: { beginner: 'Progress',                mid: 'parisienne' },
  practiceNow:    { beginner: 'Practice',                     mid: 'Pratiquer' },
  continueLabel:  { beginner: 'Continue',                     mid: 'Continuer' },
  badgesTitlePre:    { beginner: 'Badges to',                 mid: 'Badges à' },
  badgesTitleAccent: { beginner: 'attain',                    mid: 'décrocher' },
};

export function uiText(key, level) {
  const entry = STRINGS[key];
  if (!entry) return '';
  const band = uiBand(level);
  if (band === 'adv') return entry.adv ?? entry.mid ?? entry.beginner;
  if (band === 'mid') return entry.mid ?? entry.beginner;
  return entry.beginner;
}
