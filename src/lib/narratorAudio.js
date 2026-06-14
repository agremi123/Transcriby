import React from 'react';
import { buildWordTimings, playDecodedBuffer } from './speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from './siteAudio';
import { tapSource, startLine, setPlaybackTime, stopLine } from './lipSync';

export const NARRATORS = {
  lea: { id: 'lea', name: 'Léa', src: '/assets/lea.png' },
  jules: { id: 'jules', name: 'Jules', src: '/assets/jules.png' },
};

/** Playback gain — Léa's ElevenLabs voice runs hotter than Jules. */
export const NARRATOR_VOLUME = {
  lea: 0.85,
  stella: 0.85,
  jules: 1,
  alex: 1,
};

export function getNarratorVolume(narrator) {
  return NARRATOR_VOLUME[narrator] ?? 1;
}

export function connectNarratorSource(ctx, source, narrator) {
  const gain = ctx.createGain();
  gain.gain.value = getNarratorVolume(narrator);
  source.connect(gain);
  gain.connect(ctx.destination);
  // Feed the 3D avatar's mouth from the live voice (no-op if no avatar mounted).
  tapSource(ctx, source);
  return gain;
}

export function resolveClientNarrator(narrator = 'lea') {
  return narrator === 'jules' || narrator === 'alex' ? 'jules' : 'lea';
}

export function normalizeNarratorId(narrator) {
  const id = String(narrator || '').trim().toLowerCase();
  if (id === 'jules' || id === 'alex') return 'jules';
  return 'lea';
}

// ── Persistent audio cache (IndexedDB) ──────────────────────────────────────
const IDB_NAME = 'nativa-narrator-audio';
const IDB_VERSION = 1;
const IDB_STORE = 'audio';

function openAudioCacheDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_STORE);
  });
}

async function idbGet(key) {
  try {
    const db = await openAudioCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch { return null; }
}

async function idbPut(key, value) {
  try {
    const db = await openAudioCacheDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {}
}

// ── In-memory L1 cache ───────────────────────────────────────────────────────
const narratorAudioCache = new Map();

function cacheKey(text, narrator) {
  return `${resolveClientNarrator(narrator)}:${text.trim()}`;
}

export async function readNarratorAudioResponse(res) {
  if (!res.ok) throw new Error('TTS unavailable');
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!data?.audioUrl) throw new Error('TTS unavailable');
    const audioRes = await fetch(data.audioUrl);
    if (!audioRes.ok) throw new Error('TTS unavailable');
    return audioRes.arrayBuffer();
  }
  return res.arrayBuffer();
}

export async function fetchNarratorAudio(text, narrator) {
  const trimmed = text.trim();
  const key = cacheKey(trimmed, narrator);

  // L1 — in-memory
  const memCached = narratorAudioCache.get(key);
  if (memCached) return memCached.slice(0);

  // L2 — IndexedDB (persists across reloads)
  const stored = await idbGet(key);
  if (stored) {
    narratorAudioCache.set(key, stored);
    return stored.slice(0);
  }

  // L3 — ElevenLabs API
  const res = await fetch('/api/elevenlabs-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: trimmed, narrator: resolveClientNarrator(narrator) }),
  });

  if (!res.ok) throw new Error('TTS unavailable');

  const buf = await readNarratorAudioResponse(res);
  narratorAudioCache.set(key, buf.slice(0));
  idbPut(key, buf.slice(0)); // fire-and-forget — don't block playback
  return buf;
}

function playBuffer(ctx, sourceRef, buffer, narrator, onSpeechTick, playbackSession) {
  return playDecodedBuffer(ctx, {
    buffer,
    narrator,
    sourceRef,
    connectSource: connectNarratorSource,
    onTimeUpdate: onSpeechTick,
    playbackSession,
  });
}

export function useNarratorDialogue() {
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);
  const [lineIndex, setLineIndex] = React.useState(-1);
  const [lines, setLines] = React.useState([]);
  const [playing, setPlaying] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [replayNarrator, setReplayNarrator] = React.useState(null);
  const [spokenLinesByNarrator, setSpokenLinesByNarrator] = React.useState({ lea: null, jules: null });
  const [lastLineByNarrator, setLastLineByNarrator] = React.useState({ lea: null, jules: null });
  const [lastTranslationByNarrator, setLastTranslationByNarrator] = React.useState({ lea: null, jules: null });
  const [speechPlaybackTime, setSpeechPlaybackTime] = React.useState(null);
  const [speechTimings, setSpeechTimings] = React.useState([]);
  const [speechText, setSpeechText] = React.useState(null);
  const scriptLineByNarratorRef = React.useRef({ lea: null, jules: null });

  const clearSpeechHighlight = React.useCallback(() => {
    setSpeechPlaybackTime(null);
    setSpeechTimings([]);
    setSpeechText(null);
  }, []);

  const rememberSpokenLine = React.useCallback((line) => {
    const narrator = normalizeNarratorId(line?.narrator);
    const text = String(line?.text ?? '').trim();
    if (!text) return;

    const normalized = {
      narrator,
      text,
      translation: line?.translation ?? null,
    };

    scriptLineByNarratorRef.current = {
      ...scriptLineByNarratorRef.current,
      [narrator]: normalized,
    };
    setSpokenLinesByNarrator((prev) => ({ ...prev, [narrator]: normalized }));
    setLastLineByNarrator((prev) => ({ ...prev, [narrator]: text }));
    if (normalized.translation) {
      setLastTranslationByNarrator((prev) => ({ ...prev, [narrator]: normalized.translation }));
    }
  }, []);

  const stopAudio = React.useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    clearSpeechHighlight();
  }, [clearSpeechHighlight]);

  React.useEffect(() => registerSiteAudioStop(stopAudio), [stopAudio]);

  const invalidateSession = React.useCallback(() => {
    sessionRef.current += 1;
    stopAudio();
    setPlaying(false);
    setReplayNarrator(null);
  }, [stopAudio]);

  const pauseNarratorPlayback = invalidateSession;

  const clearNarratorLines = React.useCallback(() => {
    scriptLineByNarratorRef.current = { lea: null, jules: null };
    setSpokenLinesByNarrator({ lea: null, jules: null });
    setLastLineByNarrator({ lea: null, jules: null });
    setLastTranslationByNarrator({ lea: null, jules: null });
  }, []);

  const playDecodedLine = React.useCallback(async (ctx, line, decoded, isActive, siteSession) => {
    if (!isActive() || !isSiteAudioPlaybackCurrent(siteSession)) return;
    setSpeechText(line.text);
    setSpeechTimings(buildWordTimings(line.text, decoded.duration));
    setSpeechPlaybackTime(0);
    await playBuffer(ctx, sourceRef, decoded, line.narrator, (t) => {
      if (!isActive()) return;
      setSpeechPlaybackTime(t);
      if (t == null) clearSpeechHighlight();
    }, siteSession);
  }, [clearSpeechHighlight]);

  const playLines = React.useCallback(async (scriptLines) => {
    const siteSession = beginSiteAudioPlayback();
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setError(null);
    setLines(scriptLines);
    setLineIndex(-1);
    setPlaying(true);

    const isActive = () => sessionRef.current === session && isSiteAudioPlaybackCurrent(siteSession);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (!isActive()) return false;

      for (let i = 0; i < scriptLines.length; i++) {
        if (!isActive()) return false;
        setLineIndex(i);
        const line = scriptLines[i];
        rememberSpokenLine(line);
        const buf = await fetchNarratorAudio(line.text, line.narrator);
        if (!isActive()) return false;
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        if (!isActive()) return false;
        await playDecodedLine(ctx, line, decoded, isActive, siteSession);
      }

      return isActive();
    } catch {
      if (isActive()) setError('Audio unavailable — read the text on screen.');
      return isActive();
    } finally {
      if (isActive()) {
        clearSpeechHighlight();
        setPlaying(false);
      }
    }
  }, [rememberSpokenLine, playDecodedLine, clearSpeechHighlight]);

  const replayNarratorLine = React.useCallback(async (narratorId) => {
    const id = normalizeNarratorId(narratorId);
    const line = scriptLineByNarratorRef.current[id];
    if (!line || line.narrator !== id) return;

    const siteSession = beginSiteAudioPlayback();
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setError(null);
    setReplayNarrator(narratorId);
    setPlaying(true);

    const isActive = () => sessionRef.current === session && isSiteAudioPlaybackCurrent(siteSession);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (!isActive()) return;

      const buf = await fetchNarratorAudio(line.text, line.narrator);
      if (!isActive()) return;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (!isActive()) return;
      await playDecodedLine(ctx, line, decoded, isActive, siteSession);
    } catch {
      if (isActive()) setError('Audio unavailable — read the text on screen.');
    } finally {
      if (isActive()) {
        setReplayNarrator(null);
        clearSpeechHighlight();
        setPlaying(false);
      }
    }
  }, [playDecodedLine, clearSpeechHighlight]);

  /** Play one line aloud without updating portrait bubble text. */
  const playNarratorLineAudioOnly = React.useCallback(async (line) => {
    if (!line?.text || !line?.narrator) return;

    const siteSession = beginSiteAudioPlayback();
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setError(null);
    setReplayNarrator(line.narrator);
    setPlaying(true);

    const isActive = () => sessionRef.current === session && isSiteAudioPlaybackCurrent(siteSession);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (!isActive()) return;

      const buf = await fetchNarratorAudio(line.text, line.narrator);
      if (!isActive()) return;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (!isActive()) return;
      await playDecodedLine(ctx, line, decoded, isActive, siteSession);
    } catch {
      if (isActive()) setError('Audio unavailable — read the text on screen.');
    } finally {
      if (isActive()) {
        setReplayNarrator(null);
        clearSpeechHighlight();
        setPlaying(false);
      }
    }
  }, [playDecodedLine, clearSpeechHighlight]);

  React.useEffect(() => () => invalidateSession(), [invalidateSession]);

  const activeNarrator = replayNarrator
    || (lineIndex >= 0 ? normalizeNarratorId(lines[lineIndex]?.narrator) : null);

  return {
    playLines,
    replayNarratorLine,
    playNarratorLineAudioOnly,
    playing,
    error,
    activeNarrator,
    speechPlaybackTime,
    speechTimings,
    speechText,
    spokenLinesByNarrator,
    lastLineByNarrator,
    lastTranslationByNarrator,
    clearNarratorLines,
    invalidateSession,
    pauseNarratorPlayback,
    stopAudio,
  };
}
