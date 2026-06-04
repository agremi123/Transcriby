const STORAGE_KEY = 'nativa-daily-parisian-points';

export const DAILY_PARISIAN_POINTS_EVENT = 'nativa-daily-parisian-points';
export const DAILY_PARISIAN_POINTS_PER_CORRECT = 3;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadDailyParisianPoints() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: todayKey(), points: 0 };
    const parsed = JSON.parse(raw);
    if (parsed?.date !== todayKey()) return { date: todayKey(), points: 0 };
    return {
      date: parsed.date,
      points: Math.max(0, Number(parsed.points) || 0),
    };
  } catch {
    return { date: todayKey(), points: 0 };
  }
}

export function addDailyParisianPoints(amount = DAILY_PARISIAN_POINTS_PER_CORRECT) {
  const bump = Math.max(0, Number(amount) || 0);
  const current = loadDailyParisianPoints();
  const next = {
    date: todayKey(),
    points: current.points + bump,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next.points;
}
