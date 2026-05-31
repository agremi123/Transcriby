import { CEFR_LEVELS } from './learnerProfile';
import { getLevelRole, getRoleProgression } from './narratorLevelAdapt';

/** Practice goals to bridge each CEFR gap — topic strings feed /api/practice. */
const TARGETS_BY_TRANSITION = {
  'A1-A2': [
    { id: 'a1-a2-present-er', category: 'Grammar', label: 'Present tense (-er verbs)', description: 'Conjugate regular -er verbs in everyday sentences.', topic: 'French present tense regular -er verbs' },
    { id: 'a1-a2-etre-avoir', category: 'Grammar', label: 'Être & avoir', description: 'Use the two essential verbs confidently in context.', topic: 'French être and avoir in present tense' },
    { id: 'a1-a2-questions', category: 'Speaking', label: 'Ask simple questions', description: 'Form questions with intonation, est-ce que, and inversion.', topic: 'French question formation A2' },
    { id: 'a1-a2-partitive', category: 'Grammar', label: 'Partitive articles', description: 'Choose du, de la, de l\', des, and omit correctly.', topic: 'French partitive articles du de la des' },
    { id: 'a1-a2-futur-proche', category: 'Grammar', label: 'Near future', description: 'Talk about plans with aller + infinitive.', topic: 'French futur proche aller infinitive' },
    { id: 'a1-a2-passe-compose-intro', category: 'Grammar', label: 'Passé composé (avoir)', description: 'Describe completed past actions with avoir.', topic: 'French passé composé with avoir A2' },
    { id: 'a1-a2-adjectives', category: 'Grammar', label: 'Adjective agreement', description: 'Match gender and number in basic descriptions.', topic: 'French adjective agreement gender number' },
    { id: 'a1-a2-negation', category: 'Grammar', label: 'Negation', description: 'Build ne…pas and common negative forms.', topic: 'French negation ne pas' },
    { id: 'a1-a2-cafe', category: 'Parisian', label: 'Order at a café', description: 'Sound natural ordering coffee and pastries in Paris.', topic: 'French café ordering Parisian expressions' },
    { id: 'a1-a2-greetings', category: 'Parisian', label: 'Parisian greetings', description: 'Salut, coucou, ça va — not just textbook bonjour.', topic: 'Parisian greetings and introductions' },
    { id: 'a1-a2-time', category: 'Vocabulary', label: 'Time & dates', description: 'Say the hour, days, months, and simple schedules.', topic: 'French telling time dates days months' },
    { id: 'a1-a2-daily', category: 'Speaking', label: 'Daily routine', description: 'Describe your morning-to-evening in linked sentences.', topic: 'French daily routine vocabulary and verbs' },
  ],
  'A2-B1': [
    { id: 'a2-b1-pc-vs-imp', category: 'Grammar', label: 'Passé composé vs imparfait', description: 'Pick the right past tense for ongoing vs completed actions.', topic: 'French passé composé vs imparfait' },
    { id: 'a2-b1-future', category: 'Grammar', label: 'Future simple', description: 'Talk about what will happen with futur simple.', topic: 'French futur simple conjugation' },
    { id: 'a2-b1-conditional', category: 'Grammar', label: 'Conditional present', description: 'Express wishes, politeness, and hypotheticals.', topic: 'French conditional present mood' },
    { id: 'a2-b1-object-pronouns', category: 'Grammar', label: 'Object pronouns', description: 'Place le, la, les, me, te, nous, vous correctly.', topic: 'French direct indirect object pronouns' },
    { id: 'a2-b1-y-en', category: 'Grammar', label: 'Y & en', description: 'Replace places and quantities with y and en.', topic: 'French pronouns y and en' },
    { id: 'a2-b1-relative', category: 'Grammar', label: 'Relative pronouns', description: 'Link ideas with qui, que, and où.', topic: 'French relative pronouns qui que où' },
    { id: 'a2-b1-subjunctive-intro', category: 'Grammar', label: 'Subjunctive triggers', description: 'Recognise il faut que, je veux que, and similar patterns.', topic: 'French subjunctive triggers il faut que' },
    { id: 'a2-b1-opinions', category: 'Speaking', label: 'Give your opinion', description: 'Agree, disagree, and justify with connectors.', topic: 'French expressing opinions B1' },
    { id: 'a2-b1-connectors', category: 'Speaking', label: 'Link your ideas', description: 'Use donc, cependant, par contre, en revanche.', topic: 'French discourse connectors B1' },
    { id: 'a2-b1-hypothesis', category: 'Grammar', label: 'Si + imparfait', description: 'Build simple if-clauses for unreal situations.', topic: 'French si clauses imparfait conditional' },
    { id: 'a2-b1-informal', category: 'Parisian', label: 'Informal register', description: 'Drop textbook tone — sound like a local friend.', topic: 'Parisian informal French register' },
    { id: 'a2-b1-travel', category: 'Vocabulary', label: 'Travel & transport', description: 'Metro, RER, tickets, delays — Paris in motion.', topic: 'French travel transport Paris vocabulary' },
  ],
  'B1-B2': [
    { id: 'b1-b2-subjunctive', category: 'Grammar', label: 'Subjunctive mastery', description: 'Use subjunctive vs indicative with confidence.', topic: 'French subjunctive mood B2' },
    { id: 'b1-b2-passive', category: 'Grammar', label: 'Passive voice', description: 'Shift focus with être + past participle.', topic: 'French passive voice formation' },
    { id: 'b1-b2-reported', category: 'Grammar', label: 'Reported speech', description: 'Report what someone said with tense shifts.', topic: 'French reported speech discours indirect' },
    { id: 'b1-b2-plus-que-parfait', category: 'Grammar', label: 'Plus-que-parfait', description: 'Describe something that had already happened.', topic: 'French plus-que-parfait' },
    { id: 'b1-b2-conditional-past', category: 'Grammar', label: 'Past conditional', description: 'Express regrets and unreal past (aurais dû…).', topic: 'French past conditional aurait dû' },
    { id: 'b1-b2-dont', category: 'Grammar', label: 'Relative pronoun dont', description: 'Talk about quantities and possessions with dont.', topic: 'French relative pronoun dont' },
    { id: 'b1-b2-debate', category: 'Speaking', label: 'Debate & nuance', description: 'Argue a point with structured pros and cons.', topic: 'French debate argumentation B2' },
    { id: 'b1-b2-idioms', category: 'Parisian', label: 'Parisian idioms', description: 'Use expressions locals actually say on the terrace.', topic: 'Parisian French idiomatic expressions' },
    { id: 'b1-b2-register', category: 'Parisian', label: 'Tu vs vous', description: 'Switch register appropriately in social contexts.', topic: 'French tu vs vous register' },
    { id: 'b1-b2-media', category: 'Vocabulary', label: 'News & media', description: 'Discuss headlines, culture, and current topics.', topic: 'French media news vocabulary B2' },
    { id: 'b1-b2-cause-effect', category: 'Speaking', label: 'Cause & consequence', description: 'Explain why and what follows with precision.', topic: 'French cause consequence connectors' },
    { id: 'b1-b2-storytelling', category: 'Speaking', label: 'Tell a story', description: 'Hold attention with a clear narrative arc in past tenses.', topic: 'French storytelling past tenses B2' },
  ],
  'B2-C1': [
    { id: 'b2-c1-subjunctive-nuance', category: 'Grammar', label: 'Subjunctive nuance', description: 'Feel when indicative is actually the Parisian choice.', topic: 'French subjunctive vs indicative nuance C1' },
    { id: 'b2-c1-style', category: 'Speaking', label: 'Style & rhetoric', description: 'Vary sentence length and rhythm like a native speaker.', topic: 'French rhetorical style advanced' },
    { id: 'b2-c1-irony', category: 'Parisian', label: 'Irony & understatement', description: 'Catch and use Parisian dry humour.', topic: 'Parisian irony understatement humour' },
    { id: 'b2-c1-complex-sentences', category: 'Grammar', label: 'Complex sentences', description: 'Embed clauses without losing clarity.', topic: 'French complex sentence structures C1' },
    { id: 'b2-c1-precision', category: 'Vocabulary', label: 'Precise vocabulary', description: 'Pick the exact word — not the approximate one.', topic: 'French precise vocabulary synonyms C1' },
    { id: 'b2-c1-spontaneous', category: 'Speaking', label: 'Spontaneous speech', description: 'Speak without planning every clause first.', topic: 'French spontaneous oral expression C1' },
    { id: 'b2-c1-culture', category: 'Parisian', label: 'Cultural references', description: 'Follow jokes, refs, and shared Paris culture.', topic: 'Parisian cultural references conversation' },
    { id: 'b2-c1-register-shift', category: 'Parisian', label: 'Micro-register shifts', description: 'Adjust tone between mates, colleagues, and strangers.', topic: 'French register shifting social contexts' },
    { id: 'b2-c1-doubt', category: 'Speaking', label: 'Doubt & certainty', description: 'Express fine-grained epistemic nuance.', topic: 'French expressing doubt certainty nuance' },
    { id: 'b2-c1-professional', category: 'Speaking', label: 'Professional French', description: 'Hold your own in meetings and presentations.', topic: 'French professional workplace communication C1' },
  ],
  'C1-C2': [
    { id: 'c1-c2-spontaneity', category: 'Speaking', label: 'Zero-hesitation flow', description: 'Keep talking naturally under pressure.', topic: 'French near-native oral fluency C2' },
    { id: 'c1-c2-wordplay', category: 'Parisian', label: 'Wordplay & puns', description: 'Play with double meanings like a local comedian.', topic: 'French wordplay jeux de mots' },
    { id: 'c1-c2-academic', category: 'Vocabulary', label: 'Academic register', description: 'Write and speak with scholarly precision.', topic: 'French academic register vocabulary C2' },
    { id: 'c1-c2-literary', category: 'Vocabulary', label: 'Literary awareness', description: 'Recognise literary tenses and elevated style.', topic: 'French literary tenses and style' },
    { id: 'c1-c2-improv', category: 'Speaking', label: 'Improvisation', description: 'Respond instantly to unexpected questions.', topic: 'French improvisation spontaneous debate C2' },
    { id: 'c1-c2-slang', category: 'Parisian', label: 'Street Parisian', description: 'Understand casual banlieue & café slang safely.', topic: 'Parisian street slang expressions' },
    { id: 'c1-c2-micro', category: 'Parisian', label: 'Micro-accents', description: 'Fine-tune vowels, liaisons, and intonation patterns.', topic: 'French pronunciation liaison intonation C2' },
    { id: 'c1-c2-storytelling-pro', category: 'Speaking', label: 'Master storytelling', description: 'Captivate with pace, humour, and perfect tense control.', topic: 'French advanced storytelling C2' },
  ],
};

function transitionKey(currentLevel, nextLevel) {
  return `${currentLevel}-${nextLevel}`;
}

export function getNextLevel(currentLevel) {
  const level = CEFR_LEVELS.includes(currentLevel) ? currentLevel : 'A2';
  const idx = CEFR_LEVELS.indexOf(level);
  return idx >= 0 && idx < CEFR_LEVELS.length - 1 ? CEFR_LEVELS[idx + 1] : null;
}

export function getLevelTargets(currentLevel, parisianPercent = 0) {
  const level = CEFR_LEVELS.includes(currentLevel) ? currentLevel : 'A2';
  const nextLevel = getNextLevel(level);
  const progression = getRoleProgression(parisianPercent, level);

  if (!nextLevel) {
    return {
      currentLevel: level,
      currentRole: getLevelRole(level),
      nextLevel: null,
      nextRole: null,
      transitionKey: null,
      targets: TARGETS_BY_TRANSITION['C1-C2'],
      atMaxLevel: true,
      progress: progression.progress,
    };
  }

  const key = transitionKey(level, nextLevel);
  return {
    currentLevel: level,
    currentRole: getLevelRole(level),
    nextLevel,
    nextRole: getLevelRole(nextLevel),
    transitionKey: key,
    targets: TARGETS_BY_TRANSITION[key] || [],
    atMaxLevel: false,
    progress: progression.progress,
  };
}

export function findTargetByTopic(topic) {
  const needle = String(topic || '').trim().toLowerCase();
  if (!needle) return null;
  for (const list of Object.values(TARGETS_BY_TRANSITION)) {
    const hit = list.find((t) => t.topic.toLowerCase() === needle || t.id === needle);
    if (hit) return hit;
  }
  return null;
}

export function findTargetById(id) {
  for (const list of Object.values(TARGETS_BY_TRANSITION)) {
    const hit = list.find((t) => t.id === id);
    if (hit) return hit;
  }
  return null;
}

export const TARGET_CATEGORIES = ['Grammar', 'Vocabulary', 'Speaking', 'Parisian'];
