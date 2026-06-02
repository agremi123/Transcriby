import { findTargetByTopic } from './levelTargets';

const PROGRESS_KEY = 'nativa-target-progress';
const SELECTED_KEY = 'nativa-target-selected';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadTargetProgress() {
  return readJson(PROGRESS_KEY, {});
}

export function getTargetProgress(id) {
  const all = loadTargetProgress();
  return Math.max(0, Math.min(100, Number(all[id]) || 0));
}

export function setTargetProgress(id, percent) {
  const all = loadTargetProgress();
  all[id] = Math.max(0, Math.min(100, Math.round(percent)));
  writeJson(PROGRESS_KEY, all);
  return all[id];
}

export const PARISIAN_XP_EVENT = 'nativa-parisian-xp';

function parisianXpForBump(prev, next) {
  if (next <= prev) return 0;
  if (prev < 100 && next >= 100) return 4;
  return 2;
}

export function bumpTargetProgress(id, amount = 5) {
  const prev = getTargetProgress(id);
  const next = setTargetProgress(id, prev + amount);
  const xp = parisianXpForBump(prev, next);
  if (xp > 0) {
    window.dispatchEvent(new CustomEvent(PARISIAN_XP_EVENT, { detail: { amount: xp, targetId: id } }));
  }
  return next;
}

export function bumpTargetProgressByTopic(topic, amount = 5) {
  const target = findTargetByTopic(topic);
  if (!target) return null;
  return bumpTargetProgress(target.id, amount);
}

export function loadSelectedTargetIds() {
  return readJson(SELECTED_KEY, []);
}

export function isTargetSelected(id) {
  return loadSelectedTargetIds().includes(id);
}

export function toggleSelectedTarget(id) {
  const current = loadSelectedTargetIds();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  writeJson(SELECTED_KEY, next);
  return next;
}

export function setSelectedTargetIds(ids) {
  writeJson(SELECTED_KEY, ids);
}
