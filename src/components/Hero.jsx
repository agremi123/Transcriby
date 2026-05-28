import React from 'react';
import { motion } from 'framer-motion';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import {
  ButtonPrimary,
  ButtonGhost,
  Container,
  Reveal,
  Star,
} from './atoms';

// Plays a slice of the actual recorded audio via Web Audio API
function SegmentPlayButton({ audioUrl, startTime, endTime }) {
  const [playing, setPlaying] = React.useState(false);
  const sourceRef = React.useRef(null);
  const ctxRef = React.useRef(null);

  const stop = React.useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    ctxRef.current?.close().catch?.(() => {});
    sourceRef.current = null;
    ctxRef.current = null;
    setPlaying(false);
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  const play = async () => {
    stop();
    if (!audioUrl) return;
    try {
      setPlaying(true);
      const res = await fetch(audioUrl);
      const buf = await res.arrayBuffer();
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const decoded = await ctx.decodeAudioData(buf);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = stop;
      source.start(0, startTime, Math.max(0.1, endTime - startTime));
      sourceRef.current = source;
    } catch {
      stop();
    }
  };

  const disabled = !audioUrl;
  return (
    <button
      type="button"
      onClick={playing ? stop : play}
      disabled={disabled}
      title={playing ? 'Stop' : 'Play your recording'}
      style={{ width: 20, height: 20, flexShrink: 0 }}
      className={`flex items-center justify-center border transition-colors ${
        disabled
          ? 'border-navy/10 text-navy/15 cursor-not-allowed'
          : 'border-navy/20 text-navy/35 hover:border-navy/40 hover:text-navy/60'
      }`}
    >
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none" aria-hidden>
        {playing ? (
          <>
            <rect x="0.5" y="0.5" width="2.5" height="9" rx="0.4" fill="currentColor" />
            <rect x="5" y="0.5" width="2.5" height="9" rx="0.4" fill="currentColor" />
          </>
        ) : (
          <path d="M1 1l6 4-6 4V1z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}

// Plays the AI correction via OpenAI TTS
function TtsPlayButton({ text }) {
  const [playing, setPlaying] = React.useState(false);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);

  const stop = React.useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    ctxRef.current?.close().catch?.(() => {});
    sourceRef.current = null;
    ctxRef.current = null;
    setPlaying(false);
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  const play = async () => {
    stop();
    // Create AudioContext immediately on click to capture the user gesture —
    // browser blocks audio.play() if called after an async boundary without this
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    try {
      setPlaying(true);
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = stop;
      source.start(0);
      sourceRef.current = source;
    } catch (err) {
      console.error('TTS error:', err);
      stop();
    }
  };

  return (
    <button
      type="button"
      onClick={playing ? stop : play}
      title={playing ? 'Stop' : 'Play correction'}
      style={{ width: 20, height: 20, flexShrink: 0 }}
      className="flex items-center justify-center border border-wine/40 text-wine hover:bg-wine hover:text-ivory transition-colors mt-1"
    >
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none" aria-hidden>
        {playing ? (
          <>
            <rect x="0.5" y="0.5" width="2.5" height="9" rx="0.4" fill="currentColor" />
            <rect x="5" y="0.5" width="2.5" height="9" rx="0.4" fill="currentColor" />
          </>
        ) : (
          <path d="M1 1l6 4-6 4V1z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}

async function fetchCorrection(text, register) {
  try {
    const res = await fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, register }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.corrected || null;
  } catch {
    return null;
  }
}

function AudioDemoCard() {
  const {
    utterances,
    partialTranscript,
    audioUrl,
    status,
    error,
    isRecording,
    start,
    stop,
  } = useDeepgramTranscription();

  const [time, setTime] = React.useState(0);
  const [corrections, setCorrections] = React.useState({});
  const [register, setRegister] = React.useState('Standard');
  const prevLengthRef = React.useRef(0);

  React.useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // Fetch correction for each new utterance as it arrives
  React.useEffect(() => {
    const newOnes = utterances.slice(prevLengthRef.current);
    prevLengthRef.current = utterances.length;
    newOnes.forEach(({ id, text }) => {
      fetchCorrection(text, register).then((corrected) => {
        setCorrections((prev) => ({ ...prev, [id]: corrected }));
      });
    });
  }, [utterances]);

  const toggleRecording = async () => {
    if (isRecording) {
      await stop();
      return;
    }
    setTime(0);
    setCorrections({});
    prevLengthRef.current = 0;
    await start();
  };

  const mm = String(Math.floor(time / 60)).padStart(2, '0');
  const ss = String(time % 60).padStart(2, '0');
  const isLive = isRecording || status === 'connecting';
  const hasContent = utterances.length > 0 || !!partialTranscript;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-[580px] bg-paper hairline"
      style={{
        boxShadow:
          '0 30px 80px -30px rgba(26,35,64,0.25), 0 8px 24px -12px rgba(26,35,64,0.08)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {['Casual', 'Standard', 'Formal'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegister(r)}
                className={`text-[11px] tracking-wide px-2 py-0.5 border transition-colors ${
                  register === r
                    ? 'border-wine text-wine bg-wine/5'
                    : 'border-navy/15 text-navy/35 hover:border-navy/30 hover:text-navy/60'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="relative inline-flex">
              <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-wine' : 'bg-navy/30'}`} />
              {isLive && (
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-wine animate-ping opacity-60" />
              )}
            </span>
            <span className="text-[13px] text-navy">
              {status === 'connecting' ? 'Connecting…' : isRecording ? 'Live' : 'Start speaking'}
            </span>
          </div>
        </div>
        <span className="text-[13px] text-navy/60 font-mono tabular-nums">
          00:{mm}:{ss}
        </span>
      </div>

      {/* Transcript */}
      <div className="px-5 pt-6">
        <div className="text-[11px] tracking-wide text-navy/55 mb-1.5">You say</div>
        <div className="bg-ivory/60 border border-line/70 overflow-hidden">
          <div className="px-4 py-4 min-h-[120px] space-y-2">
            {hasContent ? (
              <>
                {utterances.map((utt) => {
                  const corrected = corrections[utt.id];
                  return (
                    <div key={utt.id}>
                      <div className="flex items-center gap-2">
                        <SegmentPlayButton
                          audioUrl={audioUrl}
                          startTime={utt.startTime}
                          endTime={utt.endTime}
                        />
                        <p className="font-display text-[20px] leading-tight text-navy/35" spellCheck={false}>
                          {utt.text}
                        </p>
                      </div>
                      <div className="ml-7 min-h-[22px] mt-1">
                        {corrected && corrected !== utt.text && (
                          <div className="flex items-start gap-2">
                            <TtsPlayButton text={corrected} />
                            <p className="font-display text-[20px] leading-tight text-wine" spellCheck={false}>
                              {corrected}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {partialTranscript && (
                  <p className="font-display text-[20px] leading-tight text-navy/35" spellCheck={false}>
                    {partialTranscript}
                  </p>
                )}
              </>
            ) : (
              <p className="font-display text-[22px] leading-tight text-navy/30">
                {isLive ? 'Start speaking…' : 'Press the mic to speak'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mic button */}
      <div className="px-5 py-5 mt-2 flex items-center justify-center">
        <button
          type="button"
          onClick={toggleRecording}
          disabled={status === 'connecting'}
          className="relative w-11 h-11 rounded-full bg-wine hover:bg-wine2 disabled:opacity-60 inline-flex items-center justify-center transition-colors"
          aria-label="Toggle recording"
        >
          {isRecording ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="2" y="2" width="10" height="10" rx="1.5" fill="#F6F1E8" />
            </svg>
          ) : (
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden>
              <rect x="5" y="1" width="6" height="11" rx="3" fill="#F6F1E8" />
              <path
                d="M2 9.5a6 6 0 0012 0M8 16v3"
                stroke="#F6F1E8"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          )}
          {isRecording && (
            <span className="absolute inset-0 rounded-full border border-wine animate-ping opacity-50" />
          )}
        </button>
      </div>

      {error && <p className="px-5 pb-4 text-[12px] text-wine">{error}</p>}
    </motion.div>
  );
}

export default function Hero() {
  return (
    <section className="relative pt-[120px] pb-20 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 80% at 80% 30%, rgba(217,196,162,0.30), transparent 60%), linear-gradient(180deg, #F6F1E8 0%, #F2EBDA 100%)',
          }}
        />
        <img
          src="/assets/paris-skyline.png"
          alt=""
          className="absolute right-0 bottom-0 w-[1280px] max-w-[80%] object-contain object-bottom-right select-none"
          style={{ opacity: 0.85, mixBlendMode: 'multiply' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #F6F1E8 0%, rgba(246,241,232,0.85) 35%, rgba(246,241,232,0.0) 65%)',
          }}
        />
      </div>

      <Container className="relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="relative">
            <Reveal>
              <div className="inline-flex items-center gap-2 bg-ivory2/70 border border-line px-3 py-1.5 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-wine animate-pulse" />
                <span className="eyebrow text-navy/80">AI-powered real-time spoken French correction</span>
              </div>
            </Reveal>
            <h1 className="font-display text-[64px] md:text-[84px] leading-[0.95] tracking-[-0.015em] text-navy">
              <Reveal delay={0.08}>Speak French</Reveal>
              <Reveal delay={0.18} className="text-wine italic">
                Naturellement.
              </Reveal>
            </h1>
            <Reveal delay={0.3}>
              <p className="mt-7 max-w-[460px] text-[16px] leading-[1.65] text-navy/70">
                Transcriby listens as you speak and corrects your French in real time —
                helping you express yourself with fluency and confidence.
              </p>
            </Reveal>
            <Reveal delay={0.4}>
              <div className="mt-9 flex items-center gap-3 flex-wrap">
                <ButtonPrimary>Try for free</ButtonPrimary>
                <ButtonGhost>Watch the demo</ButtonGhost>
              </div>
            </Reveal>
            <Reveal delay={0.5}>
              <div className="mt-10 flex items-center gap-5">
                <div className="flex -space-x-2.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-9 h-9 rounded-full ring-2 ring-ivory overflow-hidden"
                      style={{
                        background: [
                          'linear-gradient(135deg,#C9A0A8,#8B1E2D)',
                          'linear-gradient(135deg,#D9D2C2,#1A2340)',
                          'linear-gradient(135deg,#EFE8DA,#8B1E2D)',
                          'linear-gradient(135deg,#1A2340,#C9A0A8)',
                        ][i],
                      }}
                    />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <Star key={i} filled size={13} />
                    ))}
                    <Star filled={false} size={13} />
                  </div>
                  <p className="text-[12px] text-navy/65 mt-0.5">
                    <span className="text-navy font-medium">4.9/5</span> from over 2,000 learners
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="flex justify-center lg:justify-end">
            <AudioDemoCard />
          </div>
        </div>
      </Container>
    </section>
  );
}
