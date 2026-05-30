import React from 'react';

export function useDeepgramTranscription() {
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

  const [utterances, setUtterances] = React.useState([]);
  const [partialTranscript, setPartialTranscript] = React.useState('');
  const [settledText, setSettledText] = React.useState('');
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState(null);
  const [audioUrl, setAudioUrl] = React.useState(null);

  const stop = React.useCallback(() => {
    activeRef.current = false;

    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
      ws.close();
    }

    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (mr && mr.state !== 'inactive') {
      mr.addEventListener('stop', () => {
        if (audioChunksRef.current.length === 0) return;
        if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        audioBlobUrlRef.current = url;
        setAudioUrl(url);
      }, { once: true });
      mr.stop();
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());

    // Flush any in-progress utterance — prefer the fuller partial over just is_final confirmed text
    const confirmed = currentUtteranceRef.current.trim();
    const partial = lastPartialRef.current.trim();
    const leftover = partial.length > confirmed.length ? partial : confirmed;
    const startTime = utteranceStartRef.current ?? 0;
    const leftoverWords = currentWordsRef.current;
    currentUtteranceRef.current = '';
    currentWordsRef.current = [];
    utteranceStartRef.current = null;
    lastPartialRef.current = '';
    if (leftover) {
      setSettledText('');
      setUtterances((prev) => [...prev, {
        id: Date.now() + Math.random(),
        text: leftover,
        startTime,
        endTime: leftoverWords.length > 0 ? (leftoverWords[leftoverWords.length - 1].end ?? startTime) : startTime,
        words: leftoverWords,
      }]);
    }

    setStatus('idle');
    setPartialTranscript('');
  }, []);

  const start = React.useCallback(async () => {
    if (activeRef.current) return;

    setError(null);
    setAudioUrl(null);
    audioChunksRef.current = [];
    currentUtteranceRef.current = '';
    currentWordsRef.current = [];
    utteranceStartRef.current = null;
    setStatus('connecting');

    try {
      const keyRes = await fetch('/api/deepgram/key');
      if (!keyRes.ok) throw new Error('Failed to get Deepgram API key');
      const { key } = await keyRes.json();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const params = new URLSearchParams({
        model: 'nova-2',
        language: 'fr',
        punctuate: 'true',
        interim_results: 'true',
        utterance_end_ms: '1500',
        vad_events: 'true',
        words: 'true',
        filler_words: 'true',
      });

      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params}`,
        ['token', key],
      );
      wsRef.current = ws;
      activeRef.current = true;

      ws.onopen = () => {
        if (!activeRef.current || wsRef.current !== ws) { ws.close(); return; }
        setStatus('recording');

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        const mr = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = mr;

        mr.addEventListener('dataavailable', (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
            if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
          }
        });
        mr.start(250);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'Results') return;

          const transcript = data.channel?.alternatives?.[0]?.transcript ?? '';
          const words = data.channel?.alternatives?.[0]?.words ?? [];

          if (data.is_final && data.speech_final) {
            if (utteranceStartRef.current === null) utteranceStartRef.current = data.start ?? 0;
            const startTime = utteranceStartRef.current;
            const endTime = (data.start ?? 0) + (data.duration ?? 0);
            utteranceStartRef.current = null;

            const full = currentUtteranceRef.current
              ? currentUtteranceRef.current + (transcript ? ' ' + transcript : '')
              : transcript;

            // Use accumulated words + speech_final words, but dedupe by start time
            const combined = [...currentWordsRef.current, ...words];
            const seen = new Set();
            const allWords = combined.filter((w) => {
              const key = `${w.start}-${w.word}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            currentUtteranceRef.current = '';
            currentWordsRef.current = [];

            lastPartialRef.current = '';
            if (full.trim()) {
              setSettledText('');
              setUtterances((prev) => [...prev, {
                id: Date.now() + Math.random(),
                text: full.trim(),
                startTime,
                endTime,
                words: allWords,
              }]);
            }
            setPartialTranscript('');
          } else if (data.is_final) {
            if (utteranceStartRef.current === null) utteranceStartRef.current = data.start ?? 0;
            if (transcript) {
              currentUtteranceRef.current = currentUtteranceRef.current
                ? currentUtteranceRef.current + ' ' + transcript
                : transcript;
              currentWordsRef.current = [...currentWordsRef.current, ...words];
            }
            setSettledText(currentUtteranceRef.current);
            setPartialTranscript('');
          } else {
            const live = currentUtteranceRef.current
              ? currentUtteranceRef.current + (transcript ? ' ' + transcript : '')
              : transcript;
            lastPartialRef.current = live;
            setSettledText(currentUtteranceRef.current);
            setPartialTranscript(live);
          }
        } catch {}
      };

      ws.onerror = () => {
        if (!activeRef.current) return;
        setError('Connection to Deepgram failed.');
        stop();
      };

      ws.onclose = (event) => {
        if (!activeRef.current) return;
        if (event.code !== 1000 && event.code !== 1001) {
          setError(`Deepgram disconnected (${event.code}).`);
          stop();
        }
      };
    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Allow microphone access in your browser to continue.'
          : err.message || 'Unable to start recording',
      );
      setStatus('idle');
      activeRef.current = false;
      stop();
    }
  }, [stop]);

  React.useEffect(
    () => () => {
      stop();
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    },
    [stop],
  );

  const reset = React.useCallback(() => {
    stop();
    setUtterances([]);
    setPartialTranscript('');
    setSettledText('');
    setAudioUrl(null);
    currentUtteranceRef.current = '';
    currentWordsRef.current = [];
    utteranceStartRef.current = null;
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
