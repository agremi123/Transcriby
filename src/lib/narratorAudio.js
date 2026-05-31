import React from 'react';
import { buildWordTimings, playDecodedBuffer } from './speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from './siteAudio';

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
  return gain;
}

export function resolveClientNarrator(narrator = 'lea') {
  return narrator === 'jules' || narrator === 'alex' ? 'jules' : 'lea';
}

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
  const cached = narratorAudioCache.get(key);
  if (cached) return cached.slice(0);

  const res = await fetch('/api/elevenlabs-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: trimmed, narrator: resolveClientNarrator(narrator) }),
  });

  if (!res.ok) throw new Error('TTS unavailable');

  const buf = await readNarratorAudioResponse(res);
  narratorAudioCache.set(key, buf.slice(0));
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
    scriptLineByNarratorRef.current[line.narrator] = line;
    setLastLineByNarrator((prev) => ({ ...prev, [line.narrator]: line.text }));
    if (line.translation) {
      setLastTranslationByNarrator((prev) => ({ ...prev, [line.narrator]: line.translation }));
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
  }, [stopAudio]);

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
    const line = scriptLineByNarratorRef.current[narratorId];
    if (!line) return;

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

  const activeNarrator = replayNarrator || (lineIndex >= 0 ? lines[lineIndex]?.narrator : null);

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
    lastLineByNarrator,
    lastTranslationByNarrator,
    invalidateSession,
    stopAudio,
  };
}
