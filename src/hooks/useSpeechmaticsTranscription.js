import React from 'react';
import FRENCH_CASUAL_VOCAB from '../lib/frenchCasualVocab.js';
import { joinTranscriptSegments } from '../lib/transcriptJoin.js';

const CASUAL_ADDITIONAL_VOCAB = FRENCH_CASUAL_VOCAB.map(w => ({ content: w }));

// Speechmatics Real-Time API — preserves casual/spoken French verbatim
const SM_URL = 'wss://eu2.rt.speechmatics.com/v2';
const FINAL_TRANSCRIPT_FLUSH_MS = 700;

function wait(ms) {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

// Join Speechmatics results respecting punctuation (no space before , . ! ? etc.)
function joinResults(results) {
  let out = '';
  for (const r of results) {
    const content = r.alternatives?.[0]?.content ?? '';
    if (!content) continue;
    const isPunct = r.type === 'punctuation' || /^[.,!?;:»)}\]]+$/.test(content);
    out = isPunct ? out + content : out ? out + ' ' + content : content;
  }
  return out.trim();
}

function ingestTranscriptWords(words, results) {
  for (const r of results ?? []) {
    const content = r.alternatives?.[0]?.content ?? '';
    if (!content) continue;

    if (r.type === 'punctuation') {
      const last = words[words.length - 1];
      if (last) last.punctuated_word = (last.punctuated_word ?? last.word) + content;
      continue;
    }

    if (r.type !== 'word') continue;

    words.push({
      word: content,
      punctuated_word: content,
      start: r.start_time ?? 0,
      end: r.end_time ?? r.start_time ?? 0,
    });
  }
}

function endsWithSentencePunctuation(text) {
  return /[.!?,;:»)]$/.test(String(text || '').trim());
}

function ensureSentenceEnd(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return trimmed;
  const core = trimmed.trimEnd();
  return endsWithSentencePunctuation(core) ? core : `${core}.`;
}

function appendPeriodToWords(words) {
  if (!words.length) return;
  const last = words[words.length - 1];
  const visible = String(last.punctuated_word ?? last.word).trimEnd();
  if (endsWithSentencePunctuation(visible)) {
    last.punctuated_word = visible;
    return;
  }
  last.punctuated_word = `${visible}.`;
}

// Spoken stop-command: when the learner finishes by saying "stop", we end the
// recording for them (no need to click). Configurable per session via the
// `voiceStopWords` option passed to start(); defaults to ["stop"].
const DEFAULT_VOICE_STOP_WORDS = ['stop'];

function normalizeStopWords(words) {
  if (!Array.isArray(words)) return [];
  return words.map((w) => String(w || '').trim()).filter(Boolean);
}

// Matches a stop word ONLY when it's the final spoken word of the text (allowing
// trailing punctuation), so "stop" mid-sentence doesn't cut the recording short.
function buildStopWordPattern(stopWords) {
  const cleaned = normalizeStopWords(stopWords)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!cleaned.length) return null;
  const SEP = `[\\s.,;:!?…«»"'\\-]`;
  return new RegExp(`(?:^|${SEP})(?:${cleaned.join('|')})${SEP}*$`, 'iu');
}

// Remove any trailing spoken stop word(s) from the captured text so the command
// itself never ends up in the learner's answer.
function stripTrailingStopWords(text, pattern) {
  if (!pattern || !text) return text;
  let out = String(text);
  let prev;
  do {
    prev = out;
    out = out.replace(pattern, '').replace(/\s+$/, '');
  } while (out && out !== prev);
  return out;
}

function stripTrailingStopWordsFromWords(words, stopWords) {
  const set = new Set(normalizeStopWords(stopWords).map((w) => w.toLowerCase()));
  if (!words?.length || !set.size) return;
  while (words.length) {
    const norm = String(words[words.length - 1].word || '')
      .toLowerCase()
      .replace(/[.,;:!?…«»"'\s-]/g, '');
    if (set.has(norm)) words.pop();
    else break;
  }
}

export function useSpeechmaticsTranscription() {
  const wsRef = React.useRef(null);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);
  const audioBlobUrlRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const activeRef = React.useRef(false);
  const currentUtteranceRef = React.useRef('');
  const currentWordsRef = React.useRef([]);
  const utteranceStartRef = React.useRef(null);
  const lastPartialRef = React.useRef('');
  const settledTextRef = React.useRef('');
  const partialTranscriptRef = React.useRef('');
  const sessionOptionsRef = React.useRef({});
  const stopInFlightRef = React.useRef(null);
  const voiceStopWordsRef = React.useRef([]);
  const voiceStopTriggeredRef = React.useRef(false);

  // Pre-warm: fetch key + mic in background on mount
  const cachedKeyRef = React.useRef(null);
  const prewarmStreamRef = React.useRef(null);

  React.useEffect(() => {
    fetch('/api/speechmatics/key')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.key) cachedKeyRef.current = data.key; })
      .catch(() => {});

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => { prewarmStreamRef.current = stream; })
      .catch(() => {});

    return () => {
      if (prewarmStreamRef.current) {
        prewarmStreamRef.current.getTracks().forEach(t => t.stop());
        prewarmStreamRef.current = null;
      }
    };
  }, []);

  const [utterances, setUtterances] = React.useState([]);
  const [partialTranscript, setPartialTranscript] = React.useState('');
  const [settledText, setSettledText] = React.useState('');
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState(null);
  const [audioUrl, setAudioUrl] = React.useState(null);

  const notifySpeechFinal = React.useCallback((text) => {
    const options = sessionOptionsRef.current;
    if (!options.onSpeechFinal || !activeRef.current || options.speechFinalFired) return;
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    options.speechFinalFired = true;
    options.onSpeechFinal(trimmed);
  }, []);

  const stop = React.useCallback(() => {
    const finalizeStop = async () => {
      activeRef.current = false;
      sessionOptionsRef.current = {};
      const stopWords = voiceStopWordsRef.current;
      voiceStopWordsRef.current = [];
      const stopWordPattern = buildStopWordPattern(stopWords);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: 0 })); } catch {}
      }

      const mr = mediaRecorderRef.current;
      mediaRecorderRef.current = null;

      let sessionAudioUrl = null;
      if (mr && mr.state !== 'inactive') {
        sessionAudioUrl = await new Promise((resolve) => {
          mr.addEventListener('stop', () => {
            if (audioChunksRef.current.length === 0) {
              resolve(null);
              return;
            }
            if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
            const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
            resolve(URL.createObjectURL(blob));
          }, { once: true });
          mr.stop();
        });
      }

      if (sessionAudioUrl) {
        audioBlobUrlRef.current = sessionAudioUrl;
        setAudioUrl(sessionAudioUrl);
      }

      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) stream.getTracks().forEach(t => t.stop());

      // Keep the socket open briefly so final AddTranscript messages can land.
      if (ws) await wait(FINAL_TRANSCRIPT_FLUSH_MS);
      if (wsRef.current === ws) {
        wsRef.current = null;
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }

      const confirmed = currentUtteranceRef.current.trim();
      const partial = lastPartialRef.current.trim();
      let leftover = partial.length > confirmed.length ? partial : confirmed;
      if (!leftover) {
        leftover = joinTranscriptSegments(settledTextRef.current, partialTranscriptRef.current);
      }
      leftover = stripTrailingStopWords(leftover, stopWordPattern).trim();
      const startTime = utteranceStartRef.current ?? 0;

      currentUtteranceRef.current = '';
      utteranceStartRef.current = null;
      lastPartialRef.current = '';
      settledTextRef.current = '';
      partialTranscriptRef.current = '';

      if (leftover) {
        const needsPeriod = !endsWithSentencePunctuation(leftover);
        const text = ensureSentenceEnd(leftover);
        const words = [...currentWordsRef.current];
        stripTrailingStopWordsFromWords(words, stopWords);
        if (needsPeriod) appendPeriodToWords(words);
        const utteranceStart = words[0]?.start ?? startTime;
        const utteranceEnd = words[words.length - 1]?.end ?? utteranceStart;
        setSettledText('');
        setUtterances(prev => [...prev, {
          id: Date.now() + Math.random(),
          text,
          startTime: utteranceStart,
          endTime: utteranceEnd,
          words,
          audioUrl: sessionAudioUrl,
        }]);
      }

      currentWordsRef.current = [];
      setStatus('idle');
      setPartialTranscript('');
    };

    return stopInFlightRef.current ?? (stopInFlightRef.current = finalizeStop().finally(() => {
      stopInFlightRef.current = null;
    }));
  }, []);

  // If the live transcript ends with a spoken stop word ("stop"), end the
  // recording automatically. Fires at most once per session.
  const maybeVoiceStop = React.useCallback((text) => {
    if (voiceStopTriggeredRef.current || !activeRef.current) return false;
    const pattern = buildStopWordPattern(voiceStopWordsRef.current);
    if (!pattern || !pattern.test(String(text || ''))) return false;
    voiceStopTriggeredRef.current = true;
    stop();
    return true;
  }, [stop]);

  const start = React.useCallback(async (options = {}) => {
    if (activeRef.current) return;

    sessionOptionsRef.current = { speechFinalFired: false, ...options };
    voiceStopTriggeredRef.current = false;
    // Spoken "stop" command: on by default for mic recordings; off for captured
    // streams (e.g. tab/system audio) unless the caller passes voiceStopWords.
    voiceStopWordsRef.current = options.voiceStopWords !== undefined
      ? normalizeStopWords(options.voiceStopWords)
      : options.stream
        ? []
        : DEFAULT_VOICE_STOP_WORDS;

    setError(null);
    setAudioUrl(null);
    audioChunksRef.current = [];
    currentUtteranceRef.current = '';
    currentWordsRef.current = [];
    utteranceStartRef.current = null;
    settledTextRef.current = '';
    partialTranscriptRef.current = '';
    setStatus('connecting');

    try {
      const [key, stream] = await Promise.all([
        cachedKeyRef.current
          ? Promise.resolve(cachedKeyRef.current)
          : fetch('/api/speechmatics/key').then(async r => {
              const data = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(data.error || 'Failed to get Speechmatics API key');
              if (!data?.key) throw new Error('Speechmatics API key missing — add SPEECHMATICS_API_KEY to .env');
              return data.key;
            }),
        options.stream
          ? Promise.resolve(options.stream)
          : prewarmStreamRef.current
          ? Promise.resolve(prewarmStreamRef.current)
          : navigator.mediaDevices.getUserMedia({ audio: true }),
      ]);

      // Only consume the pre-warm stream when using mic (not when caller supplied a stream)
      if (!options.stream) prewarmStreamRef.current = null;
      cachedKeyRef.current = null;
      fetch('/api/speechmatics/key')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.key) cachedKeyRef.current = data.key; })
        .catch(() => {});

      streamRef.current = stream;

      const ws = await new Promise((resolve, reject) => {
        const socket = new WebSocket(`${SM_URL}?jwt=${key}`);
        let settled = false;
        const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };
        socket.onopen = () => finish(resolve, socket);
        socket.onerror = () => finish(reject, new Error('Connection to Speechmatics failed. Check your API key.'));
        socket.onclose = e => finish(reject, new Error(`Speechmatics disconnected (${e.code}).`));
      });

      wsRef.current = ws;
      activeRef.current = true;

      // Send StartRecognition config
      ws.send(JSON.stringify({
        message: 'StartRecognition',
        audio_format: {
          type: 'file',
        },
        transcription_config: {
          language: 'fr',
          enable_partials: true,
          max_delay: 1,
          max_delay_mode: 'flexible',
          operating_point: 'enhanced',
          additional_vocab: CASUAL_ADDITIONAL_VOCAB,
        },
      }));

      ws.onclose = event => {
        if (!activeRef.current) return;
        if (event.code !== 1000 && event.code !== 1001) {
          setError(`Speechmatics disconnected (${event.code}).`);
          stop();
        }
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          if (data.message === 'RecognitionStarted') {
            // Now safe to start sending audio
            setStatus('recording');

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
            const mr = mimeType
              ? new MediaRecorder(stream, { mimeType })
              : new MediaRecorder(stream);
            mediaRecorderRef.current = mr;

            mr.addEventListener('dataavailable', e => {
              if (e.data.size > 0) {
                audioChunksRef.current.push(e.data);
                if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
              }
            });
            mr.start(100);
            return;
          }

          if (data.message === 'AddPartialTranscript') {
            const partial = joinResults(data.results ?? []);
            if (!partial) return;
            if (utteranceStartRef.current === null) utteranceStartRef.current = data.results?.[0]?.start_time ?? 0;
            // partialTranscript is ONLY the new unstable words — settled text is shown separately
            const combined = joinTranscriptSegments(currentUtteranceRef.current, partial);
            lastPartialRef.current = combined;
            setSettledText(currentUtteranceRef.current);
            setPartialTranscript(partial);
            settledTextRef.current = currentUtteranceRef.current;
            partialTranscriptRef.current = partial;
            maybeVoiceStop(combined);
            return;
          }

          if (data.message === 'AddTranscript') {
            const transcript = joinResults(data.results ?? []);
            if (!transcript) return;
            if (utteranceStartRef.current === null) utteranceStartRef.current = data.results?.[0]?.start_time ?? 0;
            ingestTranscriptWords(currentWordsRef.current, data.results);

            // Accumulate — don't push utterance yet, wait until stop()
            currentUtteranceRef.current = joinTranscriptSegments(
              currentUtteranceRef.current,
              transcript,
            );

            lastPartialRef.current = '';
            setSettledText(currentUtteranceRef.current);
            setPartialTranscript('');
            settledTextRef.current = currentUtteranceRef.current;
            partialTranscriptRef.current = '';
            return;
          }

          if (data.message === 'Error') {
            setError(data.reason || 'Speechmatics error.');
            stop();
          }
        } catch {}
      };

    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? (options.stream
            ? 'Tab capture was cancelled or denied.'
            : 'Allow microphone access in your browser to continue.')
          : err.message || 'Unable to start recording',
      );
      setStatus('idle');
      activeRef.current = false;
      stop();
    }
  }, [stop, notifySpeechFinal]);

  React.useEffect(
    () => () => {
      stop();
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    },
    [stop],
  );

  const reset = React.useCallback(() => {
    stop();
    setUtterances((prev) => {
      prev.forEach((u) => {
        if (u.audioUrl) URL.revokeObjectURL(u.audioUrl);
      });
      return [];
    });
    setPartialTranscript('');
    setSettledText('');
    setAudioUrl(null);
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    currentUtteranceRef.current = '';
    currentWordsRef.current = [];
    utteranceStartRef.current = null;
    settledTextRef.current = '';
    partialTranscriptRef.current = '';
  }, [stop]);

  return {
    utterances,
    partialTranscript,
    settledText,
    audioUrl,
    status,
    error,
    isRecording: status === 'recording',
    start,
    stop,
    reset,
  };
}
