import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useSpeechmaticsTranscription } from '../hooks/useSpeechmaticsTranscription';
import {
  ButtonPrimary,
  Container,
  ParisianExperienceHint,
  Reveal,
  Star,
} from './atoms';
import { fetchNarratorAudio, connectNarratorSource, resolveClientNarrator } from '../lib/narratorAudio';
import { buildWordTimings, playDecodedBuffer } from '../lib/speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';
import { HighlightedSpeech } from '../lib/HighlightedSpeech';
import { NarratorHoverText } from '../lib/NarratorHoverText';
import { lookupNarratorTranslation } from '../lib/narratorTranslations';
import { SpellcheckUnderline } from '../lib/SpellcheckUnderline';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { matchesCorrectionTarget, isStrictCorrectionMatch, wordDiff, buildCorrectionNarrationText } from '../lib/correctionFormat';
import { DiffText } from '../lib/DiffText';
import { registerCorrectionKeyterms } from '../lib/deepgramKeyterms';
import { saveCorrection } from '../lib/correctionsNotebook';
import { bumpTargetProgressByTopic } from '../lib/targetProgress';
import { joinTranscriptSegments, segmentNeedsLeadingSpace } from '../lib/transcriptJoin';
import {
  getAlreadyCorrectLine,
  getNarratorIntro,
  getRepeatFailLine,
  getRepeatSuccessLine,
  pickNarratorReaction,
} from '../lib/narratorLevelAdapt';

// Small TTS play button for corrections
function TtsPlayButton({ text }) {
  const [playing, setPlaying] = React.useState(false);
  const [playbackTime, setPlaybackTime] = React.useState(null);
  const [timings, setTimings] = React.useState([]);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);

  const stopAudio = React.useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setPlaying(false);
    setPlaybackTime(null);
    setTimings([]);
  }, []);

  React.useEffect(() => registerSiteAudioStop(stopAudio), [stopAudio]);

  React.useEffect(() => () => {
    try { sourceRef.current?.stop(); } catch {}
    ctxRef.current?.close().catch?.(() => {});
  }, []);

  const play = async () => {
    const session = beginSiteAudioPlayback();
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    setPlaying(true);
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const buf = await res.arrayBuffer();
      if (!isSiteAudioPlaybackCurrent(session)) return;
      const decoded = await ctx.decodeAudioData(buf);
      if (!isSiteAudioPlaybackCurrent(session)) return;
      setTimings(buildWordTimings(text, decoded.duration));
      setPlaybackTime(0);
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        sourceRef,
        playbackSession: session,
        onTimeUpdate: (t) => {
          setPlaybackTime(t);
          if (t == null) stopAudio();
        },
      });
    } catch { stopAudio(); }
  };

  return (
    <div className="flex items-start gap-2 min-w-0">
      {playing && (
        <HighlightedSpeech
          text={text}
          playbackTime={playbackTime}
          timings={timings}
          className="font-display text-[15px] leading-snug text-navy flex-1 min-w-0"
        />
      )}
      <button
      type="button"
      onClick={playing ? stopAudio : play}
      className="flex-shrink-0 flex items-center justify-center hover:opacity-70 transition-opacity"
      style={{ width: 12, height: 12, alignSelf: 'flex-start', marginTop: 3 }}
      aria-label="Play correction"
    >
      <svg width="7" height="10" viewBox="0 0 7 10" fill="none">
        {playing
          ? <><rect x="0" y="0" width="2" height="10" rx="0.3" fill="#8b1e2d" opacity="0.55"/><rect x="4.5" y="0" width="2" height="10" rx="0.3" fill="#8b1e2d" opacity="0.55"/></>
          : <path d="M0 0 L7 5 L0 10 Z" fill="#8b1e2d" opacity="0.45"/>
        }
      </svg>
    </button>
    </div>
  );
}

// Pulsing dots while Léa / Jules load a correction
function CorrectionLoading({ className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 py-1 ${className}`} aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-wine/55"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

/** Play control or spinner — vertically centered on the first text line (leading-snug). */
function TranscriptAudioSlot({ mode, isPlaying, onPlay }) {
  const inner = (() => {
    if (mode === 'loading') {
      return (
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy/10"
          aria-label="Transcribing"
        >
          <span
            className="w-2.5 h-2.5 rounded-full border-[1.5px] border-navy/15 border-t-wine animate-spin"
            aria-hidden
          />
        </span>
      );
    }

    if (mode === 'play') {
      return (
        <button
          type="button"
          onClick={onPlay}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy/20 hover:bg-navy/30 transition-colors"
          aria-label={isPlaying ? 'Pause sentence' : 'Play sentence'}
        >
          {isPlaying ? (
            <svg width="6" height="8" viewBox="0 0 10 12" fill="none" aria-hidden>
              <rect x="1" y="1" width="3" height="10" rx="1" fill="white"/>
              <rect x="6" y="1" width="3" height="10" rx="1" fill="white"/>
            </svg>
          ) : (
            <svg width="6" height="8" viewBox="0 0 10 12" fill="none" aria-hidden>
              <path d="M1 1l8 5-8 5V1z" fill="white"/>
            </svg>
          )}
        </button>
      );
    }

    return <span className="w-5 h-5" aria-hidden />;
  })();

  return (
    <div className="h-[1.375em] w-5 shrink-0 flex items-center justify-center self-start">
      {inner}
    </div>
  );
}

function TranscriptSentenceRow({ gutter, children }) {
  return (
    <div className="flex gap-2 min-w-0 items-start">
      {gutter}
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
    </div>
  );
}

function NarratorAnswerLoading({ narratorId, hideName = false }) {
  const id = narratorId === 'jules' ? 'jules' : 'lea';
  return (
    <div className="flex items-center gap-4">
      <NarratorPortrait narratorId={id} hideName={hideName} />
      <CorrectionLoading />
    </div>
  );
}

// Fill-in-the-blank exercise
function PracticeExercise({ exercise, skillPct, onCorrect }) {
  const [value, setValue] = React.useState('');
  const reportedRef = React.useRef(false);
  const hasInput = value.trim().length > 0;
  const isCorrect = hasInput && value.trim().toLowerCase() === exercise.answer.trim().toLowerCase();

  React.useEffect(() => {
    if (isCorrect && !reportedRef.current) {
      reportedRef.current = true;
      onCorrect?.();
    }
  }, [isCorrect]);

  return (
    <div className="space-y-1">
      <p className="font-display text-[17px] leading-snug text-navy">
        {exercise.sentence.split('___').map((part, i, arr) => (
          <React.Fragment key={i}>
            {part}
            {i < arr.length - 1 && (
              <>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={`mx-1 border-b bg-transparent outline-none text-center text-[17px] font-display transition-colors duration-150 ${
                    !hasInput ? 'border-navy/30 text-navy'
                    : isCorrect ? 'border-green-600 text-green-700'
                    : 'border-wine text-wine'
                  }`}
                  style={{ width: Math.max(90, exercise.answer.length * 12) }}
                  spellCheck={false}
                  autoComplete="off"
                />
                {exercise.hint && (
                  <span className="text-[14px] text-navy/40 font-display ml-1">({exercise.hint})</span>
                )}
                {hasInput && (
                  <span className={`text-[13px] font-mono ml-1 transition-colors ${isCorrect ? 'text-green-600' : 'text-wine/60'}`}>
                    {isCorrect ? '✓' : '✗'}
                  </span>
                )}
              </>
            )}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}

function CorrectionBlock({ original, corrected, className }) {
  const diff = React.useMemo(() => wordDiff(original, corrected), [original, corrected]);
  const [tooltip, setTooltip] = React.useState(null);

  const handleEnter = (el, fix) => {
    if (!el || !fix) return;
    const r = el.getBoundingClientRect();
    setTooltip({
      text: fix,
      style: {
        position: 'fixed',
        left: r.left,
        top: r.top - 6,
        transform: 'translateY(-100%)',
        zIndex: 9999,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      },
    });
  };

  return (
    <div>
      {tooltip && (
        <div
          className="px-2 py-1 bg-navy text-ivory font-display leading-snug pointer-events-none whitespace-nowrap"
          style={{ ...tooltip.style, fontSize: 'inherit' }}
        >
          {tooltip.text}
        </div>
      )}
      <p className={className} spellCheck={false}>
        {diff.map((w, i) =>
          w.struck ? (
            <React.Fragment key={i}>
              <SpellcheckUnderline
                seed={w.word}
                className="cursor-help text-navy"
                onMouseEnter={(e) => handleEnter(e.currentTarget, w.fix)}
                onMouseLeave={() => setTooltip(null)}
              >{w.word}</SpellcheckUnderline>{' '}
            </React.Fragment>
          ) : (
            <React.Fragment key={i}>{w.word}{' '}</React.Fragment>
          )
        )}
      </p>
    </div>
  );
}

function LiveSpeechLine({ utterances, settledText, partialTranscript, correction, className = '' }) {
  const partialTail = partialTranscript
    ? <span className="text-navy/40 italic">{partialTranscript}</span>
    : null;

  const showLiveLine = Boolean(settledText || partialTranscript);

  return (
    <div className={`font-display text-[17px] leading-snug text-navy flex flex-col gap-2 ${className}`} spellCheck={false}>
      {utterances.map((utt, idx) => {
        const isLast = idx === utterances.length - 1;
        const showDiff = isLast && correction && correction.original?.trim() === utt.text.replace(/[.!?,;:]$/, '').trim();
        return (
          <div key={utt.id} className="min-w-0">
            {showDiff
              ? <DiffText original={utt.text} corrected={correction.corrected} side="original" />
              : <span>{utt.text}</span>}
          </div>
        );
      })}
      {showLiveLine && (
        <div className="min-w-0">
          {settledText && (
            <span className="text-navy font-semibold">
              {settledText}
              {partialTranscript && segmentNeedsLeadingSpace(partialTranscript) ? ' ' : null}
            </span>
          )}
          {partialTail}
        </div>
      )}
    </div>
  );
}

const LEVELS = [
  { id: 'A1', label: 'A1', title: 'Beginner', desc: 'Everyday expressions, simple introductions.' },
  { id: 'A2', label: 'A2', title: 'Elementary', desc: 'Familiar topics, simple conversations.' },
  { id: 'B1', label: 'B1', title: 'Intermediate', desc: 'Travel, work, and most daily situations.' },
  { id: 'B2', label: 'B2', title: 'Upper Intermediate', desc: 'Complex topics, fluent with native speakers.' },
  { id: 'C1', label: 'C1', title: 'Advanced', desc: 'Flexible, effective, nuanced expression.' },
  { id: 'C2', label: 'C2', title: 'Mastery', desc: 'Near-native — precision and spontaneity.' },
];

function LevelSidebar({ currentLevel }) {
  const currentIdx = LEVELS.findIndex((l) => l.id === currentLevel);

  return (
    <div className="flex flex-col h-full px-6 py-6 border-l border-line/50">
      <span className="text-[9px] tracking-widest uppercase text-navy/35 mb-5 block">Proficiency levels</span>

      {/* Bar chart */}
      <div className="flex items-end gap-2 mb-6" style={{ height: 100 }}>
        {LEVELS.map((l, i) => {
          const heightPct = 25 + (i / (LEVELS.length - 1)) * 75;
          const isCurrent = l.id === currentLevel;
          const isNext = i === currentIdx + 1;
          return (
            <div key={l.id} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-[9px] font-mono ${isCurrent ? 'text-wine font-bold' : isNext ? 'text-navy/50' : 'text-navy/20'}`}>
                {l.label}
              </span>
              <div
                className={`w-full transition-colors ${isCurrent ? 'bg-wine' : isNext ? 'bg-navy/20' : 'bg-navy/08'}`}
                style={{ height: `${heightPct}%`, opacity: i > currentIdx + 1 ? 0.25 : 1 }}
              />
            </div>
          );
        })}
      </div>

      {/* Current + next level detail */}
      <div className="space-y-4 flex-1">
        {LEVELS.map((l, i) => {
          const isCurrent = l.id === currentLevel;
          const isNext = i === currentIdx + 1;
          if (!isCurrent && !isNext) return null;
          return (
            <div key={l.id} className={`p-3 border ${isCurrent ? 'border-wine/30 bg-wine/5' : 'border-line/40'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[18px] font-mono leading-none ${isCurrent ? 'text-wine' : 'text-navy/40'}`}>{l.label}</span>
                <span className={`text-[9px] tracking-widest uppercase ${isCurrent ? 'text-wine/60' : 'text-navy/30'}`}>
                  {isCurrent ? 'your level' : 'next goal'}
                </span>
              </div>
              <p className={`text-[11px] leading-snug ${isCurrent ? 'text-navy/70' : 'text-navy/40'}`}>
                <span className="font-medium">{l.title} — </span>{l.desc}
              </p>
            </div>
          );
        })}
        {currentIdx === -1 && (
          <p className="text-[12px] text-navy/30 italic">Assess your level to see your progression.</p>
        )}
      </div>
    </div>
  );
}

const CEFR = ['A1','A2','B1','B2','C1','C2'];
function nextLevel(level) {
  const i = CEFR.indexOf(level);
  return i >= 0 && i < CEFR.length - 1 ? CEFR[i + 1] : null;
}

const DEMO_NARRATORS = {
  lea: { id: 'lea', name: 'Léa', src: '/assets/lea.png' },
  jules: { id: 'jules', name: 'Jules', src: '/assets/jules.png' },
};

function NarratorPortrait({ narratorId, speaking, onReplay, hideName = false, size = 'md' }) {
  const n = DEMO_NARRATORS[narratorId];
  if (!n) return null;
  const portraitSize = size === 'lg' ? 'w-16 h-16' : 'w-14 h-14';

  const portraitBody = (
    <div
      className={`relative w-full h-full rounded-full overflow-hidden transition-all duration-200 ${
        speaking ? 'ring-2 ring-wine scale-105 shadow-md' : 'ring-2 ring-wine/25 shadow-sm group-hover:ring-wine/45'
      }`}
    >
      <img src={n.src} alt="" className="w-full h-full object-cover object-top" />
      {speaking && (
        <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-30 pointer-events-none" />
      )}
      {onReplay && (
        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200 ${
          speaking ? 'opacity-100' : 'opacity-0 group-hover:opacity-90 group-focus-visible:opacity-90'
        }`}>
          {speaking ? (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="white" aria-hidden>
              <rect x="2" y="2" width="10" height="10" rx="1.5" fill="white" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200">
              <path d="M8 5v14l11-7z" fill="white" />
            </svg>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col items-center flex-shrink-0 ${hideName ? 'gap-0' : 'gap-1'}`}>
      {onReplay ? (
        <button
          type="button"
          onClick={onReplay}
          className={`group relative ${portraitSize} rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-wine/40`}
          aria-label={speaking ? `Stop ${n.name}` : `Replay ${n.name}'s correction`}
          title={speaking ? 'Stop' : 'Replay'}
        >
          {portraitBody}
        </button>
      ) : (
        <div className={`relative ${portraitSize}`} aria-hidden>
          {portraitBody}
        </div>
      )}
      {!hideName && (
        <span className={`font-display text-[13px] sm:text-[14px] font-semibold transition-colors ${
          speaking ? 'text-wine italic' : 'text-navy/60'
        }`}>
          {n.name}
        </span>
      )}
    </div>
  );
}

function NarratorReactionPanel({ reaction, onDone }) {
  const n = DEMO_NARRATORS[reaction.id];
  const [speaking, setSpeaking] = React.useState(false);
  const [audioLoading, setAudioLoading] = React.useState(true);
  const [playbackTime, setPlaybackTime] = React.useState(null);
  const [timings, setTimings] = React.useState([]);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const decodedRef = React.useRef(null);
  const sessionRef = React.useRef(0);
  const hasAutoPlayedRef = React.useRef(false);

  const stopAudio = React.useCallback(() => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setSpeaking(false);
    setPlaybackTime(null);
    setTimings([]);
  }, []);

  React.useEffect(() => registerSiteAudioStop(stopAudio), [stopAudio]);

  const playReactionAudio = React.useCallback(async () => {
    const siteSession = beginSiteAudioPlayback();
    sessionRef.current += 1;
    const session = sessionRef.current;
    setAudioLoading(true);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      if (!decodedRef.current) {
        const buf = await fetchNarratorAudio(reaction.text, reaction.id);
        if (sessionRef.current !== session || !isSiteAudioPlaybackCurrent(siteSession)) return;
        decodedRef.current = await ctx.decodeAudioData(buf);
      }

      const decoded = decodedRef.current;
      if (sessionRef.current !== session || !isSiteAudioPlaybackCurrent(siteSession)) return;

      setAudioLoading(false);
      setSpeaking(true);
      setTimings(buildWordTimings(reaction.text, decoded.duration));
      setPlaybackTime(0);

      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: reaction.id,
        sourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (sessionRef.current !== session) return;
          setPlaybackTime(t);
          if (t == null) {
            setSpeaking(false);
            setPlaybackTime(null);
            onDone?.();
          }
        },
      });
    } catch {
      if (sessionRef.current === session) {
        setAudioLoading(false);
        setSpeaking(false);
      }
    }
  }, [reaction.id, reaction.text, stopAudio]);

  React.useEffect(() => {
    decodedRef.current = null;
    hasAutoPlayedRef.current = false;
    setAudioLoading(true);
  }, [reaction.id, reaction.text]);

  React.useEffect(() => {
    if (hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    playReactionAudio();
    return () => stopAudio();
    // Auto-play once per reaction; manual replay via portrait tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction.id, reaction.text]);

  const toggleReplay = () => {
    if (speaking) stopAudio();
    else playReactionAudio();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-7 border border-line/50 border-t-0 bg-ivory/40 px-5 py-2.5"
    >
      {audioLoading ? (
        <NarratorAnswerLoading narratorId={reaction.id} />
      ) : (
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleReplay}
            className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-wine/40"
            aria-label={speaking ? `Stop ${n.name}` : `Replay ${n.name}`}
            title={speaking ? 'Stop' : 'Replay'}
          >
            <div className={`w-14 h-14 rounded-full overflow-hidden transition-all duration-300 ${
              speaking ? 'ring-2 ring-wine scale-105 shadow-md' : 'ring-2 ring-wine/25 shadow-sm hover:ring-wine/45 hover:scale-105'
            }`}>
              <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
            </div>
            {speaking && (
              <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-30" />
            )}
          </button>
          <span className="font-display text-[11px] text-navy/45">{n.name}</span>
        </div>
        <NarratorHoverText
          text={reaction.text}
          translation={reaction.translation ?? lookupNarratorTranslation(reaction.text)}
          highlightSpeech={speaking}
          speechPlaybackTime={playbackTime}
          speechTimings={timings}
          className="font-display text-[16px] italic text-navy leading-snug flex-1 min-w-0"
          wrapperClassName="relative flex-1 min-w-0"
        />
      </div>
      )}
    </motion.div>
  );
}

function InlineCorrectionPlayer({ narratorId, text, original, onSave, onSkip }) {
  const n = DEMO_NARRATORS[narratorId];
  const [speaking, setSpeaking] = React.useState(false);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const decodedRef = React.useRef(null);
  const sessionRef = React.useRef(0);

  const stopAudio = React.useCallback(() => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setSpeaking(false);
  }, []);

  React.useEffect(() => registerSiteAudioStop(stopAudio), [stopAudio]);

  const play = React.useCallback(async (ctx) => {
    const siteSession = beginSiteAudioPlayback();
    sessionRef.current += 1;
    const session = sessionRef.current;
    try {
      if (!decodedRef.current) {
        const buf = await fetchNarratorAudio(text, narratorId);
        if (sessionRef.current !== session || !isSiteAudioPlaybackCurrent(siteSession)) return;
        decodedRef.current = await ctx.decodeAudioData(buf);
      }
      if (sessionRef.current !== session || !isSiteAudioPlaybackCurrent(siteSession)) return;
      setSpeaking(true);
      await playDecodedBuffer(ctx, {
        buffer: decodedRef.current,
        narrator: narratorId,
        sourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (sessionRef.current !== session) return;
          if (t == null) setSpeaking(false);
        },
      });
    } catch {
      if (sessionRef.current === session) setSpeaking(false);
    }
  }, [narratorId, text]);

  const replay = React.useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (speaking) { stopAudio(); return; }
    play(ctx);
  }, [speaking, play, stopAudio]);

  React.useEffect(() => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    ctx.resume().then(() => play(ctx));
    return () => { stopAudio(); ctx.close(); ctxRef.current = null; };
  }, [narratorId, text]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onSave}
            className="font-display text-[13px] px-2.5 py-0.5 rounded-full bg-wine text-ivory hover:bg-wine2 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="font-display text-[13px] px-2.5 py-0.5 rounded-full border border-navy/20 text-navy/50 hover:border-navy/40 hover:text-navy/70 transition-colors"
          >
            Skip
          </button>
        </div>
        <button
          type="button"
          onClick={replay}
          className="relative group rounded-full focus:outline-none"
          aria-label={speaking ? `Stop ${n?.name}` : `Replay ${n?.name}`}
        >
          <div className={`w-16 h-16 rounded-full overflow-hidden transition-all duration-300 ${speaking ? 'ring-2 ring-wine scale-105' : 'ring-2 ring-wine/25 hover:ring-wine/45 hover:scale-105'}`}>
            <img src={n?.src} alt={n?.name} className="w-full h-full object-cover object-top" />
          </div>
          {/* Hover play overlay */}
          <div className="absolute inset-0 rounded-full bg-navy/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {speaking ? (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="4" height="10" rx="1" fill="white"/>
                <rect x="8" y="2" width="4" height="10" rx="1" fill="white"/>
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 10 12" fill="none">
                <path d="M1 1l8 5-8 5V1z" fill="white"/>
              </svg>
            )}
          </div>
          {speaking && <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-30" />}
        </button>
      </div>
      <p className="font-display text-[18px] italic text-navy leading-snug flex-1 min-w-0 self-center">
        <DiffText original={original} corrected={text} side="corrected" />
      </p>
    </div>
  );
}

const RECORDING_STOP_GRACE_MS = 1500;
const RECORDING_STOP_SETTLE_MS = 300;

function wait(ms) {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

export function AudioDemoCard({
  fullscreen = false,
  onClose,
  onOpenFullscreen,
  initialTopic,
  initialLearnMode = null,
  initialLearnLevel = null,
  onLearnModeHandled,
  onPracticeTopicHandled,
}) {
  const { effectiveLevel, gainExperience } = useLearnerProfile();
  const {
    utterances,
    partialTranscript,
    settledText,
    audioUrl,
    status,
    error,
    isRecording,
    start,
    stop,
    reset,
  } = useSpeechmaticsTranscription();

  const [time, setTime] = React.useState(0);
  const [register, setRegister] = React.useState('Standard');
  const [source, setSource] = React.useState('mic');
  const [stableWordCount, setStableWordCount] = React.useState(0);
  const [overallLevel, setOverallLevel] = React.useState(null);
  const [overallStrength, setOverallStrength] = React.useState(null);
  const [overallWeakness, setOverallWeakness] = React.useState(null);
  const [practiceTopics, setPracticeTopics] = React.useState([]);
  const [assessingLevel, setAssessingLevel] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('transcript');
  const [practiceSubTab, setPracticeSubTab] = React.useState('comprehension');
  const [practiceExercises, setPracticeExercises] = React.useState(null);
  const [loadingPractice, setLoadingPractice] = React.useState(false);
  const [skillProgress, setSkillProgress] = React.useState({});
  const [completedInBatch, setCompletedInBatch] = React.useState(new Set());
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [inputMode, setInputMode] = React.useState('speak');
  const [lastSpeakWriteMode, setLastSpeakWriteMode] = React.useState('speak'); // Track last speak/write mode
  const [writeText, setWriteText] = React.useState('');
  const [writeCorrection, setWriteCorrection] = React.useState(null);
  const [writeCorrecting, setWriteCorrecting] = React.useState(false);
  const [writeEditing, setWriteEditing] = React.useState(true);
  const [writeSubmittedText, setWriteSubmittedText] = React.useState(null);
  const writeTextareaRef = React.useRef(null);
  const writeBoxRef = React.useRef(null);
  const [speakCorrection, setSpeakCorrection] = React.useState(null);
  const [fetchingCorrection, setFetchingCorrection] = React.useState(false);
  const [manualCorrection, setManualCorrection] = React.useState(null);
  const [manualCorrecting, setManualCorrecting] = React.useState(false);
  const [previewCorrection, setPreviewCorrection] = React.useState(null);
  const [fetchingPreview, setFetchingPreview] = React.useState(false);
  const [narratorReaction, setNarratorReaction] = React.useState(null);
  const [correctionReaderId, setCorrectionReaderId] = React.useState(null);
  const [sentenceCongrats, setSentenceCongrats] = React.useState(null);
  const [correctionUtteranceId, setCorrectionUtteranceId] = React.useState(null);
  const [awaitingRepeat, setAwaitingRepeat] = React.useState(false);
  const [repeatFeedback, setRepeatFeedback] = React.useState(null);
  const [repeatAttemptText, setRepeatAttemptText] = React.useState(null);
  const [repeatUtteranceBase, setRepeatUtteranceBase] = React.useState(0);
  const [originalUtteranceEnd, setOriginalUtteranceEnd] = React.useState(0);
  const [showRepeatHint, setShowRepeatHint] = React.useState(false);
  const [stoppingRecording, setStoppingRecording] = React.useState(false);
  const stopRecordingSessionRef = React.useRef(0);
  const speakCorrectionUiRef = React.useRef({
    previewCorrection: null,
    manualCorrection: null,
    sentenceCongrats: null,
    narratorReaction: null,
    correctionReaderId: null,
    manualCorrecting: false,
    fetchingPreview: false,
  });
  const [playbackTime, setPlaybackTime] = React.useState(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playingUtteranceId, setPlayingUtteranceId] = React.useState(null);
  const [playbackWords, setPlaybackWords] = React.useState(null);
  const audioRef = React.useRef(null);
  const recordingSessionRef = React.useRef(null);

  // Parisian voice playback timing
  const [parisianPlaybackTime, setParisianPlaybackTime] = React.useState(null);
  const [parisianTimings, setParisianTimings] = React.useState([]);
  const [parisianSpeakingText, setParisianSpeakingText] = React.useState(null);
  const [narratorVoiceLoadingKey, setNarratorVoiceLoadingKey] = React.useState(null);

  // Word discovery
  const [wordData, setWordData] = React.useState(null);
  const [wordLoading, setWordLoading] = React.useState(false);
  const [wordUserSentence, setWordUserSentence] = React.useState('');
  const [wordCorrection, setWordCorrection] = React.useState(null);
  const [wordCorrecting, setWordCorrecting] = React.useState(false);
  const [wordPlaying, setWordPlaying] = React.useState(false);
  const wordPlayingRef = React.useRef(false); // sync ref to avoid stale closure
  const [wordPlayError, setWordPlayError] = React.useState(null);
  const [wordPracticeMode, setWordPracticeMode] = React.useState('speak'); // 'write' | 'speak'
  const [narrator, setNarrator] = React.useState('lea'); // 'jules' | 'lea'
  const [showStartHint, setShowStartHint] = React.useState(true);
  const [showWriteHint, setShowWriteHint] = React.useState(false);
  const [pendingWriteHint, setPendingWriteHint] = React.useState(false);
  const [writeHintKey, setWriteHintKey] = React.useState(0);
  const [showCorrectHint, setShowCorrectHint] = React.useState(false);
  const [highlightMic, setHighlightMic] = React.useState(false);
  const [highlightDiscover, setHighlightDiscover] = React.useState(false);
  const [vocabLevel, setVocabLevel] = React.useState(null);
  const wordUtteranceBaseRef = React.useRef(0); // utterance count when word-speak started
  const wordAudioCtxRef = React.useRef(null);
  const wordAudioSrcRef = React.useRef(null);
  const utterancesRef = React.useRef([]); // sync ref to read current utterances immediately after stop()
  const repeatUtteranceBaseRef = React.useRef(0);
  const originalUtteranceEndRef = React.useRef(0);
  const awaitingRepeatRef = React.useRef(false);
  const checkRepeatAttemptRef = React.useRef(() => {});
  const repeatAutoStoppingRef = React.useRef(false);
  const correctionAudioPlayedRef = React.useRef(null);


  const prevPartialRef = React.useRef('');
  const prevLengthRef = React.useRef(0);
  const hadContentRef = React.useRef(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    utterancesRef.current = utterances; // keep ref in sync
  }, [utterances]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [utterances, settledText, partialTranscript, repeatAttemptText, repeatFeedback, isRecording, repeatUtteranceBase]);

  React.useEffect(() => {
    if (!partialTranscript) { setStableWordCount(0); prevPartialRef.current = ''; return; }
    const prev = prevPartialRef.current.trim().split(/\s+/).filter(Boolean);
    const curr = partialTranscript.trim().split(/\s+/).filter(Boolean);
    let stable = 0;
    while (stable < prev.length && stable < curr.length && prev[stable] === curr[stable]) stable++;
    setStableWordCount(Math.max(stable, curr.length - 1));
    prevPartialRef.current = partialTranscript;
  }, [partialTranscript]);

  React.useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const discoverWord = async () => {
    setWordLoading(true);
    setWordData(null);
    setWordUserSentence('');
    setWordCorrection(null);
    try {
      const res = await fetch('/api/word', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      setWordData(data);
    } catch {}
    setWordLoading(false);
  };

  // Auto-load a word when switching to discover mode
  React.useEffect(() => {
    if (inputMode === 'discover' && !wordData && !wordLoading) {
      discoverWord();
    }
  }, [inputMode]);

  // Show start hint when switching to speak mode
  React.useEffect(() => {
    if (inputMode === 'speak' && !isRecording) {
      setShowStartHint(true);
      setShowWriteHint(false);
    }
  }, [inputMode, isRecording]);

  // Keep speak correction UI in sync while on the speak tab
  React.useEffect(() => {
    if (inputMode !== 'speak') return;
    speakCorrectionUiRef.current = {
      previewCorrection,
      manualCorrection,
      sentenceCongrats,
      narratorReaction,
      correctionReaderId,
      manualCorrecting,
      fetchingPreview,
    };
  }, [inputMode, previewCorrection, manualCorrection, sentenceCongrats, narratorReaction, correctionReaderId, manualCorrecting, fetchingPreview]);

  const clearCorrectionUi = React.useCallback(() => {
    setPreviewCorrection(null);
    setManualCorrection(null);
    setSentenceCongrats(null);
    setCorrectionUtteranceId(null);
    setNarratorReaction(null);
    setCorrectionReaderId(null);
    setManualCorrecting(false);
    setFetchingPreview(false);
    setAwaitingRepeat(false);
    setRepeatFeedback(null);
    setRepeatAttemptText(null);
    setRepeatUtteranceBase(0);
    setOriginalUtteranceEnd(0);
    originalUtteranceEndRef.current = 0;
    setShowRepeatHint(false);
    correctionAudioPlayedRef.current = null;
    setNarratorVoiceLoadingKey(null);
  }, []);

  const prevUtteranceCountRef = React.useRef(0);

  const getLatestSpeakUtterance = React.useCallback(() => {
    const list = awaitingRepeat ? utterances.slice(0, originalUtteranceEnd) : utterances;
    return list[list.length - 1] ?? null;
  }, [utterances, awaitingRepeat, originalUtteranceEnd]);

  const getLatestSpeakText = React.useCallback(
    () => getLatestSpeakUtterance()?.text?.trim() || '',
    [getLatestSpeakUtterance],
  );

  React.useEffect(() => {
    if (awaitingRepeat) {
      prevUtteranceCountRef.current = utterances.length;
      return;
    }
    if (utterances.length > prevUtteranceCountRef.current && prevUtteranceCountRef.current > 0) {
      clearCorrectionUi();
    }
    prevUtteranceCountRef.current = utterances.length;
  }, [utterances.length, awaitingRepeat, clearCorrectionUi]);

  const restoreSpeakCorrectionUi = React.useCallback(() => {
    const s = speakCorrectionUiRef.current;
    setPreviewCorrection(s.previewCorrection);
    setManualCorrection(s.manualCorrection);
    setSentenceCongrats(s.sentenceCongrats);
    setNarratorReaction(s.narratorReaction);
    setCorrectionReaderId(s.correctionReaderId);
    setManualCorrecting(s.manualCorrecting);
    setFetchingPreview(s.fetchingPreview);
  }, []);

  const resetWriteSession = React.useCallback(() => {
    setWriteText('');
    setWriteCorrection(null);
    setWriteCorrecting(false);
    setWriteEditing(true);
    setWriteSubmittedText(null);
    setShowWriteHint(false);
    setPendingWriteHint(true);
    setWriteHintKey((k) => k + 1);
  }, []);

  // Run write hint + focus once write UI is mounted (no scroll — keeps the page still)
  React.useEffect(() => {
    if (inputMode !== 'write' || !pendingWriteHint || writeText.trim()) return;

    setPendingWriteHint(false);
    setShowWriteHint(true);
    setWriteHintKey((k) => k + 1);

    requestAnimationFrame(() => {
      const textarea = writeTextareaRef.current;
      if (!textarea) return;
      textarea.scrollTop = 0;
      textarea.focus({ preventScroll: true });
    });
  }, [inputMode, pendingWriteHint, writeText]);

  // Dismiss start hint when recording begins or after 6s
  React.useEffect(() => {
    if (isRecording) setShowStartHint(false);
  }, [isRecording]);
  React.useEffect(() => {
    if (!showStartHint) return;
    const t = setTimeout(() => setShowStartHint(false), 6000);
    return () => clearTimeout(t);
  }, [showStartHint]);

  // Dismiss write hint when user types or after 6s
  React.useEffect(() => {
    if (writeText.trim()) setShowWriteHint(false);
  }, [writeText]);
  React.useEffect(() => {
    if (!showWriteHint) return;
    const t = setTimeout(() => setShowWriteHint(false), 6000);
    return () => clearTimeout(t);
  }, [showWriteHint]);

  // Show "Parisien !" hint once when the latest sentence has been recorded
  React.useEffect(() => {
    const latest = utterances[utterances.length - 1];
    if (latest?.audioUrl && !isRecording && status !== 'connecting') {
      setShowCorrectHint(true);
    }
  }, [utterances, isRecording, status]);

  const correctWordSentence = async () => {
    if (!wordUserSentence.trim()) return;
    setWordCorrecting(true);
    setWordCorrection(null);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: wordUserSentence, register }),
      });
      const data = await res.json();
      setWordCorrection(data);
      if (data?.corrected?.trim() && data.corrected.trim() !== wordUserSentence.trim()) {
        registerCorrectionKeyterms(wordUserSentence, data.corrected);
      }
    } catch {}
    setWordCorrecting(false);
  };

  const stopParisianAudio = React.useCallback(() => {
    wordPlayingRef.current = false;
    try { wordAudioSrcRef.current?.stop(); } catch {}
    wordAudioSrcRef.current = null;
    setParisianPlaybackTime(null);
    setParisianTimings([]);
    setParisianSpeakingText(null);
    setWordPlaying(false);
    setNarratorVoiceLoadingKey(null);
  }, []);

  const playNarratorLine = React.useCallback(async (line) => {
    if (!line?.text) return;
    const session = beginSiteAudioPlayback();
    const activeNarrator = resolveClientNarrator(line.id);
    const trimmed = line.text.trim();
    setNarrator(activeNarrator);
    setNarratorVoiceLoadingKey(`${activeNarrator}:${trimmed}`);
    try {
      if (!wordAudioCtxRef.current) wordAudioCtxRef.current = new AudioContext();
      const ctx = wordAudioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const buf = await fetchNarratorAudio(trimmed, activeNarrator);
      if (!isSiteAudioPlaybackCurrent(session)) return;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (!isSiteAudioPlaybackCurrent(session)) return;
      setNarratorVoiceLoadingKey(null);
      wordPlayingRef.current = true;
      setWordPlaying(true);
      setParisianSpeakingText(trimmed);
      setParisianTimings(buildWordTimings(trimmed, decoded.duration));
      setParisianPlaybackTime(0);
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: activeNarrator,
        sourceRef: wordAudioSrcRef,
        connectSource: connectNarratorSource,
        playbackSession: session,
        onTimeUpdate: (t) => {
          if (!wordPlayingRef.current) return;
          setParisianPlaybackTime(t);
          if (t == null) stopParisianAudio();
        },
      });
    } catch {
      stopParisianAudio();
    }
  }, [stopParisianAudio]);

  const finalizeCorrection = React.useCallback((correction, readerId) => {
    const corrected = correction.corrected?.trim() || '';
    const original = correction.original?.trim() || '';
    const targetUtteranceId = utterancesRef.current[utterancesRef.current.length - 1]?.id ?? null;
    setCorrectionUtteranceId(targetUtteranceId);
    setNarrator(readerId);
    setNarratorReaction(null);
    setPreviewCorrection(null);

    if (matchesCorrectionTarget(original, corrected)) {
      setManualCorrection(null);
      setCorrectionReaderId(readerId);
      setSentenceCongrats(getAlreadyCorrectLine(readerId));
      setAwaitingRepeat(false);
      setRepeatFeedback(null);
      setRepeatAttemptText(null);
      correctionAudioPlayedRef.current = null;
      gainExperience(1);
      return;
    }

    setSentenceCongrats(null);
    setManualCorrection(correction);
    setCorrectionReaderId(readerId);
    if (corrected && corrected !== original) {
      const narration = corrected;
      setNarratorVoiceLoadingKey(`${resolveClientNarrator(readerId)}:${narration}`);
      registerCorrectionKeyterms(original, corrected);
    }
    const needsRepeat = !isStrictCorrectionMatch(correction.original, correction.corrected);
    setAwaitingRepeat(needsRepeat);
    setRepeatFeedback(null);
    setRepeatAttemptText(null);
    const base = utterancesRef.current.length;
    repeatUtteranceBaseRef.current = base;
    setRepeatUtteranceBase(base);
    originalUtteranceEndRef.current = base;
    setOriginalUtteranceEnd(base);
    if (!needsRepeat) {
      correctionAudioPlayedRef.current = null;
    }
  }, [gainExperience]);

  const applySpeakCorrection = React.useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const readerId = pickNarratorReaction(effectiveLevel).id;
    setCorrectionReaderId(readerId);
    setNarrator(readerId);
    setManualCorrecting(true);
    setNarratorReaction(null);
    setPreviewCorrection(null);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, register: 'Parisien', learnerLevel: effectiveLevel }),
      });
      const data = await res.json();
      const corrected = data.corrected?.trim() || trimmed;
      finalizeCorrection({
        original: trimmed,
        corrected,
        translation: data.translation?.trim() || null,
      }, readerId);
    } catch {
      // keep UI usable if correction fails
    } finally {
      setManualCorrecting(false);
    }
  }, [effectiveLevel, finalizeCorrection]);

  const checkRepeatAttempt = React.useCallback((repeatText) => {
    const target = manualCorrection?.corrected;
    const attempt = repeatText.trim();
    if (!target || !attempt) return;
    setRepeatAttemptText(attempt);
    if (matchesCorrectionTarget(attempt, target)) {
      gainExperience(1);
      setRepeatFeedback('success');
      setAwaitingRepeat(false);
      setShowRepeatHint(false);
      setSentenceCongrats(getRepeatSuccessLine(correctionReaderId));
      return;
    }
    setRepeatFeedback('fail');
    playNarratorLine(getRepeatFailLine(correctionReaderId));
  }, [manualCorrection, correctionReaderId, gainExperience, playNarratorLine]);

  React.useEffect(() => {
    awaitingRepeatRef.current = awaitingRepeat;
  }, [awaitingRepeat]);

  React.useEffect(() => {
    checkRepeatAttemptRef.current = checkRepeatAttempt;
  }, [checkRepeatAttempt]);

  const handleRepeatSpeechFinal = React.useCallback(async (utteranceText) => {
    if (!awaitingRepeatRef.current || repeatAutoStoppingRef.current) return;
    repeatAutoStoppingRef.current = true;
    try {
      stop();
      checkRepeatAttemptRef.current(utteranceText);
    } finally {
      repeatAutoStoppingRef.current = false;
    }
  }, [stop]);

  React.useEffect(() => {
    if (inputMode === 'speak' && awaitingRepeat && !isRecording && repeatFeedback !== 'success') {
      setShowRepeatHint(true);
    } else {
      setShowRepeatHint(false);
    }
  }, [inputMode, awaitingRepeat, isRecording, repeatFeedback]);


  const activateWriteMode = React.useCallback(() => {
    stopParisianAudio();
    clearCorrectionUi();
    resetWriteSession();
    setInputMode('write');
    setLastSpeakWriteMode('write');
    setShowStartHint(false);
  }, [stopParisianAudio, clearCorrectionUi, resetWriteSession]);

  const activateSpeakMode = React.useCallback(() => {
    stopParisianAudio();
    clearCorrectionUi();
    restoreSpeakCorrectionUi();
    setInputMode('speak');
    setLastSpeakWriteMode('speak');
    setShowWriteHint(false);
    setPendingWriteHint(false);
    if (!isRecording) setShowStartHint(true);
  }, [stopParisianAudio, clearCorrectionUi, restoreSpeakCorrectionUi, isRecording]);

  const playParisianWord = async (textOverride, narratorOverride) => {
    if (wordPlayingRef.current) { stopParisianAudio(); return; }
    const text = textOverride || wordData?.example;
    const activeNarrator = resolveClientNarrator(narratorOverride || narrator);
    if (!text) return;
    const session = beginSiteAudioPlayback();
    setWordPlayError(null);
    wordPlayingRef.current = true;
    setWordPlaying(true);
    setParisianSpeakingText(text);
    setParisianTimings([]);
    setParisianPlaybackTime(0);
    try {
      if (!wordAudioCtxRef.current) wordAudioCtxRef.current = new AudioContext();
      const ctx = wordAudioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const buf = await fetchNarratorAudio(text, activeNarrator);
      if (!isSiteAudioPlaybackCurrent(session)) return;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (!isSiteAudioPlaybackCurrent(session)) return;
      setParisianTimings(buildWordTimings(text, decoded.duration));

      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: activeNarrator,
        sourceRef: wordAudioSrcRef,
        connectSource: connectNarratorSource,
        playbackSession: session,
        onTimeUpdate: (t) => {
          if (!wordPlayingRef.current) return;
          setParisianPlaybackTime(t);
          if (t == null) stopParisianAudio();
        },
      });
    } catch (err) {
      console.error('[play] failed:', err);
      setWordPlayError('Audio unavailable — read the text on screen.');
      stopParisianAudio();
    }
  };

  const assessOverallLevel = async () => {
    const fullText = inputMode === 'write'
      ? writeText.trim()
      : utterances.map((u) => u.text).join(' ');
    if (!fullText) return;
    setAssessingLevel(true);
    setOverallLevel(null); setOverallStrength(null); setOverallWeakness(null); setPracticeTopics([]);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText, register, assessOnly: true, learnerLevel: effectiveLevel }),
      });
      const data = await res.json();
      setOverallLevel(data.level || null);
      setOverallStrength(data.strength || null);
      setOverallWeakness(data.weakness || null);
      setPracticeTopics(data.topics || (data.weakness ? [data.weakness] : []));
    } catch {}
    setAssessingLevel(false);
  };

  const loadPractice = async (topic, { openFullscreen = false } = {}) => {
    const t = topic || overallWeakness;
    if (!t) return;
    if (openFullscreen) onOpenFullscreen?.(t);
    setActiveTab('practice');
    setPracticeExercises(null);
    setCompletedInBatch(new Set());
    setLoadingPractice(true);
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t }),
      });
      const data = await res.json();
      setPracticeExercises(data.exercises || []);
    } catch { setPracticeExercises([]); }
    setLoadingPractice(false);
  };

  const startPractice = async (topic) => {
    await loadPractice(topic, { openFullscreen: true });
  };

  const practiceMore = async () => {
    if (!overallWeakness || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: overallWeakness }),
      });
      const data = await res.json();
      const newExercises = (data.exercises || []).map((ex, i) => ({ ...ex, _id: `more-${Date.now()}-${i}` }));
      setPracticeExercises((prev) => [...(prev || []), ...newExercises]);
      setCompletedInBatch(new Set());
    } catch {}
    setLoadingMore(false);
  };

  const handleExerciseCorrect = (exerciseIndex, objective) => {
    setCompletedInBatch((prev) => new Set([...prev, exerciseIndex]));
    const key = objective || overallWeakness || 'general';
    setSkillProgress((prev) => ({ ...prev, [key]: Math.min(100, (prev[key] || 0) + 5) }));
    bumpTargetProgressByTopic(key, 5);
  };

  const fetchPreviewCorrection = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPreviewCorrection(null);
    setFetchingPreview(true);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, register: 'Parisien', learnerLevel: effectiveLevel }),
      });
      const data = await res.json();
      const corrected = data.corrected?.trim() || trimmed;
      if (corrected !== trimmed) {
        setPreviewCorrection({
          original: trimmed,
          corrected,
          translation: data.translation?.trim() || null,
        });
        registerCorrectionKeyterms(trimmed, corrected);
      }
    } catch {}
    setFetchingPreview(false);
  };

  const chatDiffCorrection = manualCorrection?.original
    ? manualCorrection
    : previewCorrection?.original
      ? previewCorrection
      : null;

  const showChatDiff = chatDiffCorrection
    && chatDiffCorrection.corrected?.trim() !== chatDiffCorrection.original?.trim();

  const hasSpeakCorrection = Boolean(
    manualCorrection
    && manualCorrection.corrected?.trim() !== manualCorrection.original?.trim()
    && correctionReaderId,
  );
  const showSpeakCorrectionBar = inputMode === 'speak' && (manualCorrecting || hasSpeakCorrection);

  const pendingNarratorId = correctionReaderId
    ?? narratorReaction?.id
    ?? pickNarratorReaction(effectiveLevel).id;

  const manualCorrectionNarration = React.useMemo(() => {
    if (!manualCorrection?.corrected?.trim()) return '';
    if (manualCorrection.corrected.trim() === manualCorrection.original?.trim()) {
      return manualCorrection.corrected.trim();
    }
    return manualCorrection.corrected.trim();
  }, [manualCorrection]);

  const correctionVoiceLoadingKey = manualCorrectionNarration && correctionReaderId
    ? `${resolveClientNarrator(correctionReaderId)}:${manualCorrectionNarration}`
    : null;
  const isCorrectionVoiceLoading = Boolean(
    correctionVoiceLoadingKey && narratorVoiceLoadingKey === correctionVoiceLoadingKey,
  );

  const repeatUtterances = utterances.slice(repeatUtteranceBase);
  const mainUtterances = awaitingRepeat ? utterances.slice(0, originalUtteranceEnd) : utterances;
  const showLiveTranscriptLine = !awaitingRepeat && (
    settledText
    || partialTranscript
    || (isRecording && mainUtterances.length > 0)
  );
  const showRepeatLine = hasSpeakCorrection && awaitingRepeat && (isRecording || !!repeatAttemptText);

  const getLiveSpeakText = React.useCallback((baseUtterances = utterances) => (
    joinTranscriptSegments(
      baseUtterances.map((u) => u.text).join(' '),
      settledText,
      partialTranscript,
    ).replace(/\s+/g, ' ')
  ), [utterances, settledText, partialTranscript]);

  const stopRecordingWithGrace = React.useCallback(async () => {
    if (!isRecording) return;
    const session = ++stopRecordingSessionRef.current;
    setStoppingRecording(true);
    try {
      await wait(RECORDING_STOP_GRACE_MS);
      if (stopRecordingSessionRef.current !== session) return;
      await stop();
      await wait(RECORDING_STOP_SETTLE_MS);
    } finally {
      if (stopRecordingSessionRef.current === session) {
        setStoppingRecording(false);
      }
    }
  }, [isRecording, stop]);

  const toggleRecording = async () => {
    if (stoppingRecording) return;
    if (isRecording) {
      if (awaitingRepeat && manualCorrection?.corrected) {
        const repeatText = getLiveSpeakText(
          utterances.slice(repeatUtteranceBaseRef.current),
        );
        await stopRecordingWithGrace();
        if (repeatText) checkRepeatAttempt(repeatText);
        return;
      }

      await stopRecordingWithGrace();
      return;
    }
    setTime(0);
    setPlaybackTime(null);
    setIsPlaying(false);
    if (awaitingRepeat) {
      const base = utterancesRef.current.length;
      repeatUtteranceBaseRef.current = base;
      setRepeatUtteranceBase(base);
      setRepeatFeedback(null);
      setRepeatAttemptText(null);
      setShowRepeatHint(false);
    } else {
      setSpeakCorrection(null);
      setPreviewCorrection(null);
      setNarratorReaction(null);
      setManualCorrection(null);
      setSentenceCongrats(null);
      setCorrectionUtteranceId(null);
      setManualCorrecting(false);
      setAwaitingRepeat(false);
      setRepeatFeedback(null);
      correctionAudioPlayedRef.current = null;
    }
    setHighlightMic(false);
    setShowStartHint(false);
    repeatAutoStoppingRef.current = false;
    stopParisianAudio();
    await start(awaitingRepeat ? {
      utteranceEndMs: 1000,
      endpointing: 500,
      onSpeechFinal: handleRepeatSpeechFinal,
    } : {});
  };

  const rafRef = React.useRef(null);

  const stopRaf = React.useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startRaf = React.useCallback(() => {
    stopRaf();
    const tick = () => {
      if (!audioRef.current || audioRef.current.ended) return;
      setPlaybackTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  const preparePlaybackWords = React.useCallback((utt, audio) => {
    if (utt.words?.length > 0) {
      setPlaybackWords(null);
      return;
    }
    if (!audio) return;

    const apply = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const text = utt.text?.trim();
      if (!text) return;
      setPlaybackWords({
        utteranceId: utt.id,
        words: buildWordTimings(text, audio.duration).map((t) => ({
          word: t.word,
          punctuated_word: t.word,
          start: t.start,
          end: t.end,
        })),
      });
    };

    if (audio.readyState >= 1) apply();
    else audio.addEventListener('loadedmetadata', apply, { once: true });
  }, []);

  const stopAllCardAudio = React.useCallback(() => {
    recordingSessionRef.current = null;
    stopParisianAudio();
    stopRaf();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setPlaybackTime(null);
    setPlayingUtteranceId(null);
    setPlaybackWords(null);
  }, [stopParisianAudio, stopRaf]);

  React.useEffect(() => registerSiteAudioStop(stopAllCardAudio), [stopAllCardAudio]);

  const toggleUtterancePlayback = React.useCallback((utt) => {
    if (!utt?.audioUrl) return;
    if (playingUtteranceId === utt.id && isPlaying) {
      recordingSessionRef.current = null;
      audioRef.current?.pause();
      stopRaf();
      setIsPlaying(false);
      return;
    }

    const session = beginSiteAudioPlayback();
    recordingSessionRef.current = session;
    stopRaf();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(utt.audioUrl);
    audioRef.current = audio;
    audio.onloadedmetadata = () => preparePlaybackWords(utt, audio);
    audio.onended = () => {
      recordingSessionRef.current = null;
      stopRaf();
      setIsPlaying(false);
      setPlaybackTime(null);
      setPlayingUtteranceId(null);
      setPlaybackWords(null);
    };

    preparePlaybackWords(utt, audio);
    if (!isSiteAudioPlaybackCurrent(session)) return;

    setPlayingUtteranceId(utt.id);
    setPlaybackTime(0);
    audio.play().catch(() => {});
    if (!isSiteAudioPlaybackCurrent(session)) {
      audio.pause();
      setPlayingUtteranceId(null);
      return;
    }
    startRaf();
    setIsPlaying(true);
  }, [isPlaying, playingUtteranceId, stopRaf, preparePlaybackWords, startRaf]);

  React.useEffect(() => () => stopRaf(), [stopRaf]);

  React.useEffect(() => {
    if (!initialTopic) return;
    setOverallWeakness(initialTopic);
    setPracticeTopics([initialTopic]);
    loadPractice(initialTopic);
    onPracticeTopicHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!initialLearnMode) return;

    const clearHighlights = () => {
      window.setTimeout(() => {
        setHighlightMic(false);
        setHighlightDiscover(false);
      }, 10000);
    };

    if (initialLearnMode === 'speak') {
      setInputMode('speak');
      setLastSpeakWriteMode('speak');
      setActiveTab('transcript');
      setShowStartHint(true);
      setHighlightMic(true);
      clearHighlights();
    } else if (initialLearnMode === 'vocab') {
      const level = initialLearnLevel || 'A2';
      const topic = `${level} French vocabulary and grammar`;
      setVocabLevel(level);
      setInputMode('speak');
      setLastSpeakWriteMode('speak');
      setOverallWeakness(topic);
      setPracticeTopics([topic]);
      loadPractice(topic);
      clearHighlights();
    } else if (initialLearnMode === 'discover') {
      setInputMode('discover');
      setHighlightDiscover(true);
      clearHighlights();
    }

    onLearnModeHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLearnMode, initialLearnLevel]);

  const correctWriting = async () => {
    if (!writeText.trim()) return;
    setWriteCorrecting(true);
    setWriteCorrection(null);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: writeText, register, learnerLevel: effectiveLevel }),
      });
      const data = await res.json();
      setWriteCorrection(data);
      if (data?.corrected?.trim() && data.corrected.trim() !== writeText.trim()) {
        registerCorrectionKeyterms(writeText, data.corrected);
      }
      if (data.corrected?.trim() !== writeText.trim()) setWriteEditing(false);
    } catch {}
    setWriteCorrecting(false);
  };

  // Estimate word timings for Parisian voice playback — removed; use speechHighlight lib

  const finishWriteInput = () => {
    const trimmed = writeText.trim();
    if (!trimmed || trimmed === writeSubmittedText) return;
    setWriteSubmittedText(trimmed);
    setWriteCorrection(null);
    setManualCorrection(null);
    setPreviewCorrection(null);
    setNarratorReaction(pickNarratorReaction(effectiveLevel));
    fetchPreviewCorrection(writeText);
    setWriteEditing(false);
  };

  const replayCorrectionAudio = React.useCallback(() => {
    if (!manualCorrectionNarration || !correctionReaderId) return;
    if (
      wordPlayingRef.current
      && parisianSpeakingText === manualCorrectionNarration.trim()
    ) {
      stopParisianAudio();
      return;
    }
    playNarratorLine({ id: correctionReaderId, text: manualCorrectionNarration });
  }, [manualCorrectionNarration, correctionReaderId, parisianSpeakingText, stopParisianAudio, playNarratorLine]);

  const [savingExpression, setSavingExpression] = React.useState(false);

  const saveCurrentExpression = React.useCallback(async () => {
    if (!manualCorrection?.corrected?.trim() || !correctionReaderId) return false;
    setSavingExpression(true);
    try {
      const utt = utterances.find((u) => u.id === correctionUtteranceId)
        ?? getLatestSpeakUtterance();
      let originalAudioBlob = null;
      if (utt?.audioUrl) {
        try {
          originalAudioBlob = await fetch(utt.audioUrl).then((r) => r.blob());
        } catch {}
      }
      let correctedAudioBuffer = null;
      try {
        correctedAudioBuffer = await fetchNarratorAudio(
          manualCorrection.corrected.trim(),
          correctionReaderId,
        );
      } catch {}
      await saveCorrection({
        original: manualCorrection.original,
        corrected: manualCorrection.corrected,
        translation: manualCorrection.translation,
        narratorId: correctionReaderId,
        originalAudioBlob,
        correctedAudioBuffer,
      });
      return true;
    } catch {
      return false;
    } finally {
      setSavingExpression(false);
    }
  }, [
    manualCorrection,
    correctionReaderId,
    correctionUtteranceId,
    utterances,
    getLatestSpeakUtterance,
  ]);

  React.useEffect(() => {
    if (!manualCorrection?.corrected?.trim() || !correctionReaderId) return;
    if (matchesCorrectionTarget(manualCorrection.original, manualCorrection.corrected)) return;
    const key = `${correctionReaderId}:${manualCorrection.corrected.trim()}`;
    if (correctionAudioPlayedRef.current === key) return;
    correctionAudioPlayedRef.current = key;
    playNarratorLine({ id: correctionReaderId, text: manualCorrection.corrected.trim() });
  }, [manualCorrection, correctionReaderId, playNarratorLine]);

  React.useEffect(() => {
    if (!sentenceCongrats?.text || !correctionReaderId) return;
    const key = `${correctionReaderId}:${sentenceCongrats.text}`;
    if (correctionAudioPlayedRef.current === key) return;
    correctionAudioPlayedRef.current = key;
    playNarratorLine({ id: correctionReaderId, text: sentenceCongrats.text });
  }, [sentenceCongrats, correctionReaderId, playNarratorLine]);

  const correctNow = async () => {
    const text = inputMode === 'write'
      ? writeText.trim()
      : getLatestSpeakText();
    if (!text) return;
    const readerId = narratorReaction?.id ?? correctionReaderId ?? pickNarratorReaction(effectiveLevel).id;
    setCorrectionReaderId(readerId);
    setNarrator(readerId);
    setNarratorReaction(null);

    if (
      previewCorrection?.original?.trim() === text
      && previewCorrection?.corrected?.trim()
    ) {
      finalizeCorrection(previewCorrection, readerId);
      return;
    }

    setManualCorrecting(true);
    setManualCorrection(null);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, register: 'Parisien', learnerLevel: effectiveLevel }),
      });
      const data = await res.json();
      finalizeCorrection(
        {
          original: text,
          corrected: data.corrected?.trim() || text,
          translation: data.translation?.trim() || null,
        },
        readerId,
      );
    } catch {}
    setManualCorrecting(false);
  };

  const resetTranscript = () => {
    stopRecordingSessionRef.current += 1;
    setStoppingRecording(false);
    stopRaf();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    reset();
    setTime(0);
    setSpeakCorrection(null);
    setFetchingCorrection(false);
    setNarratorReaction(null);
    setCorrectionReaderId(null);
    setManualCorrection(null);
    setSentenceCongrats(null);
    setCorrectionUtteranceId(null);
    setManualCorrecting(false);
    setPreviewCorrection(null);
    setFetchingPreview(false);
    setAwaitingRepeat(false);
    setRepeatFeedback(null);
    setRepeatAttemptText(null);
    setRepeatUtteranceBase(0);
    setOriginalUtteranceEnd(0);
    originalUtteranceEndRef.current = 0;
    setShowRepeatHint(false);
    correctionAudioPlayedRef.current = null;
    setNarratorVoiceLoadingKey(null);
    speakCorrectionUiRef.current = {
      previewCorrection: null,
      manualCorrection: null,
      sentenceCongrats: null,
      narratorReaction: null,
      correctionReaderId: null,
      manualCorrecting: false,
      fetchingPreview: false,
    };
    setWriteText('');
    setWriteCorrection(null);
    setWriteCorrecting(false);
    setWriteSubmittedText(null);
    prevLengthRef.current = 0;
    hadContentRef.current = false;
    prevPartialRef.current = '';
    setOverallLevel(null); setOverallStrength(null); setOverallWeakness(null); setPracticeTopics([]);
    setActiveTab('transcript');
    setPracticeExercises(null);
    setSkillProgress({});
    setCompletedInBatch(new Set());
    setWriteEditing(true);
    setPlaybackTime(null);
    setIsPlaying(false);
    setPlayingUtteranceId(null);
    setShowCorrectHint(false);
  };

  const hasRecordedAudio = utterances.some((u) => u.audioUrl);
  const mm = String(Math.floor(time / 60)).padStart(2, '0');
  const ss = String(time % 60).padStart(2, '0');
  const isLive = isRecording || status === 'connecting';
  const hasContent = utterances.length > 0 || !!partialTranscript || !!settledText;
  if (hasContent) hadContentRef.current = true;

  const transcriptHeight = fullscreen ? 'flex-1' : 'h-[360px]';

  const speakActionControls = inputMode === 'speak' ? (
    <div className="flex items-center gap-6 shrink-0">
      {utterances.length > 0 && (
        hasRecordedAudio && !isLive ? (
          <button type="button" onClick={resetTranscript}
            className="relative w-11 h-11 rounded-full border border-navy/20 text-navy/50 hover:border-wine/40 hover:text-wine/70 inline-flex items-center justify-center transition-colors shrink-0"
            aria-label="Reset recording">
            <span className="text-[9px] tracking-widest uppercase leading-none">Reset</span>
          </button>
        ) : (
          <span className="w-11 h-11 shrink-0 inline-block" aria-hidden />
        )
      )}
      <div className="flex flex-row items-center gap-2">
        {isRecording && (
          <span className="font-display text-[14px] text-wine flex items-center gap-1 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-wine animate-pulse" />
            Recording
          </span>
        )}
        <div className="relative flex flex-col items-center">
          {(showStartHint || highlightMic || showRepeatHint) && !isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: [0, -3, 0] }}
              transition={{ delay: 0.6, duration: 0.5, y: { repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 1.1 } }}
              className="absolute bottom-full mb-2 flex flex-col items-center gap-1 pointer-events-none"
            >
              <span className="font-display text-[11px] sm:text-[12px] italic text-wine whitespace-nowrap">
                {showRepeatHint ? 'Repeat to gain experience' : 'Start speaking'}
              </span>
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M5 8L0.669873 0.5L9.33013 0.5L5 8Z" fill="#8B1E2D" opacity="0.6"/>
              </svg>
            </motion.div>
          )}
          <button type="button" onClick={toggleRecording} disabled={status === 'connecting' || manualCorrecting || stoppingRecording}
            className={`relative w-11 h-11 rounded-full bg-wine hover:bg-wine2 disabled:opacity-60 inline-flex items-center justify-center transition-all ${
              (highlightMic || showRepeatHint) && !isRecording ? 'scale-110 shadow-md ring-2 ring-wine/35' : ''
            }`}
            aria-label="Toggle recording">
            {isRecording ? (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="2" y="2" width="10" height="10" rx="1.5" fill="#F6F1E8" />
              </svg>
            ) : (
              <svg width="13" height="16" viewBox="0 0 16 20" fill="none" aria-hidden>
                <rect x="5" y="1" width="6" height="11" rx="3" fill="#F6F1E8" />
                <path d="M2 9.5a6 6 0 0012 0M8 16v3" stroke="#F6F1E8" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
            {(showStartHint || highlightMic || showRepeatHint) && !isRecording && (
              <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40" />
            )}
            {isRecording && <span className="absolute inset-0 rounded-full border border-wine animate-ping opacity-50" />}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
    {fullscreen && <div className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-40" onClick={onClose} />}
    <motion.div
      id="nativa-demo"
      initial={{ opacity: 0, y: fullscreen ? 0 : 30, scale: fullscreen ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={fullscreen
        ? 'fixed inset-6 z-50 bg-paper flex overflow-hidden'
        : 'relative w-full max-w-[640px] bg-paper hairline'}
      style={fullscreen ? { boxShadow: '0 40px 120px -20px rgba(26,35,64,0.4)' } : { boxShadow: '0 30px 80px -30px rgba(26,35,64,0.25), 0 8px 24px -12px rgba(26,35,64,0.08)' }}
    >
      {/* Close button in fullscreen */}
      {fullscreen && (
        <button type="button" onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center text-navy/40 hover:text-navy transition-colors"
          aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      {/* Main content column (2/3) */}
      <div className={fullscreen ? 'flex-[2] flex flex-col overflow-y-auto min-w-0' : 'contents'}>
      {/* Mode controls + speech box */}
      <div className={`px-7 pt-4 flex flex-col gap-2.5${fullscreen ? ' flex-1 min-h-0' : ''}`}>
        <div className="flex items-center justify-center gap-4 shrink-0">
          <div className="relative flex items-center rounded-full p-0.5 bg-wine/10">
            <div
              className="absolute top-0.5 bottom-0.5 rounded-full bg-wine transition-all duration-200"
              style={{ width: 'calc((100% - 4px) / 2)', left: lastSpeakWriteMode === 'write' ? 'calc(2px + (100% - 4px) / 2)' : '2px' }}
            />
            {[
              { id: 'speak', label: 'Speak' },
              { id: 'write', label: 'Write' },
            ].map((m) => (
              <button key={m.id} type="button" onClick={() => (m.id === 'write' ? activateWriteMode() : activateSpeakMode())}
                className={`relative z-10 font-display text-[15px] tracking-wide px-3.5 py-1 rounded-full capitalize transition-colors duration-200 ${lastSpeakWriteMode === m.id ? 'text-ivory' : 'text-navy/45 hover:text-navy/70'}`}>
                {m.label}
              </button>
            ))}
          </div>

          <span className="text-[14px] text-navy/40 font-display italic">or</span>

          <button type="button" onClick={() => {
            setHighlightDiscover(false);
            setInputMode(inputMode === 'discover' ? 'speak' : 'discover');
          }}
            className={`relative inline-flex items-center px-3.5 py-1 font-display text-[16px] tracking-wide rounded-full transition-all duration-300 ${
              inputMode === 'discover'
                ? 'bg-wine text-ivory ring-2 ring-wine/30'
                : highlightDiscover
                  ? 'bg-wine text-ivory ring-[3px] ring-wine/45 shadow-md scale-[1.03]'
                  : 'bg-wine text-ivory hover:bg-wine2'
            }`}>
            Discover a Parisian word
          </button>
        </div>

      {(activeTab === 'practice' || vocabLevel) && (
        <div className="flex border-b border-line shrink-0">
          <button type="button" onClick={() => setActiveTab('transcript')}
            className={`text-[10px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors ${activeTab === 'transcript' ? 'border-navy text-navy' : 'border-transparent text-navy/35 hover:text-navy/60'}`}>
            Chat
          </button>
          <button type="button" onClick={() => setActiveTab('practice')}
            className={`text-[10px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors ${activeTab === 'practice' ? 'border-wine text-wine' : 'border-transparent text-navy/35 hover:text-navy/60'}`}>
            {vocabLevel ? `Vocab & grammar · ${vocabLevel}` : `Practice — ${overallWeakness}`}
          </button>
        </div>
      )}

        <div ref={writeBoxRef} className={`relative bg-ivory/60 border border-line/70 overflow-hidden${fullscreen ? ' flex-1 flex flex-col min-h-0' : ' h-[360px]'}`}>
          {inputMode === 'discover' ? (
            <motion.div
              key="word-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className={`${transcriptHeight} px-5 py-3 flex flex-col gap-2 overflow-hidden`}
            >
              {wordLoading ? (
                <div className="flex-1 flex items-center justify-center"><CorrectionLoading /></div>
              ) : wordData?.word ? (
                <>
                  {/* ── Word info row ── */}
                  <div className="flex items-start justify-between gap-3 flex-shrink-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display text-[22px] font-bold text-wine italic leading-none">{wordData.word}</span>
                        <span className="text-[12px] text-navy/45">{wordData.meaning}</span>
                      </div>
                      <p className="text-[12px] text-navy/60 italic mt-0.5 leading-snug">
                        {wordPlaying && parisianSpeakingText === wordData.example ? (
                          <HighlightedSpeech
                            text={wordData.example}
                            playbackTime={parisianPlaybackTime}
                            timings={parisianTimings}
                            quote
                          />
                        ) : (
                          <>«{wordData.example}»</>
                        )}
                      </p>
                      <p className="text-[10px] text-navy/35 mt-0.5">{wordData.exampleTranslation}</p>
                    </div>

                    {/* Narrator toggle + play button */}
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      {/* Portrait buttons — click to play/stop */}
                      <div className="flex gap-3">
                        {[
                          { id: 'jules', src: '/assets/jules.png', label: 'Jules' },
                          { id: 'lea',   src: '/assets/lea.png',   label: 'Léa'   },
                        ].map((n) => (
                          <div key={n.id} className="flex flex-col items-center gap-1">
                            <button type="button"
                              onClick={() => {
                                if (wordPlayingRef.current && narrator === n.id) {
                                  stopParisianAudio();
                                } else {
                                  stopParisianAudio();
                                  setNarrator(n.id);
                                  playParisianWord(null, n.id);
                                }
                              }}
                              className={`relative w-14 h-14 rounded-full overflow-hidden transition-all duration-200 ${narrator === n.id && wordPlaying ? 'ring-2 ring-wine shadow-md scale-110' : narrator === n.id ? 'ring-2 ring-wine/50 shadow-sm scale-105' : 'ring-1 ring-line/40 opacity-55 hover:opacity-90 hover:scale-105'}`}>
                              <img src={n.src} alt={n.label} className="w-full h-full object-cover object-top" />
                              {wordPlaying && narrator === n.id && (
                                <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40" />
                              )}
                            </button>
                            <span className={`font-display text-[11px] transition-colors ${narrator === n.id && wordPlaying ? 'text-wine italic' : 'text-navy/50'}`}>
                              {n.label}
                            </span>
                          </div>
                        ))}
                      </div>
                      {wordPlayError && (
                        <span className="text-[10px] text-wine/70 italic text-center">{wordPlayError}</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-line/40 flex-shrink-0" />

                  {/* ── Practice label + Speak/Write sub-toggle inline ── */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] tracking-widest uppercase text-navy/40 whitespace-nowrap">Use it in a sentence</span>
                    <div className="relative flex items-center rounded-full p-0.5" style={{ background: 'rgba(26,35,64,0.08)' }}>
                      <div className="absolute top-0.5 bottom-0.5 rounded-full bg-navy/70 transition-all duration-200"
                        style={{ width: 'calc((100% - 4px) / 2)', left: wordPracticeMode === 'speak' ? '2px' : 'calc(2px + (100% - 4px) / 2)' }} />
                      {['speak', 'write'].map((m) => (
                        <button key={m} type="button"
                          onClick={() => {
                            setWordPracticeMode(m);
                            if (m === 'speak') { wordUtteranceBaseRef.current = utterances.length; }
                            setWordUserSentence(''); setWordCorrection(null);
                          }}
                          className={`relative z-10 text-[10px] tracking-wide px-3 py-0.5 rounded-full capitalize transition-colors duration-200 flex-1 text-center ${wordPracticeMode === m ? 'text-ivory' : 'text-navy/45 hover:text-navy/70'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Input area ── */}
                  <div className="flex-1 flex flex-col gap-1.5 min-h-0">
                    {wordPracticeMode === 'write' ? (
                      <textarea
                        className="flex-1 w-full px-3 py-2 bg-paper/40 border border-line/60 resize-none outline-none font-display text-[14px] text-navy placeholder:text-navy/25 focus:border-wine/30 transition-colors min-h-0"
                        placeholder="Écrivez une phrase avec ce mot…"
                        value={wordUserSentence}
                        onChange={(e) => { setWordUserSentence(e.target.value); setWordCorrection(null); }}
                      />
                    ) : (
                      <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-paper/40 border border-line/60 min-h-0">
                        <button type="button"
                          onClick={async () => {
                            if (isRecording) {
                              await stopRecordingWithGrace();
                              const newUtts = utterancesRef.current.slice(wordUtteranceBaseRef.current);
                              if (newUtts.length > 0) setWordUserSentence(newUtts.map(u => u.text).join(' '));
                            } else {
                              wordUtteranceBaseRef.current = utterancesRef.current.length;
                              setWordUserSentence(''); setWordCorrection(null);
                              stopParisianAudio();
                              await start();
                            }
                          }}
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-wine text-ivory' : 'border border-wine/50 text-wine/70 hover:border-wine hover:text-wine'}`}>
                          {isRecording
                            ? <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor"/></svg>
                            : <svg width="9" height="12" viewBox="0 0 16 20" fill="none"><rect x="5" y="1" width="6" height="11" rx="3" fill="currentColor"/><path d="M2 9.5a6 6 0 0012 0M8 16v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                        </button>
                        <span className="font-display text-[13px] text-navy/70 italic flex-1">
                          {isRecording
                            ? (partialTranscript || settledText || <span className="text-navy/30">Parlez maintenant…</span>)
                            : wordUserSentence}
                        </span>
                        {isRecording && <span className="w-2 h-2 rounded-full bg-wine animate-ping flex-shrink-0" />}
                      </div>
                    )}

                    {/* ── Actions + correction ── */}
                    <div className="flex items-center justify-between flex-shrink-0">
                      <button type="button" onClick={discoverWord}
                        className="text-[10px] tracking-widest uppercase text-wine/50 hover:text-wine transition-colors">
                        Other example
                      </button>
                      {!wordCorrecting && wordCorrection && wordCorrection.corrected?.trim() === wordUserSentence.trim() ? (
                        <div className="flex items-center justify-center w-[100px] h-8">
                          <svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M42 12L18 36l-12-12" />
                          </svg>
                        </div>
                      ) : (
                        <button type="button" onClick={correctWordSentence}
                          disabled={!wordUserSentence.trim() || wordCorrecting}
                          className="text-[10px] tracking-widest uppercase px-3 py-1.5 border border-wine text-wine hover:bg-wine/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                          Check my sentence
                        </button>
                      )}
                    </div>

                    {wordCorrecting && (
                      <div className="border-t border-line/40 pt-1.5 flex-shrink-0 space-y-2">
                        <CorrectionLoading />
                      </div>
                    )}

                    {!wordCorrecting && wordCorrection && wordCorrection.corrected?.trim() === wordUserSentence.trim() && (
                      <div className="border-t border-line/40 pt-3 pb-1 flex-shrink-0 flex justify-center">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M42 12L18 36l-12-12" />
                        </svg>
                      </div>
                    )}

                    {!wordCorrecting && wordCorrection && wordCorrection.corrected?.trim() !== wordUserSentence.trim() && (
                      <div className="border-t border-line/40 pt-2 pb-1.5 flex-shrink-0 space-y-2">
                        <div>
                          <span className="text-[9px] tracking-widest uppercase text-navy/35 block mb-1">Correction</span>
                          <p className="font-display text-[13px] leading-relaxed text-navy">{wordCorrection.corrected}</p>
                        </div>
                        <button type="button" onClick={async () => {
                          if (!wordData?.word) return;
                          setWordLoading(true);
                          try {
                            const res = await fetch('/api/word', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ word: wordData.word }),
                            });
                            const newWord = await res.json();
                            setWordData(newWord);
                            setWordUserSentence('');
                            setWordCorrection(null);
                          } catch {}
                          setWordLoading(false);
                        }}
                          className="text-[10px] tracking-widest uppercase px-3 py-1.5 border border-wine text-wine hover:bg-wine/10 transition-colors w-full text-center">
                          Other sentence example
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </motion.div>
          ) : activeTab !== 'practice' && inputMode === 'write' ? (
            <div className={`${transcriptHeight} flex flex-col relative`}>
              {showChatDiff ? (
                <div
                  className="flex-1 px-4 pt-4 pb-4 overflow-y-auto scroll-premium cursor-text"
                  onClick={() => { setWriteEditing(true); setTimeout(() => writeTextareaRef.current?.focus(), 0); }}
                >
                  <CorrectionBlock
                    original={chatDiffCorrection.original}
                    corrected={chatDiffCorrection.corrected}
                    className="font-display text-[17px] leading-snug text-navy select-text"
                  />
                </div>
              ) : !writeEditing && writeCorrection && writeCorrection.corrected?.trim() !== writeText.trim() ? (
                <div
                  className="flex-1 px-4 pt-4 pb-4 overflow-y-auto scroll-premium cursor-text"
                  onClick={() => { setWriteEditing(true); setTimeout(() => writeTextareaRef.current?.focus(), 0); }}
                >
                  <CorrectionBlock
                    original={writeText}
                    corrected={writeCorrection.corrected}
                    className="font-display text-[18px] leading-relaxed text-navy select-text"
                  />
                </div>
              ) : (
                <div className="relative flex-1 flex flex-col min-h-0">
                  {showWriteHint && (
                    <motion.div
                      key={writeHintKey}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: [0, -2, 0] }}
                      transition={{ duration: 0.25, y: { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } }}
                      className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 pointer-events-none"
                    >
                      <span className="font-display text-[12px] italic text-wine whitespace-nowrap">start writing</span>
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden className="rotate-180">
                        <path d="M5 8L0.669873 0.5L9.33013 0.5L5 8Z" fill="#8B1E2D" opacity="0.6"/>
                      </svg>
                    </motion.div>
                  )}
                  {showWriteHint && (
                    <span key={writeHintKey} className="absolute top-3 left-3 right-3 bottom-3 rounded-lg border-2 border-wine/30 animate-pulse pointer-events-none" aria-hidden />
                  )}
                  <textarea
                    ref={writeTextareaRef}
                    className="flex-1 w-full px-4 pt-4 pb-4 bg-transparent resize-none outline-none font-display text-[17px] leading-snug text-navy placeholder:text-navy/30 scroll-premium relative z-[1]"
                    placeholder="Write in French…"
                    spellCheck={false}
                    value={writeText}
                    onChange={(e) => {
                      setWriteText(e.target.value);
                      setWriteEditing(true);
                      setWriteCorrection(null);
                      setNarratorReaction(null);
                      setManualCorrection(null);
                      setPreviewCorrection(null);
                    }}
                    onFocus={() => setShowWriteHint(false)}
                    onBlur={() => {
                      if (writeText.trim() && !manualCorrection && !narratorReaction) {
                        setNarratorReaction(pickNarratorReaction(effectiveLevel));
                        fetchPreviewCorrection(writeText);
                        setWriteEditing(false);
                      } else if (writeCorrection && writeCorrection.corrected?.trim() !== writeText.trim()) {
                        setWriteEditing(false);
                      }
                    }}
                  />
                </div>
              )}
              {writeCorrecting && (
                <div className="absolute bottom-2 right-3 pointer-events-none">
                  <CorrectionLoading />
                </div>
              )}
            </div>
          ) : activeTab !== 'practice' ? (
          <div className={`${transcriptHeight} flex flex-col min-h-0 overflow-hidden`}>
          <div ref={scrollRef} className="scroll-premium flex-1 min-h-0 max-h-full px-3.5 pt-3 pb-6 overflow-y-auto overscroll-contain">
            {hasContent ? (
              <>
                <div className="font-display text-[17px] leading-snug text-navy flex flex-col gap-2 min-w-0" spellCheck={false}>
                  {mainUtterances.map((utt) => {
                    const isPlayingThis = playingUtteranceId === utt.id && isPlaying;
                    const uttWords = utt.words?.length > 0
                      ? utt.words
                      : (playbackWords?.utteranceId === utt.id ? playbackWords.words : []);

                    const isWordActive = (i) => {
                      if (playingUtteranceId !== utt.id || playbackTime === null || uttWords.length === 0) return false;
                      const w = uttWords[i];
                      if (!w) return false;
                      const nextStart = uttWords[i + 1]?.start;
                      return playbackTime >= w.start
                        && playbackTime < (nextStart ?? (w.end != null ? w.end + 0.1 : utt.endTime + 0.5));
                    };

                    const uttActive = uttWords.length === 0
                      && playingUtteranceId === utt.id
                      && utt.endTime > utt.startTime
                      && playbackTime !== null
                      && playbackTime >= utt.startTime
                      && playbackTime <= utt.endTime + 0.5;

                    const seekTo = (time) => {
                      if (!utt.audioUrl) return;
                      if (playingUtteranceId !== utt.id || !audioRef.current) {
                        toggleUtterancePlayback(utt);
                        window.setTimeout(() => {
                          if (audioRef.current && playingUtteranceId === utt.id) {
                            audioRef.current.currentTime = time;
                            setPlaybackTime(time);
                          }
                        }, 0);
                        return;
                      }
                      audioRef.current.currentTime = time;
                      setPlaybackTime(time);
                      if (!isPlaying) {
                        const session = beginSiteAudioPlayback();
                        recordingSessionRef.current = session;
                        if (!isSiteAudioPlaybackCurrent(session)) return;
                        audioRef.current.play().catch(() => {});
                        if (!isSiteAudioPlaybackCurrent(session)) {
                          audioRef.current.pause();
                          return;
                        }
                        startRaf();
                        setIsPlaying(true);
                      }
                    };

                    const wordSpans = uttWords.length > 0
                      ? uttWords.map((w, i) => (
                          <span
                            key={i}
                            onClick={() => w.start != null && seekTo(w.start)}
                            style={{
                              cursor: w.start != null ? 'pointer' : undefined,
                              transition: 'background 0.18s ease',
                              borderRadius: '4px',
                              padding: '1px 3px',
                              marginRight: '1px',
                              display: 'inline-block',
                              background: isWordActive(i) ? 'rgba(139,30,45,0.12)' : 'transparent',
                            }}
                          >
                            {w.punctuated_word ?? w.word}
                          </span>
                        ))
                      : <span style={uttActive ? { background: 'rgba(139,30,45,0.12)', borderRadius: '4px', padding: '1px 3px' } : undefined}>{utt.text}</span>;

                    const utteranceSlotMode = utt.audioUrl
                      ? 'play'
                      : stoppingRecording ? 'loading' : 'empty';

                    return (
                      <TranscriptSentenceRow
                        key={utt.id}
                        gutter={(
                          <TranscriptAudioSlot
                            mode={utteranceSlotMode}
                            isPlaying={isPlayingThis}
                            onPlay={() => toggleUtterancePlayback(utt)}
                          />
                        )}
                      >
                        {wordSpans}
                        {utt.id === correctionUtteranceId && sentenceCongrats && (
                          <span className="inline-flex items-center gap-1 ml-1.5 align-middle whitespace-nowrap">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 48 48"
                              fill="none"
                              stroke="#16a34a"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="shrink-0"
                              aria-hidden
                            >
                              <path d="M42 12L18 36l-12-12" />
                            </svg>
                            <span className="parisian-exp-bump inline-flex items-center justify-center rounded-full border border-navy/15 bg-navy/[0.04] px-1.5 py-0.5 font-mono text-[9px] leading-none text-navy/45 tabular-nums">
                              +1% Parisian
                            </span>
                          </span>
                        )}
                      </TranscriptSentenceRow>
                    );
                  })}

                  {showLiveTranscriptLine && (
                    <TranscriptSentenceRow
                      gutter={<TranscriptAudioSlot mode="loading" />}
                    >
                      {settledText && (
                        <span className="text-navy font-semibold">
                          {settledText}
                          {partialTranscript && segmentNeedsLeadingSpace(partialTranscript) ? ' ' : null}
                        </span>
                      )}
                      {partialTranscript && <span className="text-navy/40 italic">{partialTranscript}</span>}
                    </TranscriptSentenceRow>
                  )}
                </div>
                {showRepeatLine && (
                  <div className="mt-2 flex items-start gap-2.5">
                    {repeatFeedback === 'success' && !isRecording && (
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 48 48"
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 mt-1"
                        aria-hidden
                      >
                        <path d="M42 12L18 36l-12-12" />
                      </svg>
                    )}
                    {isRecording ? (
                      <LiveSpeechLine
                        utterances={repeatUtterances}
                        settledText={settledText}
                        partialTranscript={partialTranscript}
                        className="min-w-0 flex-1"
                      />
                    ) : (
                      <p className={`font-display text-[17px] leading-snug min-w-0 ${
                        repeatFeedback === 'success' ? 'text-green-700' : 'text-navy/70'
                      }`}>
                        {repeatAttemptText}
                      </p>
                    )}
                  </div>
                )}
                {repeatFeedback === 'success' && !isRecording && (
                  <p className="mt-2 font-display text-[13px] italic text-green-700">+1% Parisian experience</p>
                )}
                {repeatFeedback === 'fail' && !isRecording && (
                  <p className="mt-2 font-display text-[13px] italic text-wine/70">Not quite — try again.</p>
                )}
              </>
            ) : (!isLive || !hadContentRef.current) && (
              isRecording ? (
                <p className="font-display text-[17px] leading-snug text-navy/30">
                  Start speaking…
                </p>
              ) : status !== 'connecting' ? (
                <p className="font-display text-[17px] leading-snug text-navy/30">
                  Press the mic to speak
                </p>
              ) : null
            )}

          </div>
          </div>
          ) : null}

          {/* Practice tab */}
          {activeTab === 'practice' && (
            <div className="px-4 pt-3 pb-4 border-t border-line/50 space-y-4">
              {/* Subtabs */}
              <div className="flex gap-0 border-b border-line/40 -mx-4 px-4 mb-2">
                <button
                  type="button"
                  onClick={() => setPracticeSubTab('comprehension')}
                  className={`text-[10px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors ${practiceSubTab === 'comprehension' ? 'border-wine text-wine' : 'border-transparent text-navy/35 hover:text-navy/60'}`}
                >
                  Comprehension
                </button>
                <button
                  type="button"
                  onClick={() => { setPracticeSubTab('vocabulary'); if (!wordData && !wordLoading) discoverWord(); }}
                  className={`text-[10px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors ${practiceSubTab === 'vocabulary' ? 'border-wine text-wine' : 'border-transparent text-navy/35 hover:text-navy/60'}`}
                >
                  Vocabulary
                </button>
              </div>
              {/* Comprehension subtab */}
              {practiceSubTab === 'comprehension' && (
                <>
                  {practiceTopics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-2 border-b border-line/40">
                      {practiceTopics.map((topic) => {
                        const pct = Math.min(skillProgress[topic] ?? 0, 100);
                        return (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => startPractice(topic)}
                            className="relative overflow-hidden border border-line/60 hover:border-wine/40 transition-colors group"
                            style={{ height: 24 }}
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-wine/10 group-hover:bg-wine/15 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex items-center gap-2 px-2 h-full">
                              <span className="text-[11px] text-navy/60 group-hover:text-navy transition-colors whitespace-nowrap">{topic}</span>
                              <span className="text-[9px] font-mono text-navy/30 tabular-nums">{pct}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {loadingPractice ? <CorrectionLoading /> : practiceExercises && practiceExercises.length > 0
                    ? (() => {
                        const anyAt100 = Object.values(skillProgress).some((p) => p >= 100);
                        return (
                          <>
                            {practiceExercises.map((ex, i) => {
                              const key = ex.objective || overallWeakness || 'general';
                              return (
                                <PracticeExercise
                                  key={ex._id ?? i}
                                  exercise={ex}
                                  onCorrect={() => handleExerciseCorrect(i, key)}
                                />
                              );
                            })}
                            {!anyAt100 && (
                              <div className="pt-2">
                                {loadingMore ? <CorrectionLoading /> : (
                                  <button type="button" onClick={practiceMore}
                                    className="w-full flex flex-col items-center gap-0.5 text-wine/60 hover:text-wine transition-colors">
                                    <span className="text-[10px] tracking-widest uppercase">more</span>
                                    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
                                      <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                            {anyAt100 && (
                              <p className="text-[11px] tracking-widest uppercase text-green-600 pt-1">100% — skill mastered!</p>
                            )}
                          </>
                        );
                      })()
                    : practiceExercises !== null
                      ? <p className="text-[13px] text-navy/40">No exercises generated.</p>
                      : null}
                </>
              )}

              {/* Vocabulary subtab */}
              {practiceSubTab === 'vocabulary' && (
                <div className="text-[13px] text-navy/40 italic">
                  Vocabulary exercise coming soon…
                </div>
              )}
            </div>
          )}

          {/* Word discovery panel — inside the speech box */}

        </div>
      </div>

      {/* Léa / Jules reaction — after stop or finishing write */}
      {narratorReaction && !manualCorrection && !manualCorrecting && (
        <NarratorReactionPanel
          reaction={narratorReaction}
          onDone={() => setNarratorReaction(null)}
        />
      )}

      {/* Level assessment panel — also outside speech box */}
      {(assessingLevel || overallLevel) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mx-7 border border-line/50 border-t-0 bg-ivory/40 px-6 py-5"
        >
          {assessingLevel ? (
            <div className="flex items-center justify-center"><CorrectionLoading /></div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {/* YOUR LEVEL */}
              <div className="flex flex-col gap-3">
                <span className="text-[9px] tracking-widest uppercase text-navy/35">Your Level</span>
                <div>
                  <span className="text-[32px] font-mono leading-none text-wine font-bold">{overallLevel}</span>
                  <p className="text-[13px] text-navy/70 mt-1">
                    {LEVELS.find(l => l.id === overallLevel)?.title}
                  </p>
                  <p className="text-[12px] leading-snug text-navy/60 mt-2">
                    {LEVELS.find(l => l.id === overallLevel)?.desc}
                  </p>
                </div>
              </div>

              {/* STRENGTHS */}
              <div className="flex flex-col gap-3">
                <span className="text-[9px] tracking-widest uppercase text-navy/35">Strengths</span>
                <div className="space-y-2">
                  {overallStrength ? (
                    <div className="flex gap-2">
                      <span className="text-green-600 flex-shrink-0">✓</span>
                      <span className="text-[13px] text-navy/70">{overallStrength}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* NEXT STEP */}
              <div className="flex flex-col gap-3">
                <span className="text-[9px] tracking-widest uppercase text-navy/35">Next Step</span>
                {overallWeakness ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <span className="text-wine flex-shrink-0 text-[16px]">◉</span>
                      <div>
                        <p className="text-[11px] font-medium text-wine">Reach {nextLevel(overallLevel)}</p>
                        <p className="text-[12px] text-navy/70 mt-1">{overallWeakness}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => startPractice(overallWeakness)}
                      className="text-[10px] tracking-widest uppercase px-3 py-1.5 border border-wine text-wine hover:bg-wine/10 transition-colors w-full text-center">
                      Practice this →
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Bottom bar */}
      <div className="px-7 pt-2 pb-3 flex items-center justify-between gap-4 min-h-0 overflow-visible">
        {/* Left: Parisien correction UI or "Make it Parisien !" */}
        <div className="min-w-0 flex-1 overflow-visible">
          {inputMode === 'speak' && (() => {
            const hasRecorded = utterances.length > 0;
            const hasCorrected = !!manualCorrection || !!sentenceCongrats;
            const isDark = hasRecorded && !hasCorrected && !isLive && !narratorReaction;
            const isBarLineSpeaking = (lineText) => (
              wordPlaying
              && lineText
              && parisianSpeakingText === lineText.trim()
            );
            const isCorrectionSpeaking = isBarLineSpeaking(manualCorrection?.corrected);
            const isCongratsSpeaking = isBarLineSpeaking(sentenceCongrats?.text);

            if (manualCorrecting) {
              return (
                <div className="flex items-start gap-2 min-w-0 w-full">
                  <div className="flex flex-col items-stretch gap-1 w-[3.5rem] shrink-0">
                    <div className="h-7 rounded-full bg-wine/10 animate-pulse" aria-hidden />
                    <div className="h-7 rounded-full bg-navy/5 animate-pulse" aria-hidden />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <NarratorAnswerLoading narratorId={pendingNarratorId} hideName />
                  </div>
                </div>
              );
            }

            if (hasSpeakCorrection) {
              const repeatSucceeded = repeatFeedback === 'success';
              return (
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <div className="flex flex-col items-stretch gap-1 w-[3.5rem] shrink-0">
                    <button
                      type="button"
                      disabled={savingExpression}
                      onClick={async () => {
                        const saved = await saveCurrentExpression();
                        if (!saved) return;
                        if (!repeatSucceeded) {
                          await playNarratorLine({ id: correctionReaderId, text: 'Now try to repeat it.' });
                        }
                        setManualCorrection(null);
                        setCorrectionReaderId(null);
                        setSentenceCongrats(null);
                        setRepeatFeedback(null);
                      }}
                      className="font-display text-[11px] leading-none w-full h-7 rounded-full border border-wine bg-wine text-ivory hover:bg-wine2 transition-colors text-center box-border disabled:opacity-60"
                    >
                      {savingExpression ? '…' : 'Save'}
                    </button>
                    {!repeatSucceeded && (
                      <button
                        type="button"
                        onClick={() => {
                          setManualCorrection(null);
                          setCorrectionReaderId(null);
                        }}
                        className="font-display text-[11px] leading-none w-full h-7 rounded-full border border-navy/20 text-navy/50 hover:border-navy/40 hover:text-navy/70 transition-colors text-center box-border"
                      >
                        Skip
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <NarratorPortrait
                      narratorId={correctionReaderId}
                      speaking={isCorrectionSpeaking || isCongratsSpeaking}
                      onReplay={repeatSucceeded
                        ? () => {
                          if (!sentenceCongrats?.text || !correctionReaderId) return;
                          playNarratorLine({ id: correctionReaderId, text: sentenceCongrats.text });
                        }
                        : replayCorrectionAudio}
                      hideName
                      size="lg"
                    />
                    <NarratorHoverText
                      text={manualCorrection.corrected}
                      translation={manualCorrection.translation}
                      highlightSpeech={isCorrectionSpeaking}
                      speechPlaybackTime={isCorrectionSpeaking ? parisianPlaybackTime : null}
                      speechTimings={isCorrectionSpeaking ? parisianTimings : []}
                      className="font-display text-[16px] italic text-navy leading-snug"
                      wrapperClassName="relative flex-1 min-w-0"
                      scrollable
                      tooltipPosition="above"
                    >
                      {!isCorrectionSpeaking ? (
                        <DiffText
                          original={manualCorrection.original}
                          corrected={manualCorrection.corrected}
                          side="corrected"
                          className="font-display text-[16px] italic text-navy leading-snug"
                        />
                      ) : null}
                    </NarratorHoverText>
                  </div>
                </div>
              );
            }

            if (sentenceCongrats) {
              return (
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <NarratorPortrait
                    narratorId={correctionReaderId}
                    speaking={isCongratsSpeaking}
                    onReplay={() => {
                      if (!sentenceCongrats?.text || !correctionReaderId) return;
                      playNarratorLine({ id: correctionReaderId, text: sentenceCongrats.text });
                    }}
                    hideName
                    size="lg"
                  />
                  <NarratorHoverText
                    text={sentenceCongrats.text}
                    translation={sentenceCongrats.translation}
                    highlightSpeech={isCongratsSpeaking}
                    speechPlaybackTime={isCongratsSpeaking ? parisianPlaybackTime : null}
                    speechTimings={isCongratsSpeaking ? parisianTimings : []}
                    className="font-display text-[16px] italic text-navy leading-snug"
                    wrapperClassName="relative flex-1 min-w-0"
                    scrollable
                    tooltipPosition="above"
                  />
                </div>
              );
            }

            return (
              <button
                type="button"
                onClick={() => { setShowCorrectHint(false); correctNow(); }}
                disabled={manualCorrecting || !hasRecorded || isLive || !!narratorReaction}
                className={`relative font-display text-[16px] italic px-4 h-10 rounded-full transition-all duration-200 whitespace-nowrap ${
                  isDark
                    ? 'bg-wine text-ivory hover:bg-wine2 cursor-pointer shadow-md'
                    : 'bg-wine/10 text-wine/50 border border-wine/20 cursor-default'
                } disabled:opacity-60`}
              >
                Make it Parisien !
                {showCorrectHint && isDark && !manualCorrecting && (
                  <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40 pointer-events-none" />
                )}
              </button>
            );
          })()}
        </div>

        {/* Right: Reset + Mic (always same slot in speak mode) */}
        {inputMode === 'write' ? (
        <div className="flex items-center gap-2 min-w-0 h-10 self-end shrink-0">
          <div className="flex items-center gap-3 h-10">
            <div className="flex items-center gap-3">
                {writeText.trim().length > 0 && (
                  <button type="button" onClick={resetTranscript}
                    className="text-[12px] tracking-widest uppercase text-navy/30 hover:text-navy/60 transition-colors self-center">
                    Reset
                  </button>
                )}
                <button type="button" onClick={finishWriteInput}
                  disabled={!writeText.trim() || writeText.trim() === writeSubmittedText}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-wine hover:bg-wine2 disabled:bg-wine/10 disabled:text-wine/35 disabled:cursor-default transition-colors font-display text-[16px] italic text-ivory"
                  aria-label="Fini">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Fini
                </button>
              </div>
          </div>
        </div>
        ) : inputMode === 'speak' ? (
        <div className="shrink-0 self-start">
          {speakActionControls}
        </div>
        ) : null}
      </div>

      {error && <p className="px-7 pb-4 text-[12px] text-wine">{error}</p>}
      </div>{/* end main content column */}

      {/* Level sidebar (1/3) — fullscreen only */}
      {fullscreen && (
        <div className="flex-[1] overflow-y-auto min-w-0">
          <LevelSidebar currentLevel={overallLevel} />
        </div>
      )}

    </motion.div>
    </>
  );
}

const SENTENCES_PER_PAGE = 5;

function splitIntoSentences(text) {
  // Split on sentence-ending punctuation followed by a space or end
  return text.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function ReadingArticlePanel({ loading, title, passage, source, author, date }) {
  const sentences = React.useMemo(() => splitIntoSentences(passage || ''), [passage]);
  const pages = React.useMemo(() => {
    const result = [];
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_PAGE) {
      result.push(sentences.slice(i, i + SENTENCES_PER_PAGE).join(' '));
    }
    return result.length > 0 ? result : [''];
  }, [sentences]);

  const [page, setPage] = React.useState(0);
  const [direction, setDirection] = React.useState(1); // 1 = forward, -1 = back

  React.useEffect(() => { setPage(0); }, [passage]);

  const goNext = () => { setDirection(1); setPage((p) => Math.min(p + 1, pages.length - 1)); };
  const goPrev = () => { setDirection(-1); setPage((p) => Math.max(p - 1, 0)); };

  const byline = [author, date, source].filter(Boolean).join(' — ');
  const isLast = page === pages.length - 1;
  const isFirst = page === 0;

  return (
    <div className="flex flex-col pr-4" style={{ height: 520 }}>
      {loading ? (
        <div className="flex items-center gap-3 mt-auto mb-auto">
          <div className="w-4 h-4 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
          <span className="text-[14px] text-navy/40 font-display italic">Searching for an article…</span>
        </div>
      ) : (
        <>
          {/* Title — fixed at top, never moves */}
          {title && (
            <div className="mb-5 shrink-0 px-4 py-3 border-l-4 border-navy bg-navy/5" style={{ borderRadius: '0 4px 4px 0' }}>
              <h2 className="font-display text-[26px] sm:text-[30px] leading-[1.2] tracking-[-0.01em] line-clamp-2 text-navy">
                {title}
              </h2>
            </div>
          )}

          {/* Article text — fixed height zone, slides between pages */}
          <div className="relative overflow-hidden flex-1">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.p
                key={page}
                custom={direction}
                initial={(d) => ({ x: d * 40, opacity: 0 })}
                animate={{ x: 0, opacity: 1 }}
                exit={(d) => ({ x: d * -40, opacity: 0 })}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="font-display text-[15px] sm:text-[16px] leading-[1.75] text-navy/80"
              >
                {pages[page]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Byline + pagination — fixed at bottom */}
          <div className="flex items-end justify-between mt-4 shrink-0">
            {byline ? (
              <p className="text-[10px] font-mono tracking-[0.12em] border-t pt-3 flex-1 mr-4" style={{ color: '#8b1e2d', borderColor: 'rgba(139,30,45,0.2)' }}>
                {byline}
              </p>
            ) : <span className="flex-1" />}

            {pages.length > 1 && (
              <div className="flex items-center gap-2 shrink-0 pb-1">
                <button type="button" onClick={goPrev} disabled={isFirst}
                  className="w-7 h-7 flex items-center justify-center rounded-full border disabled:opacity-20 transition-colors"
                  style={{ borderColor: 'rgba(139,30,45,0.35)', color: '#8b1e2d' }}
                  aria-label="Previous page">
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M6 1L2 6l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <span className="text-[10px] font-mono" style={{ color: '#8b1e2d' }}>{page + 1}/{pages.length}</span>
                <button type="button" onClick={goNext} disabled={isLast}
                  className="w-7 h-7 flex items-center justify-center rounded-full border disabled:opacity-20 transition-colors"
                  style={{ borderColor: 'rgba(139,30,45,0.35)', color: '#8b1e2d' }}
                  aria-label="Next page">
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M2 1l4 5-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Hero() {
  const { effectiveLevel } = useLearnerProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const learnMode = searchParams.get('learn');
  const learnLevel = searchParams.get('level');
  const practiceTopic = searchParams.get('practice');
  const practiceType = searchParams.get('ptype');

  const [readingActive, setReadingActive] = React.useState(false);
  const [readingTopic, setReadingTopic] = React.useState('');
  const [readingPassage, setReadingPassage] = React.useState('');
  const [readingTitle, setReadingTitle] = React.useState('');
  const [readingSource, setReadingSource] = React.useState(null);
  const [readingAuthor, setReadingAuthor] = React.useState(null);
  const [readingDate, setReadingDate] = React.useState(null);
  const [readingLoading, setReadingLoading] = React.useState(false);

  // Detect reading mode from URL once — store in state so it survives clearPracticeParam
  React.useEffect(() => {
    if (practiceType === 'reading' && practiceTopic && !readingActive) {
      setReadingActive(true);
      setReadingTopic(practiceTopic);
      setReadingLoading(true);
      setReadingPassage('');
      setReadingSource(null);
      fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: practiceTopic }),
      })
        .then((r) => r.json())
        .then((data) => {
          setReadingPassage(data.passage || '');
          setReadingTitle(data.title || '');
          setReadingSource(data.source || null);
          setReadingAuthor(data.author || null);
          setReadingDate(data.date || null);
          setReadingLoading(false);
        })
        .catch(() => setReadingLoading(false));
    }
  }, [practiceTopic, practiceType]);
  const [introNarrator, setIntroNarrator] = React.useState(null);
  const [introPlaying, setIntroPlaying] = React.useState(null); // null | 'lea' | 'jules'
  const [introPlaybackTime, setIntroPlaybackTime] = React.useState(null);
  const [introTimings, setIntroTimings] = React.useState([]);
  const [introSpeechText, setIntroSpeechText] = React.useState(null);
  const introCtxRef = React.useRef(null);
  const introSourceRef = React.useRef(null);
  const introSessionRef = React.useRef(0);

  const goToDashboard = (topic) => {
    const url = topic ? `/dashboard?topic=${encodeURIComponent(topic)}` : '/dashboard';
    window.open(url, '_blank');
  };

  const stopIntroAudio = React.useCallback(() => {
    try { introSourceRef.current?.stop(); } catch {}
    introSourceRef.current = null;
    setIntroPlaying(null);
    setIntroPlaybackTime(null);
    setIntroTimings([]);
    setIntroSpeechText(null);
  }, []);

  React.useEffect(() => registerSiteAudioStop(stopIntroAudio), [stopIntroAudio]);

  const playNarratorIntro = async (narrator) => {
    if (introPlaying === narrator.id) {
      introSessionRef.current += 1;
      stopIntroAudio();
      return;
    }

    const siteSession = beginSiteAudioPlayback();
    introSessionRef.current += 1;
    const session = introSessionRef.current;
    setIntroPlaying(narrator.id);
    setIntroSpeechText(narrator.intro);

    try {
      const buf = await fetchNarratorAudio(narrator.intro, narrator.id);
      if (session !== introSessionRef.current || !isSiteAudioPlaybackCurrent(siteSession)) return;

      if (!introCtxRef.current) introCtxRef.current = new AudioContext();
      const ctx = introCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (session !== introSessionRef.current || !isSiteAudioPlaybackCurrent(siteSession)) return;

      setIntroTimings(buildWordTimings(narrator.intro, decoded.duration));
      setIntroPlaybackTime(0);

      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: narrator.id,
        sourceRef: introSourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (session !== introSessionRef.current) return;
          setIntroPlaybackTime(t);
          if (t == null) stopIntroAudio();
        },
      });
    } catch (err) {
      console.error('Failed to play narrator intro:', err);
      if (session === introSessionRef.current) stopIntroAudio();
    }
  };

  const narrators = React.useMemo(() => (
    ['lea', 'jules'].map((id) => {
      const intro = getNarratorIntro(id, effectiveLevel);
      return {
        id,
        name: id === 'lea' ? 'Léa' : 'Jules',
        src: id === 'lea' ? '/assets/lea.png' : '/assets/jules.png',
        intro: intro.text,
        introTranslation: intro.translation,
      };
    })
  ), [effectiveLevel]);

  React.useEffect(() => {
    return () => {
      introSessionRef.current += 1;
      try { introSourceRef.current?.stop(); } catch {}
      introSourceRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!learnMode) return;
    window.setTimeout(() => {
      document.getElementById('nativa-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }, [learnMode]);

  React.useEffect(() => {
    if (!practiceTopic) return;
    window.setTimeout(() => {
      document.getElementById('nativa-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }, [practiceTopic]);

  const clearLearnParams = React.useCallback(() => {
    if (searchParams.get('learn')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const clearPracticeParam = React.useCallback(() => {
    if (!searchParams.get('practice')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('practice');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <section className="relative pt-12 pb-12 min-h-screen overflow-visible flex items-center">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 80% 30%, rgba(217,196,162,0.30), transparent 60%), linear-gradient(180deg, #F6F1E8 0%, #F2EBDA 100%)' }} />
        <img src="/assets/paris-skyline.png" alt=""
          className="absolute right-0 bottom-0 w-[1280px] max-w-[70%] object-contain object-bottom-right select-none"
          style={{ opacity: 0.85, mixBlendMode: 'multiply' }} />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 52% 42% at 100% 0%, rgba(242,235,218,0.72) 0%, rgba(242,235,218,0.28) 42%, transparent 62%),
              linear-gradient(90deg, #F2EBDA 0%, #F2EBDA 15%, rgba(242,235,218,0.96) 28%, rgba(242,235,218,0.82) 40%, rgba(242,235,218,0.55) 55%, rgba(242,235,218,0.2) 70%, rgba(242,235,218,0.0) 82%)
            `,
          }}
        />
      </div>

      <Container className="relative">
        <div className="grid lg:grid-cols-[1fr_1.5fr] gap-8 items-center h-[calc(100vh-96px)]">
          <div className="relative flex flex-col justify-center overflow-visible">
            {readingActive ? (
              <ReadingArticlePanel
                loading={readingLoading}
                title={readingTitle}
                passage={readingPassage}
                source={readingSource}
                author={readingAuthor}
                date={readingDate}
              />
            ) : (
            <div className="flex flex-col items-center text-center overflow-visible">
            <h1 className="font-display text-[48px] leading-[0.95] tracking-[-0.015em] text-navy flex flex-col gap-2">
              <Reveal delay={0.08}>Learn French</Reveal>
              <Reveal delay={0.18} className="text-wine italic">From Parisiens.</Reveal>
            </h1>

            {/* Jules et Léa — clickable introductions */}
            <Reveal delay={0.25} className="overflow-visible">
              <div className="mt-6 flex items-center justify-center gap-8 sm:gap-10 relative z-20 overflow-visible">
                {narrators.map((n) => {
                  const isPlaying = introPlaying === n.id;
                  return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => playNarratorIntro(n)}
                    className="group relative flex flex-col items-center gap-2"
                    aria-label={`Listen to ${n.name}'s introduction`}
                    aria-pressed={isPlaying}
                  >
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 overflow-visible">
                      <AnimatePresence>
                        {isPlaying && (
                          <motion.div
                            key={`intro-bubble-${n.id}`}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.2 }}
                            className={`absolute z-[100] ${
                              n.id === 'lea'
                                ? 'right-full mr-3 sm:mr-4 -top-3 sm:-top-4 w-[min(200px,calc(100vw-2.5rem))] sm:w-[216px]'
                                : 'left-full ml-3 sm:ml-4 -top-3 sm:-top-4 w-[min(220px,calc(100vw-2.5rem))] sm:w-[240px]'
                            }`}
                          >
                            <div className={`relative rounded-2xl bg-white/95 backdrop-blur-sm border border-wine/15 shadow-[0_16px_48px_-12px_rgba(26,35,64,0.22)] text-left ${
                              n.id === 'lea' ? 'px-3.5 py-3' : 'px-4 py-3.5'
                            }`}>
                              <p className={`tracking-[0.16em] uppercase text-wine/75 font-semibold mb-2 ${
                                n.id === 'lea' ? 'text-[11px]' : 'text-[12px]'
                              }`}>
                                {n.name}
                              </p>
                              <NarratorHoverText
                                text={n.intro}
                                translation={n.introTranslation}
                                quote
                                highlightSpeech={isPlaying && introSpeechText === n.intro}
                                speechPlaybackTime={introPlaybackTime}
                                speechTimings={introTimings}
                                className={`font-display text-navy italic leading-snug ${
                                  n.id === 'lea' ? 'text-[14px] sm:text-[15px]' : 'text-[15px] sm:text-[16px]'
                                }`}
                                wrapperClassName="relative w-full"
                                tooltipClassName="top-[calc(100%+6px)]"
                              />
                              <span
                                className={`absolute top-[42%] -translate-y-1/2 w-2.5 h-2.5 bg-white/95 rotate-45 border-wine/15 ${
                                  n.id === 'lea'
                                    ? '-right-1 border-r border-t'
                                    : '-left-1 border-l border-b'
                                }`}
                                aria-hidden
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className={`relative w-full h-full rounded-full overflow-hidden transition-shadow duration-300 ${
                        isPlaying
                          ? 'ring-[3px] ring-wine shadow-lg'
                          : 'ring-2 ring-wine/40 group-hover:ring-wine shadow-sm group-hover:shadow-md'
                      }`}>
                        <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
                        {isPlaying && (
                          <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-35 pointer-events-none" />
                        )}
                        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${
                          isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          {isPlaying ? (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="white" aria-hidden>
                              <rect x="2" y="2" width="10" height="10" rx="1.5" fill="white" />
                            </svg>
                          ) : (
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden>
                              <path d="M8 5v14l11-7z" fill="white" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`font-display text-[14px] font-medium transition-colors ${
                      isPlaying ? 'text-wine italic' : 'text-wine'
                    }`}>{n.name}</span>
                  </button>
                  );
                })}
              </div>
            </Reveal>

            <Reveal delay={0.35}>
              <p className="mt-6 max-w-[500px] text-[15px] leading-[1.6] text-navy/70">
                Nativa listens as you speak and correct your French in real time,
                helping you express yourself with fluency and confidence.
              </p>
            </Reveal>
            <Reveal delay={0.42}>
              <div className="mt-8 flex items-center">
                <div className="relative inline-flex">
                  <ParisianExperienceHint />
                  <div className="relative">
                    <ButtonPrimary
                      onClick={() => goToDashboard()}
                      showArrow={false}
                      className="relative z-[1] rounded-full"
                    >
                      Judge my French
                    </ButtonPrimary>
                    <span
                      className="absolute inset-0 rounded-full border-2 border-wine animate-ping-tight opacity-35 pointer-events-none"
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            </Reveal>
            </div>
            )}
          </div>

          <div className="flex items-center justify-end h-full">
            <AudioDemoCard
              onOpenFullscreen={(topic) => goToDashboard(topic)}
              initialTopic={practiceTopic}
              initialLearnMode={learnMode}
              initialLearnLevel={learnLevel}
              onLearnModeHandled={clearLearnParams}
              onPracticeTopicHandled={clearPracticeParam}
            />
          </div>
        </div>
      </Container>

      {/* Introduction Modal */}
      {introNarrator && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIntroNarrator(null)}
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-wine shadow-lg">
                <img src={introNarrator.src} alt={introNarrator.name} className="w-full h-full object-cover object-top" />
              </div>
              <div className="text-center">
                <h2 className="font-display text-[28px] text-navy mb-1">{introNarrator.name}</h2>
                <p className="text-[15px] leading-[1.6] text-navy/70 mt-4">
                  {introNarrator.intro}
                </p>
              </div>
              <button
                onClick={() => setIntroNarrator(null)}
                className="mt-6 px-6 py-2 bg-wine text-ivory rounded-full font-display text-[13px] hover:bg-wine2 transition-colors"
              >
                Let's learn together!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
