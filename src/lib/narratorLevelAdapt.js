import { CEFR_LEVELS, getEffectiveLevel } from './learnerProfile';

export function getLevelBand(level) {
  const idx = CEFR_LEVELS.indexOf(level);
  if (idx <= 1) return 'beginner';
  if (idx <= 3) return 'intermediate';
  return 'advanced';
}

const NARRATOR_QUIPS = {
  beginner: {
    lea: [
      { text: 'Euh… pas mal pour commencer.', translation: 'Um… not bad for a start.' },
      { text: 'On va t\'aider, t\'inquiète.', translation: 'We\'ll help you, don\'t worry.' },
      { text: 'C\'est un bon début — on peut améliorer.', translation: 'It\'s a good start — we can improve.' },
      { text: 'Lentement, on va y arriver.', translation: 'Slowly, we\'ll get there.' },
      { text: 'Pas terrible, mais on progresse.', translation: 'Not great, but we\'re making progress.' },
    ],
    jules: [
      { text: 'Bof… mais t\'apprends, c\'est ça le truc.', translation: 'Meh… but you\'re learning, that\'s the point.' },
      { text: 'C\'est pas ouf, mais c\'est normal au début.', translation: 'It\'s not amazing, but that\'s normal at first.' },
      { text: 'On va retaper ça ensemble, ok ?', translation: 'We\'ll fix this together, ok?' },
      { text: 'T\'inquiète, tout le monde commence comme ça.', translation: 'Don\'t worry, everyone starts like this.' },
      { text: 'Hmm… on va travailler dessus.', translation: 'Hmm… we\'ll work on it.' },
    ],
  },
  intermediate: {
    lea: [
      { text: 'Mouais, pas terrible…', translation: 'Yeah, not great…' },
      { text: 'Euh… c\'est pas grave, mais on peut mieux faire.', translation: 'Um… it\'s not terrible, but we can do better.' },
      { text: 'Hmm, ça sonne un peu manuel, non ?', translation: 'Hmm, it sounds a bit textbook, no?' },
      { text: 'Bon, t\'as le droit à une correction.', translation: 'Well, you get a correction.' },
      { text: 'Franchement, c\'est pas très parisien.', translation: 'Honestly, it\'s not very Parisian.' },
    ],
    jules: [
      { text: 'Mouais, bof…', translation: 'Yeah, meh…' },
      { text: 'Pas ouf, franchement.', translation: 'Not great, honestly.' },
      { text: 'Là, c\'est pas très parisien.', translation: 'That\'s not very Parisian.' },
      { text: 'On va retaper ça, d\'accord ?', translation: 'We\'ll fix that, alright?' },
      { text: 'Hmm… j\'ai entendu mieux.', translation: 'Hmm… I\'ve heard better.' },
    ],
  },
  advanced: {
    lea: [
      { text: 'Tu te débrouilles, mais le registre parisien te manque encore.', translation: 'You\'re doing fine, but you\'re still missing the Parisian register.' },
      { text: 'Presque — il manque le côté spontané du 11e.', translation: 'Almost — it\'s missing the spontaneous 11th arrondissement vibe.' },
      { text: 'Ton français est solide, mais pas encore café parisien.', translation: 'Your French is solid, but not yet café Parisian.' },
      { text: 'On peut affiner le ton, c\'est subtil.', translation: 'We can refine the tone, it\'s subtle.' },
      { text: 'Bien, mais Léa entend encore le manuel.', translation: 'Good, but Léa still hears the textbook.' },
    ],
    jules: [
      { text: 'Solide, mais trop propre pour un vrai Parisien.', translation: 'Solid, but too clean for a real Parisian.' },
      { text: 'Tu maîtrises, mais le naturel parisien n\'y est pas encore.', translation: 'You\'ve got it, but the Parisian naturalness isn\'t there yet.' },
      { text: 'Franchement pas mal — il manque juste le grain local.', translation: 'Honestly not bad — just missing the local grain.' },
      { text: 'On va peaufiner le registre, t\'es proche.', translation: 'We\'ll polish the register, you\'re close.' },
      { text: 'Presque parfait — le dernier quart est le plus dur.', translation: 'Almost perfect — the last quarter is the hardest.' },
    ],
  },
};

export function pickNarratorReaction(profileOrLevel) {
  const level = typeof profileOrLevel === 'string'
    ? profileOrLevel
    : getEffectiveLevel(profileOrLevel);
  const band = getLevelBand(level);
  const id = Math.random() < 0.5 ? 'lea' : 'jules';
  const options = NARRATOR_QUIPS[band][id];
  const picked = options[Math.floor(Math.random() * options.length)];
  return { id, ...picked };
}

export const WELCOME_LEVEL_LINES = [
  {
    narrator: 'lea',
    text: 'Salut ! Bienvenue sur Nativa. Dis-nous : tu te sens à quel niveau en français ?',
    translation: 'Hi! Welcome to Nativa. What level do you think you\'re at in French?',
  },
  {
    narrator: 'jules',
    text: 'Sois honnête — on s\'adapte à toi dès le départ.',
    translation: 'Be honest — we\'ll adapt to you from the start.',
  },
];

export const LEVEL_PICKER = [
  { id: 'A1', label: 'A1', hint: 'Bébé parisien' },
  { id: 'A2', label: 'A2', hint: 'Baguette Enjoyer' },
  { id: 'B1', label: 'B1', hint: 'Camembert Professional' },
  { id: 'B2', label: 'B2', hint: 'Louvre Regular' },
  { id: 'C1', label: 'C1', hint: 'Terrasse Philosopher' },
  { id: 'C2', label: 'C2', hint: "Macron's Apprentice" },
];

const LEVEL_ROLE_BY_ID = Object.fromEntries(LEVEL_PICKER.map(({ id, hint }) => [id, hint]));

export function getLevelRole(level) {
  const id = String(level || '').trim().toUpperCase();
  return LEVEL_ROLE_BY_ID[id] || LEVEL_ROLE_BY_ID.A1;
}

export function getRoleProgression(parisianPercent, level) {
  const currentLevel = CEFR_LEVELS.includes(level) ? level : 'A1';
  const idx = CEFR_LEVELS.indexOf(currentLevel);
  const nextLevel = CEFR_LEVELS[idx + 1] || null;

  return {
    currentRole: getLevelRole(currentLevel),
    nextRole: nextLevel ? getLevelRole(nextLevel) : null,
    nextLevel,
    progress: Math.max(0, Math.min(100, Number(parisianPercent) || 0)),
  };
}

export function getLevelPickMockery(level) {
  const mockery = {
    A1: {
      narrator: 'lea',
      text: "A1 ? Bon… on va pas te juger trop fort.",
      translation: 'A1? OK… we won\'t judge you too harshly.',
    },
    A2: {
      narrator: 'jules',
      text: "A2 ? Tu prétends, ou tu sais vraiment ?",
      translation: 'A2? Are you claiming it, or do you actually know?',
    },
    B1: {
      narrator: 'lea',
      text: "B1 ? Hmm… j'ai des doutes.",
      translation: 'B1? Hmm… I have my doubts.',
    },
    B2: {
      narrator: 'jules',
      text: "B2 ? La barre est haute, hein.",
      translation: 'B2? The bar is high, huh.',
    },
    C1: {
      narrator: 'lea',
      text: "C1 ? Là, y a pas le droit à l'erreur.",
      translation: 'C1? No room for mistakes there.',
    },
    C2: {
      narrator: 'jules',
      text: "C2 ? Franchement… t'as de la confiance.",
      translation: 'C2? Honestly… you\'ve got confidence.',
    },
  };
  return mockery[level] || mockery.B1;
}

/** @deprecated use getLevelPickMockery */
export function getLevelConfirmLine(level) {
  return getLevelPickMockery(level);
}

export function getRepeatPrompt(narratorId) {
  const prompts = {
    lea: {
      text: 'Allez, répète la phrase après moi.',
      translation: 'Go on, repeat the sentence after me.',
    },
    jules: {
      text: 'À toi — répète la phrase, exactement.',
      translation: 'Your turn — repeat the sentence, exactly.',
    },
  };
  const id = narratorId === 'jules' ? 'jules' : 'lea';
  return { id, ...prompts[id] };
}

export function getRepeatSuccessLine(narratorId) {
  const lines = {
    lea: {
      text: 'Voilà ! Plus un pourcent de Parisien.',
      translation: 'There! One more Parisian percent.',
    },
    jules: {
      text: 'Nickel. Tu gagnes un point de Parisien.',
      translation: 'Perfect. You earn a Parisian point.',
    },
  };
  const id = narratorId === 'jules' ? 'jules' : 'lea';
  return { id, ...lines[id] };
}

export function getRepeatFailLine(narratorId) {
  const lines = {
    lea: {
      text: 'Pas tout à fait — réessaie.',
      translation: 'Not quite — try again.',
    },
    jules: {
      text: 'Hmm, pas exactement. Encore une fois.',
      translation: 'Hmm, not exactly. Once more.',
    },
  };
  const id = narratorId === 'jules' ? 'jules' : 'lea';
  return { id, ...lines[id] };
}

const ALREADY_CORRECT_LINES = {
  lea: [
    {
      text: 'Franchement, c\'est déjà très parisien — bravo !',
      translation: 'Honestly, that\'s already very Parisian — well done!',
    },
    {
      text: 'Rien à dire, c\'est carré — t\'as le ton.',
      translation: 'Nothing to add, it\'s solid — you\'ve got the tone.',
    },
    {
      text: 'Là, c\'est du vrai parisien. J\'accuse.',
      translation: 'That\'s the real Parisian deal. I approve.',
    },
    {
      text: 'Pas mal du tout — on dirait que t\'habites le 11e.',
      translation: 'Not bad at all — sounds like you live in the 11th.',
    },
    {
      text: 'C\'est bon, vraiment — t\'as capté le registre.',
      translation: 'It\'s good, really — you\'ve got the register.',
    },
  ],
  jules: [
    {
      text: 'Nickel, rien à corriger — c\'est carrément bon.',
      translation: 'Perfect, nothing to fix — that\'s genuinely good.',
    },
    {
      text: 'Franchement, c\'est déjà très parisien. Respect.',
      translation: 'Honestly, that\'s already very Parisian. Respect.',
    },
    {
      text: 'Là, y a rien à retoucher — c\'est propre.',
      translation: 'Nothing to touch up — it\'s clean.',
    },
    {
      text: 'C\'est bon, mec — t\'as le flow parisien.',
      translation: 'It\'s good, mate — you\'ve got the Parisian flow.',
    },
    {
      text: 'Pas besoin de moi là-dessus — c\'est déjà carré.',
      translation: 'Don\'t need me on this one — it\'s already solid.',
    },
  ],
};

const lastAlreadyCorrectPick = { lea: -1, jules: -1 };

export function getAlreadyCorrectLine(narratorId) {
  const id = narratorId === 'jules' ? 'jules' : 'lea';
  const options = ALREADY_CORRECT_LINES[id];
  let idx = Math.floor(Math.random() * options.length);
  if (options.length > 1) {
    while (idx === lastAlreadyCorrectPick[id]) {
      idx = Math.floor(Math.random() * options.length);
    }
  }
  lastAlreadyCorrectPick[id] = idx;
  return { id, ...options[idx] };
}

export function flattenNarratorLinesForRegistry() {
  const lines = [
    ...WELCOME_LEVEL_LINES,
    ...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => getLevelPickMockery(level)),
    ...ALREADY_CORRECT_LINES.lea,
    ...ALREADY_CORRECT_LINES.jules,
    getRepeatPrompt('lea'),
    getRepeatPrompt('jules'),
    getRepeatSuccessLine('lea'),
    getRepeatSuccessLine('jules'),
    getRepeatFailLine('lea'),
    getRepeatFailLine('jules'),
  ];

  for (const level of CEFR_LEVELS) {
    lines.push(getNarratorIntro('lea', level));
    lines.push(getNarratorIntro('jules', level));
  }

  for (const band of Object.values(NARRATOR_QUIPS)) {
    for (const narratorLines of Object.values(band)) {
      lines.push(...narratorLines);
    }
  }

  lines.push(
    { text: "Grammaticalement, celle-là elle passe. Rien à redire.", translation: 'Grammar-wise, that one works. Nothing to fix.' },
    { text: 'Rien à corriger, Léa valide celle-là.', translation: 'Nothing to fix — Léa approves that one.' },
  );

  return lines;
}

export function getLevelChallengeScript(levelId) {
  const levelLines = {
    A1: { text: "Tu t'es mis débutant… intéressant.", translation: 'You put yourself as a beginner… interesting.' },
    A2: { text: 'Tu prétends être élémentaire ? On va voir.', translation: 'You claim elementary level? We\'ll see.' },
    B1: { text: "B1, tu dis ? Hmm, j'ai des doutes.", translation: 'B1, you say? Hmm, I have doubts.' },
    B2: { text: 'Upper intermediate… la barre est haute, hein.', translation: 'Upper intermediate… the bar is high, huh.' },
    C1: { text: "C1 ? Là, y a pas le droit à l'erreur.", translation: 'C1? No room for mistakes there.' },
  };
  const level = levelLines[levelId] || {
    text: `Tu te mets ${levelId} ? On va vérifier.`,
    translation: `You claim ${levelId}? Let's check.`,
  };

  return [
    {
      narrator: 'lea',
      text: `Salut ! Bienvenue. ${level.text}`,
      translation: `Hi! Welcome. ${level.translation}`,
    },
    {
      narrator: 'jules',
      text: "Exactement. Léa et moi, on veut savoir si ton français est vraiment à ce niveau.",
      translation: 'Exactly. Léa and I want to know if your French is really at that level.',
    },
    {
      narrator: 'lea',
      text: "Parle comme un vrai Parisien, pas comme dans un manuel. Accent, rythme, naturel.",
      translation: 'Speak like a real Parisian, not like in a textbook. Accent, rhythm, natural flow.',
    },
    {
      narrator: 'jules',
      text: "On est sympas… mais si tu parles mal, on te le dira cash. Pas de complaisance.",
      translation: 'We\'re nice… but if you speak badly, we\'ll tell you straight. No sugar-coating.',
    },
    {
      narrator: 'lea',
      text: "Allez, montre-nous ce que tu sais faire. On t'écoute.",
      translation: 'Come on, show us what you can do. We\'re listening.',
    },
  ];
}
export function getNarratorIntro(narratorId, level) {
  const band = getLevelBand(level);
  const id = narratorId === 'jules' ? 'jules' : 'lea';

  if (id === 'lea') {
    const endings = {
      beginner: {
        text: 'Bienvenue — on y va pas à pas !',
        translation: 'Welcome — we\'ll take it step by step!',
      },
      advanced: {
        text: 'Bienvenue — on va viser le vrai registre parisien.',
        translation: 'Welcome — we\'re aiming for true Parisian register.',
      },
      intermediate: {
        text: 'Bienvenue !',
        translation: 'Welcome!',
      },
    };
    const ending = endings[band] || endings.intermediate;
    return {
      text: `Bonjour ! Moi c'est Léa, j'ai 24 ans et je suis parisienne. Je suis là pour t'aider à parler un français vrai, celui qu'on entend dans les cafés du 11e. ${ending.text}`,
      translation: `Hi! I'm Léa, I'm 24 and Parisian. I'm here to help you speak real French, the kind you hear in cafés in the 11th. ${ending.translation}`,
    };
  }

  return {
    text: "Salut ! Moi c'est Jules, 26 ans, né à Paris. Je vais t'accompagner pour que ton français sonne naturel, pas comme dans les manuels. Allez, on y va !",
    translation: "Hey! I'm Jules, 26, born in Paris. I'll help your French sound natural, not like textbooks. Let's go!",
  };
}

/** @deprecated use getNarratorIntro */
export function adaptNarratorIntro(intro, level) {
  const id = intro.includes('Jules') ? 'jules' : 'lea';
  return getNarratorIntro(id, level).text;
}

