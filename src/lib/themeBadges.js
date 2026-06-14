// Tracks which "theme badges" the learner has earned. A theme badge is awarded
// when a whole theme is completed: 3 articles (Reading) or 3 podcasts (Listening),
// each with all four exercise tabs validated. Stored locally; survives reloads.

const STORAGE_KEY = 'nativa-theme-badges';
export const THEME_BADGE_EVENT = 'nativa-theme-badges';

// How many themes you must finish to fully "max out" a category badge.
export const THEME_BADGE_GOAL = 5;

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Key = `${category}::${theme}` so the same theme is never double-counted.
function badgeKey(category, theme) {
  return `${String(category || '').trim()}::${String(theme || '').trim()}`;
}

export function loadThemeBadges() {
  const data = safeLoad();
  const earnedKeys = Object.keys(data).filter((k) => data[k]);
  const countFor = (category) =>
    earnedKeys.filter((k) => k.startsWith(`${category}::`)).length;
  const themesFor = (category) =>
    earnedKeys
      .filter((k) => k.startsWith(`${category}::`))
      .map((k) => k.slice(category.length + 2));
  return {
    has: (category, theme) => !!data[badgeKey(category, theme)],
    count: countFor,
    themes: themesFor,
    total: earnedKeys.length,
  };
}

// Returns true only the first time a given (category, theme) badge is earned.
export function awardThemeBadge(category, theme) {
  if (!category || !theme) return false;
  const data = safeLoad();
  const key = badgeKey(category, theme);
  if (data[key]) return false; // already earned — no-op
  data[key] = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event(THEME_BADGE_EVENT));
  } catch {}
  return true;
}
