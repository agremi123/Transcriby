/**
 * transcribe.js — Speechmatics real-time WebSocket integration.
 *
 * Flow:
 *  1. Fetch a short-lived JWT from our server (/api/speechmatics-jwt).
 *  2. Open WebSocket to Speechmatics RT endpoint.
 *  3. Capture microphone audio via AudioWorklet → Int16 PCM.
 *  4. Send audio chunks over WebSocket.
 *  5. Fire callbacks for partial and final transcript chunks.
 *  6. Detect sentence boundaries (punctuation or 3 s pause) and fire onSentence.
 */

const Transcribe = (() => {
  const SPEECHMATICS_URL = 'wss://eu2.rt.speechmatics.com/v2';
  const SENTENCE_FLUSH_MS = 3000;
  const SENTENCE_ENDINGS  = new Set(['.', '?', '!']);

  let ws            = null;
  let audioCtx      = null;
  let mediaStream   = null;
  let workletNode   = null;
  let sourceNode    = null;
  let isRecording   = false;
  let sentenceBuffer = [];
  let flushTimer    = null;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  let _onPartial  = null;  // (text: string) => void
  let _onChunk    = null;  // (text: string) => void — fires per AddTranscript (immediate)
  let _onSentence = null;  // (text: string) => void — fires at sentence boundary (for AI)
  let _onError    = null;  // (msg: string)  => void
  let _onStart    = null;  // () => void
  let _onStop     = null;  // () => void

  // ── Helpers ────────────────────────────────────────────────────────────────

  function extractText(results) {
    let out = '';
    for (const r of results) {
      if (!r.alternatives?.length) continue;
      const content = r.alternatives[0].content;
      if (!content) continue;
      if (r.type === 'punctuation') {
        out = out.trimEnd() + content;
      } else {
        out += (out ? ' ' : '') + content;
      }
    }
    return out.trim();
  }

  // ── Sentence accumulator ───────────────────────────────────────────────────

  function accumulateResults(results) {
    if (!results?.length) return;

    let hasPunct = false;

    for (const r of results) {
      if (!r.alternatives?.length) continue;
      const content = r.alternatives[0].content;
      if (!content) continue;

      if (r.type === 'punctuation') {
        // Append punctuation directly to the last word (no space)
        if (sentenceBuffer.length > 0) {
          sentenceBuffer[sentenceBuffer.length - 1] += content;
        } else {
          sentenceBuffer.push(content);
        }
        if (SENTENCE_ENDINGS.has(content)) hasPunct = true;
      } else {
        sentenceBuffer.push(content);
      }
    }

    if (hasPunct) {
      flushSentence();
    } else {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flushSentence, SENTENCE_FLUSH_MS);
    }
  }

  function flushSentence() {
    clearTimeout(flushTimer);
    if (sentenceBuffer.length === 0) return;
    const text = sentenceBuffer.join(' ').replace(/\s+([.,!?;:])/g, '$1').trim();
    sentenceBuffer = [];
    if (text) _onSentence?.(text);
  }

  // ── Audio setup ────────────────────────────────────────────────────────────

  async function setupAudio() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
      video: false,
    });

    // Prefer 16 kHz; fall back to browser default and tell Speechmatics
    try {
      audioCtx = new AudioContext({ sampleRate: 16000 });
    } catch {
      audioCtx = new AudioContext();
    }

    await audioCtx.audioWorklet.addModule('/audio-processor.js');
    sourceNode  = audioCtx.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');

    sourceNode.connect(workletNode);
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────

  function openWebSocket(jwt, lang) {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(`${SPEECHMATICS_URL}?jwt=${jwt}`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
      ws.send(JSON.stringify({
        message: 'StartRecognition',
        audio_format: {
          type: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: audioCtx.sampleRate,
        },
        transcription_config: {
          language: lang,
          enable_partials: false,
        },
      }));
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.message === 'RecognitionStarted') {
          // Now safe to start piping audio
          workletNode.port.onmessage = (e) => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(e.data);
            }
          };
          isRecording = true;
          _onStart?.();
          resolve();
        }

        if (msg.message === 'AddPartialTranscript') {
          const text = (msg.results ?? [])
            .map(r => r.alternatives?.[0]?.content)
            .filter(Boolean)
            .join(' ');
          _onPartial?.(text);
        }

        if (msg.message === 'AddTranscript') {
          // Show words immediately as they are confirmed — no waiting
          const text = extractText(msg.results ?? []);
          if (text) _onChunk?.(text);
          // Also accumulate for sentence-level AI correction
          accumulateResults(msg.results ?? []);
        }

        if (msg.message === 'EndOfTranscript') {
          flushSentence();
          isRecording = false;
          _onStop?.();
        }

        if (msg.message === 'Error') {
          fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Speechmatics Error message: ${JSON.stringify(msg)}` }) });
          _onError?.(msg.reason ?? 'Speechmatics error');
          reject(new Error(msg.reason));
        }
      };

      ws.onerror = () => {
        fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Speechmatics WebSocket error' }) });
        _onError?.('WebSocket connection failed');
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = (e) => {
        if (e.code !== 1000 && e.code !== 1001) {
          fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Speechmatics closed — code=${e.code} reason="${e.reason}"` }) });
          _onError?.(`Connection closed (${e.code})`);
        }
        if (isRecording) {
          flushSentence();
          isRecording = false;
          _onStop?.();
        }
      };
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function start({ lang = 'en', onPartial, onChunk, onSentence, onError, onStart, onStop }) {
    if (isRecording) return;

    _onPartial  = onPartial;
    _onChunk    = onChunk;
    _onSentence = onSentence;
    _onError    = onError;
    _onStart    = onStart;
    _onStop     = onStop;

    // 1. Get JWT
    let jwt;
    try {
      const token = await Auth.getToken();
      const res = await fetch('/api/speechmatics-jwt', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NO_SUBSCRIPTION') throw new Error('NO_SUBSCRIPTION');
        throw new Error(data.error ?? 'Failed to get JWT');
      }
      jwt = data.jwt;
    } catch (err) {
      _onError?.(err.message);
      throw err;
    }

    // 2. Set up audio
    try {
      await setupAudio();
    } catch (err) {
      _onError?.(`Microphone error: ${err.message}`);
      throw err;
    }

    // 3. Open WebSocket
    await openWebSocket(jwt, lang);
  }

  function stop() {
    clearTimeout(flushTimer);
    flushSentence();

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: 0 }));
      ws.close(1000, 'User stopped recording');
    }

    workletNode?.disconnect();
    sourceNode?.disconnect();
    mediaStream?.getTracks().forEach(t => t.stop());

    if (audioCtx?.state !== 'closed') {
      audioCtx?.close().catch(() => {});
    }

    ws = null; audioCtx = null; mediaStream = null; workletNode = null; sourceNode = null;
    isRecording = false;
  }

  function recording() { return isRecording; }

  return { start, stop, recording };
})();

window.Transcribe = Transcribe;
