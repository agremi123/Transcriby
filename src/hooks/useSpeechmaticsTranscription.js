import React from 'react';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export function useSpeechmaticsTranscription() {
  const recognitionRef = React.useRef(null);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);
  const audioBlobUrlRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const activeRef = React.useRef(false);
  const accumulatedRef = React.useRef('');

  const [finalTranscript, setFinalTranscript] = React.useState('');
  const [partialTranscript, setPartialTranscript] = React.useState('');
  const [status, setStatus] = React.useState('idle');
  const [error, setError] = React.useState(null);
  const [audioUrl, setAudioUrl] = React.useState(null);

  const stop = React.useCallback(() => {
    activeRef.current = false;

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.abort(); } catch {}
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

    setStatus('idle');
    setPartialTranscript('');
  }, []);

  const start = React.useCallback(async () => {
    if (activeRef.current) return;

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition requires Chrome or Edge.');
      return;
    }

    setError(null);
    setFinalTranscript('');
    setPartialTranscript('');
    setAudioUrl(null);
    audioChunksRef.current = [];
    accumulatedRef.current = '';
    setStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio recording for playback
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      });
      mr.start();

      // Web Speech API — more phonetic, less language-model "correction"
      const recognition = new SpeechRecognitionAPI();
      recognitionRef.current = recognition;
      recognition.lang = 'fr-FR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            accumulatedRef.current += result[0].transcript;
            setFinalTranscript(accumulatedRef.current);
            setPartialTranscript('');
          } else {
            interim += result[0].transcript;
            setPartialTranscript(interim);
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        setError(
          event.error === 'not-allowed'
            ? 'Allow microphone access in your browser to continue.'
            : `Recognition error: ${event.error}`,
        );
        stop();
      };

      // Web Speech stops automatically after silence — restart while active
      recognition.onend = () => {
        if (activeRef.current && recognitionRef.current === recognition) {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
      activeRef.current = true;
      setStatus('recording');
    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Allow microphone access in your browser to continue.'
          : err.message || 'Unable to start recording',
      );
      setStatus('idle');
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

  return {
    finalTranscript,
    partialTranscript,
    liveTranscript: partialTranscript || finalTranscript,
    status,
    error,
    audioUrl,
    isRecording: status === 'recording',
    start,
    stop,
  };
}
