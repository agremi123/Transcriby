/** Normalize API or stored gender values to "woman" | "man". */
export function normalizeLearnerGender(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'man' || v === 'male' || v === 'homme' || v === 'm') return 'man';
  if (v === 'woman' || v === 'female' || v === 'femme' || v === 'f' || v === 'w') return 'woman';
  return null;
}

/** Infer speaker gender from first-person French in interview answers. */
export function detectLearnerGenderFromFrench(text) {
  const sample = String(text || '').toLowerCase();
  if (!sample.trim()) return 'woman';

  let fem = 0;
  let masc = 0;

  const femPatterns = [
    /\bje suis une (?:femme|fille)\b/,
    /\bje suis (?:très )?(?:contente|fatiguée|heureuse|née|allée|venue|partie|française|anglaise|parisienne|mariée)\b/,
    /\bj['']suis (?:très )?(?:contente|fatiguée|heureuse|née|allée|venue|partie)\b/,
    /\bje me suis (?:levée|installée|sentie|préparée|habillée)\b/,
    /\bje suis née\b/,
    /\bmoi c['']est .{0,30}(?:une femme|une fille)\b/,
  ];
  const mascPatterns = [
    /\bje suis un (?:homme|garçon|mec)\b/,
    /\bje suis (?:très )?(?:content|fatigué|heureux|né|allé|venu|parti|français|anglais|parisien|marié)\b/,
    /\bj['']suis (?:très )?(?:content|fatigué|heureux|né|allé|venu|parti)\b/,
    /\bje me suis (?:levé|installé|senti|préparé|habillé)\b/,
    /\bje suis né\b/,
    /\bmoi c['']est .{0,30}(?:un homme|un garçon)\b/,
  ];

  femPatterns.forEach((re) => { if (re.test(sample)) fem += 2; });
  mascPatterns.forEach((re) => { if (re.test(sample)) masc += 2; });

  if (fem > masc) return 'woman';
  if (masc > fem) return 'man';
  return 'woman';
}
