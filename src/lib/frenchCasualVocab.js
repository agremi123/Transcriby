// Comprehensive French casual speech vocabulary for Speechmatics custom dictionary.
// Covers oral contractions, verlan, argot, filler words, and dropped-ne negations.

const FRENCH_CASUAL_VOCAB = [
  // ── Oral contractions ─────────────────────────────────────────────────────
  "j'sais", "j'vais", "j'veux", "j'peux", "j'suis", "j'ai", "j'fais",
  "j'comprends", "j'connais", "j'crois", "j'pense", "j'espère", "j'arrive",
  "j'viens", "j'reviens", "j'entends", "j'écoute", "j'regarde", "j'travaille",
  "j'mange", "j'dors", "j'rentre", "j'reste", "j'parle", "j'réponds",
  "j'attends", "j'essaie", "j'essaye", "j'me", "j't'aime",
  "chuis", "ch'uis",
  "t'as", "t'es", "t'sais", "t'fais", "t'veux", "t'peux", "t'viens",
  "t'inquiète", "t'inquiètes", "t'façon",
  "y'a", "y'en a", "y'a pas", "y'avait", "y'aura",
  "c'pas", "s'pas", "c'est pas", "c'était pas",
  "v'là", "voilà",
  "p'têt", "p't'être", "p'tit", "p'tite",
  "m'sieur", "m'dame",
  "d'acc",
  "j'm'appelle",
  "qu'est-ce", "qu'est-ce que", "qu'est-ce qui",
  "c'que", "c'qui", "c'qu'il", "c'qu'elle",

  // ── Dropped-ne negations ──────────────────────────────────────────────────
  "je sais pas", "je veux pas", "je peux pas", "je vais pas", "je fais pas",
  "je comprends pas", "je connais pas", "je crois pas", "je pense pas",
  "j'sais pas", "j'veux pas", "j'peux pas", "j'vais pas",
  "c'est pas grave", "c'est pas mal", "c'est pas possible",
  "t'es pas", "t'as pas", "y'a pas", "faut pas", "j'ai pas",
  "on fait pas", "on peut pas", "on sait pas", "on va pas",

  // ── Verlan ────────────────────────────────────────────────────────────────
  "ouf",        // fou
  "meuf",       // femme
  "keuf",       // flic
  "reuf",       // frère
  "teuf",       // fête
  "zarbi",      // bizarre
  "chelou",     // louche
  "chanmé",     // méchant (used positively)
  "relou",      // lourd / chiant
  "vénère",     // énervé
  "laisse béton", // laisse tomber
  "à donf",     // à fond
  "pécho",      // choper
  "tèj",        // jeter
  "zyva",       // vas-y
  "ripou",      // pourri
  "rebeu",      // arabe (beur reversed)
  "renoi",      // noir
  "feuj",       // juif
  "céfran",     // français
  "tromé",      // métro
  "keupon",     // punk
  "beur",       // arabe
  "beurette",
  "teup",       // pute (used casually)
  "leuch",      // chill/cool
  "skeud",      // disque
  "cimer",      // merci
  "tigo",       // gothi
  "reum",       // mère
  "reup",       // père
  "melon",      // (term for arrogant person)

  // ── Filler words & discourse markers ─────────────────────────────────────
  "euh", "bah", "ben", "bon ben", "bon bah", "eh ben",
  "genre", "style", "du genre", "du style",
  "quoi", "hein", "nan", "ouais", "mouais", "ouep", "yep",
  "allez", "allez bon", "bon allez",
  "voilà quoi", "machin", "truc", "bidule", "chose",
  "en mode", "limite", "carrément", "grave", "trop",
  "vachement", "hyper", "méga", "super", "extra",
  "franchement", "honnêtement", "clairement", "sincèrement",

  // ── Argot / Everyday slang ────────────────────────────────────────────────
  "fric", "thune", "blé", "oseille", "flouse", "pognon",
  "mec", "gars", "type", "keum",
  "nana", "meuf", "gonzesse",
  "pote", "poto", "potey", "ami",
  "kiff", "kiffer", "kiffant",
  "chiller", "chillax",
  "flemme", "j'ai la flemme", "flemmard",
  "seum", "avoir le seum",
  "ça me soûle", "ça me gonfle", "ça m'énerve",
  "taf", "taffer", "boulot", "bosser",
  "bouffer", "bouffe", "casse-dalle",
  "clope", "fumer une clope", "griller une clope",
  "se barrer", "se casser", "se tirer", "se tailler", "se pointer",
  "se planter", "galérer", "c'est la galère",
  "c'est chiant", "c'est con", "c'est naze", "c'est nul",
  "c'est ouf", "c'est chelou", "c'est relou", "c'est chaud",
  "c'est mortel", "c'est de ouf", "c'est trop bien",
  "putain", "punaise", "bordel", "merde", "la vache",
  "bolos", "boloss", "mytho", "boulet", "rageux",
  "flippant", "nickel", "tranquille", "cool", "sympa",
  "bien sûr que", "évidemment que",
  "à fond", "à donf", "grave", "carrément",
  "vachement bien", "trop bien", "trop cool", "trop bon",
  "nul à chier", "nul de chez nul",
  "c'est pas ouf", "c'est pas terrible",
  "ça déchire", "ça pète", "ça tue",
  "ça craint", "ça pue",
  "trop fort", "trop drôle", "trop marrant",
  "se marrer", "se fendre la poire", "se bidonner",
  "rigoler", "se poiler",
  "bosser comme un fou", "travailler comme un taré",
  "en avoir rien à faire", "s'en ficher", "s'en foutre",
  "ça m'en touche une sans faire bouger l'autre",
  "laisse tomber", "lâche l'affaire",
  "dans le genre", "du genre",
  "de ouf",
  "wesh", "wesh wesh",
  "aïe", "aïe aïe aïe",
  "aller chercher", "aller voir",
  "aller se faire voir",
  "direct", "illico", "illico presto",
  "pile poil", "nickel chrome",
  "bof", "mouais",
  "tant pis", "tant mieux", "peu importe",
  "c'est quoi ce truc", "c'est quoi ça",
  "ça veut dire quoi", "ça sert à quoi",
  "t'as vu", "tu vois", "tu vois ce que je veux dire",
  "j'veux dire", "je veux dire",
  "en gros", "dans les grandes lignes", "grosso modo",
  "du coup", "donc du coup",
  "à la limite", "dans le pire des cas",
  "c'est clair", "c'est évident", "ça crève les yeux",
  "ça fait longtemps", "ça fait un bail",
  "un bail", "une éternité",
  "à plus", "à plus tard", "à toute", "à toute à l'heure",
  "ciao", "tchao", "salut", "yo",
  "quand même", "tout de même",
  "en vrai", "vraiment", "pour de vrai", "pour de bon",
  "c'est pas faux", "t'as pas tort",
  "ça roule", "ça marche", "banco", "deal",
  "top", "tip top", "nickel", "parfait",
  "pas mal", "pas trop mal", "pas terrible",
  "carrément pas", "absolument pas", "hors de question",

  // ── Common casual phrases / full expressions ───────────────────────────────
  "ça va pas la tête", "t'as pas la tête à toi",
  "c'est quoi ton problème", "t'as un problème",
  "laisse-moi tranquille", "fous-moi la paix",
  "t'en fais pas", "inquiète pas",
  "on s'en fout", "j'en ai rien à faire",
  "c'est pas mes oignons", "mêle-toi de tes affaires",
  "c'est mort", "c'est cuit", "c'est foutu",
  "ça va le faire", "ça va aller",
  "j'assure", "t'assures",
  "c'est trop stylé", "c'est trop classe",
  "j'hallucine", "j'en reviens pas",
  "sans déconner", "sans blague",
  "pour rigoler", "pour de faux",
  "ça dépote", "ça déchire sa race",
];

export default FRENCH_CASUAL_VOCAB;
