import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useSpeechmaticsTranscription } from '../hooks/useSpeechmaticsTranscription';
import {
  ButtonPrimary,
  Container,
  NAV_CTA_CLASS,
  ParisianExperienceHint,
  Reveal,
  Star,
} from './atoms';
import { fetchNarratorAudio, connectNarratorSource, resolveClientNarrator } from '../lib/narratorAudio';
import { buildWordTimings, playDecodedBuffer, isTimedWordActive, wordHighlightInlineStyle } from '../lib/speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';
import { HighlightedSpeech } from '../lib/HighlightedSpeech';
import { NarratorHoverText } from '../lib/NarratorHoverText';
import { lookupNarratorTranslation } from '../lib/narratorTranslations';
import { SpellcheckUnderline } from '../lib/SpellcheckUnderline';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { matchesCorrectionTarget, isStrictCorrectionMatch, wordDiff, buildCorrectionNarrationText } from '../lib/correctionFormat';
import { DiffText } from '../lib/DiffText';
import { registerCorrectionKeyterms } from '../lib/deepgramKeyterms';
import { captureTabAudioStream, releaseTabCapture } from '../lib/captureTabAudio';
import { saveCorrection } from '../lib/correctionsNotebook';
import { bumpTargetProgressByTopic } from '../lib/targetProgress';
import { getEffectiveLevel, getLevelBadgeSrc } from '../lib/learnerProfile';
import { joinTranscriptSegments, segmentNeedsLeadingSpace } from '../lib/transcriptJoin';
import {
  getAlreadyCorrectLine,
  getNarratorIntro,
  getRepeatFailLine,
  getRepeatSuccessLine,
  pickNarratorReaction,
} from '../lib/narratorLevelAdapt';

// Parisian-meter progress awarded for completing a speaking défi (≈7 défis to
// fill the meter and level up to the next CEFR level).
const DEFI_COMPLETE_XP = 15;

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

// Multiple-choice exercise
function PracticeExercise({ exercise, skillPct, onCorrect }) {
  const [selected, setSelected] = React.useState(null);
  const reportedRef = React.useRef(false);

  const options = exercise.options || [];
  const answer = exercise.answer || '';
  const question = exercise.question || exercise.sentence || '';

  const handleSelect = (opt) => {
    if (selected !== null) return;
    setSelected(opt);
    if (opt === answer && !reportedRef.current) {
      reportedRef.current = true;
      onCorrect?.();
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-display text-[16px] leading-snug text-navy">{question}</p>
      <div className="flex flex-col gap-1.5">
        {options.map((opt, i) => {
          const isSelected = selected === opt;
          const isCorrect = opt === answer;
          let cls = 'border border-line/60 text-navy/70 hover:border-wine/40 hover:text-navy transition-colors';
          if (isSelected && isCorrect) cls = 'border border-green-500 bg-green-50 text-green-700';
          else if (isSelected && !isCorrect) cls = 'border border-wine/60 bg-wine/5 text-wine';
          else if (selected !== null && isCorrect) cls = 'border border-green-500 bg-green-50 text-green-700';
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(opt)}
              disabled={selected !== null}
              className={`text-left px-3 py-1.5 text-[14px] font-display transition-colors ${cls}`}
            >
              <span className="text-[11px] font-mono text-navy/30 mr-2">{String.fromCharCode(65 + i)}.</span>
              {opt}
              {isSelected && isCorrect && <span className="ml-1.5 text-green-600 text-[12px]">✓</span>}
              {isSelected && !isCorrect && <span className="ml-1.5 text-wine text-[12px]">✗</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Fill-in-the-blank exercises attached to one grammar rule. Uses the exercises
// stored with the rule when present; otherwise generates them on the fly via
// /api/practice so older DB content still always has something to practice.
// Write-your-own-sentence task: learner writes a sentence applying the rule /
// tense, then the AI checks it. Correct → green tick; otherwise → correction.
// Used by both the grammar and conjugation exercise sections.
function ProductionExercise({ instruction, requireGrammar = '' }) {
  const [answer, setAnswer] = React.useState('');
  const [correction, setCorrection] = React.useState(null); // { original, corrected, translation }
  const [correcting, setCorrecting] = React.useState(false);
  React.useEffect(() => { setAnswer(''); setCorrection(null); setCorrecting(false); }, [instruction]);

  const runCorrection = async () => {
    const text = answer.trim();
    if (!text || correcting) return;
    setCorrecting(true);
    try {
      // Standard register = fix only real grammar errors (keep the learner's
      // words). requireGrammar also rewrites the sentence if it doesn't actually
      // use the target grammar. A correct sentence that uses it → unchanged → tick.
      const r = await fetch('/api/correct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // `task` (the exercise prompt) is always sent so the corrector knows
        // what was asked even if no explicit grammar point is available.
        body: JSON.stringify({ text, register: 'Standard', requireGrammar, task: instruction }),
      });
      const d = await r.json();
      setCorrection({ original: text, corrected: d.corrected?.trim() || text, translation: d.translation?.trim() || null });
    } catch {
      setCorrection({ original: text, corrected: text, translation: null });
    }
    setCorrecting(false);
  };

  if (!instruction) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-1 pt-2.5 border-t border-line/40">
      <span className="text-[9px] font-mono tracking-widest uppercase text-navy/35">À ton tour d'écrire</span>
      <p className="font-display text-[13px] text-navy/80 leading-snug">{instruction}</p>
      <textarea
        value={answer}
        onChange={(e) => { setAnswer(e.target.value); setCorrection(null); }}
        rows={2}
        placeholder="Écris ta phrase…"
        className="w-full border border-wine/20 rounded px-2 py-1.5 bg-transparent text-navy text-[13px] font-display outline-none focus:border-wine/50 resize-none"
      />
      {!correction ? (
        <button type="button" onClick={runCorrection}
          disabled={!answer.trim() || correcting}
          className="self-start px-3 py-0.5 rounded-full bg-wine text-ivory text-[10px] font-display hover:bg-wine/85 transition-colors disabled:opacity-40">
          {correcting ? 'Correction…' : 'Corriger ma phrase'}
        </button>
      ) : (() => {
        const norm = (s) => (s || '').trim().replace(/\s+/g, ' ').replace(/[.!?…]+$/, '').toLowerCase();
        const isCorrect = norm(correction.original) === norm(correction.corrected);
        return isCorrect ? (
          <div className="flex items-center gap-1.5 text-[12px] font-display text-green-600">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="6.4" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
              <path d="M4 7.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Parfait, c'est correct&nbsp;! Bien joué.
          </div>
        ) : (
          <div className="bg-paper border border-line/50 rounded-lg px-3 py-2">
            <p className="text-[9px] font-mono uppercase tracking-widest text-navy/35 mb-1">Ta phrase</p>
            <p className="font-display text-[13px] text-navy/45 leading-snug line-through decoration-wine/40 select-text mb-2">{correction.original}</p>
            <p className="text-[9px] font-mono uppercase tracking-widest text-wine/50 mb-1">Correction</p>
            <p className="font-display text-[14px] text-wine leading-snug select-text">{correction.corrected}</p>
            {correction.translation && (
              <p className="text-[11px] text-navy/45 italic mt-1.5">{correction.translation}</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function GrammarRuleExercises({ rule, onCorrect }) {
  const stored = Array.isArray(rule.exercises) && rule.exercises.length > 0 ? rule.exercises.slice(0, 6) : null;
  const [exercises, setExercises] = React.useState(stored);
  const [loading, setLoading] = React.useState(!stored);
  const [answers, setAnswers] = React.useState({});
  const [revealed, setRevealed] = React.useState({});
  const rewardedRef = React.useRef({});

  React.useEffect(() => {
    if (stored) return;
    let cancelled = false;
    fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: rule.point }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setExercises((d.exercises || []).slice(0, 6));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setExercises([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = (i, expected) => {
    const ans = String(answers[i] || '').trim().toLowerCase();
    const ok = ans === String(expected || '').trim().toLowerCase();
    if (ok && !rewardedRef.current[i]) {
      rewardedRef.current[i] = true;
      onCorrect?.();
    }
    setRevealed((r) => ({ ...r, [i]: true }));
  };

  if (loading) {
    return <p className="text-[11px] text-navy/35 italic mt-2">Préparation des exercices…</p>;
  }
  if (!exercises || exercises.length === 0) return null;

  return (
    <div className="mt-2.5 pt-2.5 border-t border-line/40 flex flex-col gap-2.5">
      <span className="text-[9px] font-mono tracking-widest uppercase text-navy/35">À toi de jouer</span>
      {exercises.map((ex, i) => {
        const parts = String(ex.sentence || '').split('___');
        const ans = answers[i] || '';
        const isRevealed = revealed[i];
        const isCorrect = ans.trim().toLowerCase() === String(ex.answer || '').trim().toLowerCase();
        return (
          <div key={i} className="flex flex-col gap-1">
            <p className="font-display text-[13px] text-navy/80 leading-snug">
              {parts[0]}
              {isRevealed ? (
                <span className={`inline-block px-1.5 py-0.5 rounded text-[12px] font-semibold mx-0.5 ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-wine/10 text-wine'}`}>{ans || '—'}</span>
              ) : (
                <input
                  type="text"
                  value={ans}
                  onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && ans.trim() && check(i, ex.answer)}
                  className="inline-block w-[100px] border-b-2 border-wine/30 focus:border-wine bg-transparent text-navy text-center outline-none px-1 font-display text-[13px] mx-0.5 transition-colors"
                  autoComplete="off"
                />
              )}
              {parts[1]}
              {ex.hint && !isRevealed && <span className="text-[10px] text-navy/35 ml-1.5">({ex.hint})</span>}
            </p>
            {isRevealed && !isCorrect && (
              <p className="text-[11px] text-navy/40">→ <span className="font-semibold text-navy/70">{ex.answer}</span></p>
            )}
            {!isRevealed && ans.trim() && (
              <button type="button" onClick={() => check(i, ex.answer)}
                className="self-start px-3 py-0.5 rounded-full bg-wine text-ivory text-[10px] font-display hover:bg-wine/85 transition-colors">
                Check
              </button>
            )}
          </div>
        );
      })}

      {/* Write-your-own-sentence task using this grammar point — always shown.
          Uses the generated instruction when present, otherwise builds one from
          the grammar point name so older content (no `production` field) still
          gets a production exercise. */}
      <ProductionExercise
        instruction={rule.production?.instruction || (rule.point ? `À ton tour : écris ta propre phrase en utilisant « ${rule.point} ».` : 'Écris ta propre phrase en utilisant ce point de grammaire.')}
        requireGrammar={rule.point ? `la structure grammaticale « ${rule.point} »` : ''}
      />
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

// Little play icon shown over a clickable portrait on hover (parent needs `group`)
function PortraitHoverPlay() {
  return (
    <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-navy/35 rounded-full pointer-events-none">
      <svg width="11" height="13" viewBox="0 0 10 12" fill="none" aria-hidden>
        <path d="M1 1l8 5-8 5V1z" fill="white" />
      </svg>
    </span>
  );
}

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

function ComprehensionItem({ q, qi, firePointsDelta, narratorId = 'lea' }) {
  const [answeredIdx, setAnsweredIdx] = React.useState(null);
  const options = q.options || [];
  // Robustly resolve the correct option index: the model may return the exact
  // option text, or just a letter (A/B/C/D), or text with minor differences.
  const correctIdx = React.useMemo(() => {
    const raw = String(q.answer ?? '').trim();
    if (/^[A-Da-d]$/.test(raw)) {
      const li = raw.toLowerCase().charCodeAt(0) - 97;
      if (li >= 0 && li < options.length) return li;
    }
    const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[.!?]+$/, '');
    const exact = options.findIndex((o) => norm(o) === norm(raw));
    return exact; // -1 if none
  }, [q.answer, options]);

  const answered = answeredIdx != null;
  const isCorrect = answered && answeredIdx === correctIdx;
  return (
    <div className="space-y-1.5">
      <p className="font-display text-[13px] text-navy leading-snug">
        <span className="font-semibold text-wine/80 mr-1 tabular-nums">{qi + 1})</span>
        <TranslatableText text={q.question} narratorId={narratorId} />
      </p>
      <div className="space-y-1">
        {options.map((opt, oi) => {
          const chosen = answeredIdx === oi;
          const correct = oi === correctIdx;
          const cls = answered
            ? correct ? 'bg-green-50 border-green-400 text-green-700'
              : chosen ? 'bg-red-50 border-red-400 text-wine'
              : 'border-line/30 text-navy/35'
            : 'border-line/50 text-navy/70 hover:border-wine/40 hover:bg-wine/5 cursor-pointer';
          return (
            <button key={oi} type="button" disabled={answered}
              onClick={() => { if (!answered) { setAnsweredIdx(oi); firePointsDelta(oi === correctIdx ? 3 : -1); } }}
              className={`w-full text-left px-2.5 py-1.5 border text-[12px] font-display transition-colors ${cls}`}>
              <TranslatableText text={opt} narratorId={narratorId} />
            </button>
          );
        })}
      </div>

      {/* Explanation pop-up — appears after answering, in English */}
      <AnimatePresence>
        {answered && q.explanation && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`overflow-hidden rounded-md border px-2.5 py-2 ${isCorrect ? 'border-green-300 bg-green-50/60' : 'border-wine/30 bg-wine/[0.05]'}`}
          >
            <p className={`text-[10px] font-mono uppercase tracking-widest mb-0.5 ${isCorrect ? 'text-green-700/70' : 'text-wine/70'}`}>
              {isCorrect ? '✓ Correct' : '✗ Not quite'}
            </p>
            <p className="text-[12px] leading-snug text-navy/75">{q.explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VocabItem({ v, vi, firePointsDelta, narratorId = 'lea' }) {
  const [ans, setAns] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const correct = submitted && ans.trim().toLowerCase() === (v.word || '').toLowerCase();
  return (
    <div className={`p-2.5 border ${correct ? 'border-green-400/50 bg-green-50/50' : submitted ? 'border-wine/30 bg-wine/5' : 'border-line/50'}`}>
      <p className="font-display text-[13px] leading-snug text-navy mb-1.5">
        <TranslatableText text={v.sentence?.replace('___', '______') || '___'} narratorId={narratorId} />
      </p>
      <div className="flex items-center gap-2">
        {submitted ? (
          <span className={`font-display text-[13px] font-medium ${correct ? 'text-green-600' : 'text-wine'}`}>{ans} {correct ? '✓' : `✗ → ${v.word}`}</span>
        ) : (
          <input type="text" value={ans} onChange={e => setAns(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ans.trim()) { setSubmitted(true); firePointsDelta(ans.trim().toLowerCase() === v.word.toLowerCase() ? 2 : -1); } }}
            placeholder="Votre réponse…"
            className="flex-1 border border-navy/20 px-2 py-0.5 text-[12px] font-display text-navy focus:outline-none focus:border-wine/50 bg-transparent" />
        )}
        {!submitted && ans.trim() && (
          <button type="button" onClick={() => { setSubmitted(true); firePointsDelta(ans.trim().toLowerCase() === v.word.toLowerCase() ? 2 : -1); }}
            className="px-2 py-0.5 text-[10px] font-mono bg-wine text-ivory hover:bg-wine/80 transition-colors">OK</button>
        )}
      </div>
      <p className="text-[11px] text-navy/45 mt-1 italic">{v.definition}</p>
    </div>
  );
}

function ConjugationItem({ c, ci, firePointsDelta, narratorId = 'lea' }) {
  const [ans, setAns] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const correct = submitted && ans.trim().toLowerCase() === (c.answer || '').toLowerCase();
  return (
    <div className={`p-2.5 border ${correct ? 'border-green-400/50 bg-green-50/50' : submitted ? 'border-wine/30 bg-wine/5' : 'border-line/50'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-mono text-wine/60 uppercase tracking-wider">{c.verb}</span>
        <span className="text-[9px] text-navy/30">·</span>
        <span className="text-[9px] font-mono text-navy/40">{c.tense}</span>
        {c.hint && <span className="text-[9px] font-mono text-navy/30 ml-auto">({c.hint})</span>}
      </div>
      <p className="font-display text-[13px] text-navy leading-snug mb-1.5">
        <TranslatableText text={c.sentence?.replace('___', '______') || '___'} narratorId={narratorId} />
      </p>
      <div className="flex items-center gap-2">
        {submitted ? (
          <span className={`font-display text-[13px] font-medium ${correct ? 'text-green-600' : 'text-wine'}`}>{ans} {correct ? '✓' : `✗ → ${c.answer}`}</span>
        ) : (
          <input type="text" value={ans} onChange={e => setAns(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ans.trim()) { setSubmitted(true); firePointsDelta(ans.trim().toLowerCase() === c.answer.toLowerCase() ? 2 : -1); } }}
            placeholder="Conjuguez…"
            className="flex-1 border border-navy/20 px-2 py-0.5 text-[12px] font-display text-navy focus:outline-none focus:border-wine/50 bg-transparent" />
        )}
        {!submitted && ans.trim() && (
          <button type="button" onClick={() => { setSubmitted(true); firePointsDelta(ans.trim().toLowerCase() === c.answer.toLowerCase() ? 2 : -1); }}
            className="px-2 py-0.5 text-[10px] font-mono bg-wine text-ivory hover:bg-wine/80 transition-colors">OK</button>
        )}
      </div>
    </div>
  );
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
  readingVocab = [],
  listeningQuestions = [],
  listeningVocab = [],
  listeningGrammar = [],
  activeTab: activeTabProp = null,
  onTabChange = null,
  exerciseQuestions = [],
  exerciseVocab = [],
  exerciseGrammar = [],
  exerciseConjugation = [],
  exerciseLoading = false,
  exerciseSubTabProp = null,
  onExerciseSubTabChange = null,
  speakingNarratorId = 'lea',
  speakingTopicLabel = '',
  speakingOpeningLine = '',
  speakingTargetGrammar = null,
  speakingTargetVocab = null,
  onDefiProgress = null,
  onNewSpeakingChallenge = null,
  writingNarratorId = 'lea',
  writingPrompt = '',
  writingTips = {},
  writingWordTarget = 80,
  onWritingProgress = null,
  onNewWritingChallenge = null,
}) {
  const { effectiveLevel, gainExperience, gainDailyParisianPoints } = useLearnerProfile();
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
  const [tabCaptureError, setTabCaptureError] = React.useState(null);
  const [stableWordCount, setStableWordCount] = React.useState(0);
  const [overallLevel, setOverallLevel] = React.useState(null);
  const [overallStrength, setOverallStrength] = React.useState(null);
  const [overallWeakness, setOverallWeakness] = React.useState(null);
  const [practiceTopics, setPracticeTopics] = React.useState([]);
  const [practiceSubTab, setPracticeSubTab] = React.useState('comprehension');
  const [exerciseSubTabLocal, setExerciseSubTabLocal] = React.useState('comprehension');
  const exerciseSubTab = exerciseSubTabProp ?? exerciseSubTabLocal;
  const setExerciseSubTab = React.useCallback((t) => { setExerciseSubTabLocal(t); onExerciseSubTabChange?.(t); }, [onExerciseSubTabChange]);
  const [practiceVocabAnswers, setPracticeVocabAnswers] = React.useState({});
  const [practiceAnsweredQ, setPracticeAnsweredQ] = React.useState({});
  const [pointsDelta, setPointsDelta] = React.useState(null); // { value: +3 | -1, id: number } for animation
  const { dailyParisianPoints } = useLearnerProfile();
  const [assessingLevel, setAssessingLevel] = React.useState(false);
  const [activeTabInternal, setActiveTabInternal] = React.useState('transcript');
  const activeTab = activeTabProp ?? activeTabInternal;
  const setActiveTab = React.useCallback((t) => { setActiveTabInternal(t); onTabChange?.(t); }, [onTabChange]);
  // Stable narrator for exercise word pronunciation (one per session)
  const exerciseNarratorRef = React.useRef(Math.random() < 0.5 ? 'lea' : 'jules');
  const exerciseNarrator = activeTab === 'speaking' ? (speakingNarratorId || exerciseNarratorRef.current) : exerciseNarratorRef.current;
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
  // Guided writing review flow: idle → judging → judged → correcting → corrected → explaining → explained
  const [writeReview, setWriteReview] = React.useState({ stage: 'idle' });
  // Past exchanges in the current challenge — kept on screen so writing more
  // below doesn't erase the previous conversation.
  const [writeReviewHistory, setWriteReviewHistory] = React.useState([]);
  const [writeReviewQuestion, setWriteReviewQuestion] = React.useState('');
  const [writeReviewExample, setWriteReviewExample] = React.useState(null);
  const [writeReviewExampleLoading, setWriteReviewExampleLoading] = React.useState(false);
  const writeThreadScrollRef = React.useRef(null);
  // Keep the newest reaction/correction in view as the thread grows. Driven from
  // the parent (not each thread) and deferred so it runs AFTER layout settles —
  // otherwise a new reaction renders below the fold and the learner only hears it.
  React.useEffect(() => {
    const sc = writeThreadScrollRef.current;
    if (!sc) return;
    // Instant scroll (smooth is unreliable here), deferred ~80ms so it runs
    // AFTER the full thread has laid out — otherwise a new reaction lands below
    // the fold and the learner only hears the audio without seeing the text.
    const t = setTimeout(() => { sc.scrollTop = sc.scrollHeight; }, 80);
    return () => clearTimeout(t);
  }, [writeReview.stage, writeReview.reaction, writeReview.corrected, writeReview.explanation, writeReviewHistory.length, writeReviewExample, writeReviewExampleLoading]);
  const writeTextareaRef = React.useRef(null);
  const writeBoxRef = React.useRef(null);
  const [speakCorrection, setSpeakCorrection] = React.useState(null);
  const [fetchingCorrection, setFetchingCorrection] = React.useState(false);
  const [manualCorrection, setManualCorrection] = React.useState(null);
  const [manualCorrecting, setManualCorrecting] = React.useState(false);
  const [speakCorrectionOpen, setSpeakCorrectionOpen] = React.useState(false);
  const [previewCorrection, setPreviewCorrection] = React.useState(null);
  const [fetchingPreview, setFetchingPreview] = React.useState(false);
  const [narratorReaction, setNarratorReaction] = React.useState(null);
  // Défi speaking conversation: the Parisian's reply pinned under each learner
  // utterance, which utterance is awaiting a reply, and whether the learner has
  // used all the défi's target grammar + vocab (→ ready for a new question).
  const [replyByUtterance, setReplyByUtterance] = React.useState({});
  const [replyLoadingUttId, setReplyLoadingUttId] = React.useState(null);
  // Per-utterance correctness in the défi: { [uttId]: { correct, corrected, translation } }.
  // Correct → a blue tick next to the sentence; wrong → a "Correct my sentence" button.
  const [correctionByUtterance, setCorrectionByUtterance] = React.useState({});
  const [openCorrectionUttId, setOpenCorrectionUttId] = React.useState(null);
  const [defiComplete, setDefiComplete] = React.useState(false);
  // Achievement shown when a défi is completed: the level badge earned and
  // whether this completion levelled the learner up to a new CEFR level.
  const [defiBadge, setDefiBadge] = React.useState(null); // { level, leveledUp }
  // Cumulative défi progress: which target vocab words + the target grammar the
  // learner has used so far. Reported up so the "Ton défi" card can light them up.
  const [defiUsedVocab, setDefiUsedVocab] = React.useState([]);
  const [defiUsedGrammar, setDefiUsedGrammar] = React.useState(false);
  const [correctionReaderId, setCorrectionReaderId] = React.useState(null);
  const [sentenceCongrats, setSentenceCongrats] = React.useState(null);
  // Congrats lines pinned to their utterance — persist in the transcript
  // (the transient below-tabs banner was removed; this is the durable record).
  const [congratsByUtterance, setCongratsByUtterance] = React.useState({});
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
  const tabCaptureRef = React.useRef(null);

  // Parisian voice playback timing
  const [parisianPlaybackTime, setParisianPlaybackTime] = React.useState(null);
  const [parisianTimings, setParisianTimings] = React.useState([]);
  const [parisianSpeakingText, setParisianSpeakingText] = React.useState(null);
  const [narratorVoiceLoadingKey, setNarratorVoiceLoadingKey] = React.useState(null);

  // Parisian word chat challenge (Discover → Chat tab flow)
  const [parisianWordChallenge, setParisianWordChallenge] = React.useState(null);
  const parisianWordChallengeRef = React.useRef(null); // stable ref for async effect
  const [parisianWordChallengeLoading, setParisianWordChallengeLoading] = React.useState(false);
  const [parisianChallengeAttempt, setParisianChallengeAttempt] = React.useState(0);
  const parisianChallengeAttemptRef = React.useRef(0);

  // Chat tab intro (Léa introduces herself and asks a question)
  const chatIntroPlayedRef = React.useRef(false);
  const [chatIntroLine, setChatIntroLine] = React.useState(null); // { text, narratorId }

  // Chat conversation history
  const [chatHistory, setChatHistory] = React.useState([]); // [{ id, role:'lea'|'user', text, narratorId?, loading? }]
  const chatHistoryRef = React.useRef([]); // stable ref for async effects
  const chatCommittedRef = React.useRef(0); // how many utterances already in history
  const [chatLeaLoading, setChatLeaLoading] = React.useState(false);
  const chatWasRecordingRef = React.useRef(false);
  const [chatCorrectionPopup, setChatCorrectionPopup] = React.useState(null); // { msgId, corrected }
  const [chatPlayingId, setChatPlayingId] = React.useState(null);
  const [chatPlayingTime, setChatPlayingTime] = React.useState(null);
  const chatAudioRef = React.useRef(null);

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
  // True while the current recording is a "repeat-after-me" attempt, so the
  // auto-correct effect doesn't fire a second full correction over it.
  const isRepeatRecordingRef = React.useRef(false);
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
  }, [utterances, settledText, partialTranscript, repeatAttemptText, repeatFeedback, isRecording, repeatUtteranceBase, chatHistory, parisianWordChallengeLoading]);

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

  // Speaking défi: when the learner stops talking, the Parisian replies in a
  // guided conversation — rebounding on what they said and nudging them to use
  // the défi's target grammar + vocab. Each reply is pinned under the learner's
  // utterance. When every target has been used, the backend returns complete →
  // defiComplete flips and a fresh question loads. Repeat-after-me is skipped.
  const wasRecordingRef = React.useRef(false);
  React.useEffect(() => {
    const justStopped = wasRecordingRef.current && !isRecording;
    wasRecordingRef.current = isRecording;
    if (!justStopped || activeTab !== 'speaking') return;
    if (isRepeatRecordingRef.current) return;
    const list = utterancesRef.current;
    const lastUtt = list[list.length - 1];
    const latestText = lastUtt?.text?.trim();
    if (!lastUtt || !latestText) return;
    const uttId = lastUtt.id;
    setReplyLoadingUttId(uttId);
    const history = list.map((u) => u.text?.trim()).filter(Boolean);
    fetch('/api/speaking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reaction',
        utterance: latestText,
        narratorId: speakingNarratorId,
        topic: speakingTopicLabel,
        openingLine: speakingOpeningLine,
        targetGrammar: speakingTargetGrammar,
        targetVocab: speakingTargetVocab,
        history,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setReplyLoadingUttId((cur) => (cur === uttId ? null : cur));
        if (!data.text) return;
        const reply = { id: speakingNarratorId, text: data.text, translation: data.translation };
        setReplyByUtterance((prev) => ({ ...prev, [uttId]: reply }));
        playNarratorLine(reply);
        const corrected = data.correction?.corrected?.trim() || '';
        const correct = data.sentenceCorrect !== false
          && (!corrected || corrected === latestText.trim());
        setCorrectionByUtterance((prev) => ({
          ...prev,
          [uttId]: {
            correct,
            corrected: correct ? '' : corrected,
            translation: data.correction?.translation?.trim() || '',
          },
        }));
        if (Array.isArray(data.usedVocab) && data.usedVocab.length) {
          setDefiUsedVocab((prev) => Array.from(new Set([...prev, ...data.usedVocab])));
        }
        if (data.usedGrammar) setDefiUsedGrammar(true);
        if (data.complete && !defiComplete) {
          // Completing a défi is a big chunk of progress toward the next level.
          const before = effectiveLevel;
          const updated = gainExperience(DEFI_COMPLETE_XP);
          const after = getEffectiveLevel(updated);
          setDefiBadge({ level: after, leveledUp: after !== before });
          setDefiComplete(true);
        }
      })
      .catch(() => setReplyLoadingUttId((cur) => (cur === uttId ? null : cur)));
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report défi progress up so the "Ton défi" card can tick off used items.
  React.useEffect(() => {
    onDefiProgress?.({ usedVocab: defiUsedVocab, usedGrammar: defiUsedGrammar });
  }, [defiUsedVocab, defiUsedGrammar]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Chat tab intro — play once on first load when no conversation yet
  const CHAT_INTROS = [
    "Bonjour ! Je suis Léa, ta coach de français parisien. Dis-moi, pourquoi tu apprends le français ?",
    "Salut ! Moi c'est Léa. Tu as déjà visité Paris ? Raconte-moi !",
    "Bonjour ! Je m'appelle Léa. Pour commencer, dis-moi une chose que tu aimes en France !",
  ];
  React.useEffect(() => {
    const alreadyHasContent = utterances.length > 0 || !!partialTranscript || !!settledText;
    if (activeTab !== 'transcript' || alreadyHasContent || chatIntroPlayedRef.current) return;
    chatIntroPlayedRef.current = true;
    const text = CHAT_INTROS[Math.floor(Math.random() * CHAT_INTROS.length)];
    setChatIntroLine({ text, narratorId: 'lea' });
    const introMsg = { id: 'intro', role: 'lea', text, narratorId: 'lea' };
    chatHistoryRef.current = [introMsg];
    setChatHistory([introMsg]);
    // Don't auto-play — user clicks the play button on the bubble to start
  }, [activeTab, utterances, partialTranscript, settledText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit one Parisian-word-challenge attempt — shared by speak (recording stop)
  // and write mode, so toggling to write continues the same exercise.
  const submitParisianChallengeAttempt = (userText, userId, leaId) => {
    const challenge = parisianWordChallengeRef.current;
    if (!challenge) return false;
    const attempt = parisianChallengeAttemptRef.current + 1;
    parisianChallengeAttemptRef.current = attempt;
    setParisianChallengeAttempt(attempt);
    const isFinal = attempt >= 3;

    fetch('/api/speaking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'word-challenge',
        utterance: userText,
        word: challenge.word,
        meaning: challenge.meaning,
        narratorId: challenge.narratorId,
        attemptNumber: attempt,
      }),
    })
      .then(r => r.json())
      .then(data => {
        const { feedback, isCorrect, corrected, examples, nextTopic } = data;

        // Reward a correct use of the word with points (triggers the flip animation)
        if (isCorrect) firePointsDelta(3);

        // Green tick ONLY when the Parisian judge approved the sentence.
        // If wrong: attach the grammar correction when we have one, otherwise
        // leave the bubble unmarked (no tick, no popup) — Léa's reply explains.
        if (isCorrect) {
          chatHistoryRef.current = chatHistoryRef.current.map(m =>
            m.id === userId ? { ...m, correctionOk: true } : m
          );
        } else if (corrected && corrected.trim() !== userText.trim()) {
          chatHistoryRef.current = chatHistoryRef.current.map(m =>
            m.id === userId ? { ...m, correction: corrected.trim() } : m
          );
        }

        // Build Léa's feedback message — never vanish silently: fall back to a
        // generic line if the API returned empty feedback.
        const retryLines = isCorrect
          ? [
              `Bien joué, tu as utilisé « ${challenge.word} » ! Allez, tente une autre phrase !`,
              `Nickel, « ${challenge.word} » est bien placé ! Vas-y, refais-m'en une !`,
              `Parfait ! Encore une phrase avec « ${challenge.word} », pour voir ?`,
            ]
          : [
              `Hmm, essaie encore d'utiliser « ${challenge.word} » dans une phrase !`,
              `Pas tout à fait… Retente une phrase avec « ${challenge.word} » !`,
              `Presque ! Vas-y, refais-moi une phrase avec « ${challenge.word} ».`,
            ];
        let fullFeedback = feedback
          || retryLines[Math.floor(Math.random() * retryLines.length)];

        // On final attempt: append 2 example sentences
        if (isFinal && examples?.length) {
          const exBlock = examples.map(ex => `• ${ex}`).join('\n');
          fullFeedback += `\n\nVoici deux phrases avec « ${challenge.word} » :\n${exBlock}`;
        }

        chatHistoryRef.current = chatHistoryRef.current.map(m =>
          m.id === leaId ? { ...m, loading: false, text: fullFeedback } : m
        );
        setChatHistory([...chatHistoryRef.current]);
        playNarratorLine({ id: challenge.narratorId, text: fullFeedback });

        // On final attempt: end challenge, restart conversation on new topic
        if (isFinal) {
          setParisianWordChallenge(null);
          parisianWordChallengeRef.current = null;
          setParisianChallengeAttempt(0);
          parisianChallengeAttemptRef.current = 0;

          if (nextTopic) {
            const restartDelay = (fullFeedback.length / 12) * 1000 + 1500; // wait for TTS
            setTimeout(() => {
              fetch('/api/speaking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: nextTopic }),
              })
                .then(r => r.json())
                .then(openerData => {
                  if (!openerData.openingLine) return;
                  const opId = `lea-restart-${Date.now()}`;
                  const withRestart = [
                    ...chatHistoryRef.current,
                    { id: opId, role: 'lea', text: openerData.openingLine, narratorId: openerData.narratorId || challenge.narratorId },
                  ];
                  chatHistoryRef.current = withRestart;
                  setChatHistory(withRestart);
                  playNarratorLine({ id: openerData.narratorId || challenge.narratorId, text: openerData.openingLine });
                })
                .catch(() => {});
            }, restartDelay);
          }
        }
      })
      .catch(() => {
        // Show a retry line rather than silently removing the bubble
        chatHistoryRef.current = chatHistoryRef.current.map(m =>
          m.id === leaId ? { ...m, loading: false, text: `Oups, petit souci technique… Réessaie d'utiliser « ${challenge.word} » !` } : m
        );
        setChatHistory([...chatHistoryRef.current]);
      })
      .finally(() => setChatLeaLoading(false));
    return true;
  };

  // Chat tab: on recording stop, commit utterances as user bubble then get Léa's reply
  React.useEffect(() => {
    const justStopped = chatWasRecordingRef.current && !isRecording;
    chatWasRecordingRef.current = isRecording;
    if (!justStopped || activeTab !== 'transcript') return;

    const newUtts = utterances.slice(chatCommittedRef.current);
    const userText = newUtts.map(u => u.text).join(' ').trim();
    if (!userText) return;

    chatCommittedRef.current = utterances.length;
    const leaId = `lea-${Date.now()}`;
    const userId = `user-${Date.now()}`;
    const lastLeaText = [...chatHistoryRef.current].reverse().find(m => m.role === 'lea' && !m.loading)?.text || '';
    // Reply comes from the active challenge narrator (Léa or Jules), else Léa
    const replyNarrator = parisianWordChallengeRef.current?.narratorId || 'lea';

    const updated = [
      ...chatHistoryRef.current,
      { id: userId, role: 'user', text: userText, audioUrl: newUtts[0]?.audioUrl || null, words: newUtts[0]?.words || [], wordOffset: newUtts[0]?.startTime || 0 },
      { id: leaId, role: 'lea', loading: true, narratorId: replyNarrator },
    ];
    chatHistoryRef.current = updated;
    setChatHistory(updated);
    setChatLeaLoading(true);

    // ── Parisian word challenge mode ──────────────────────────────────────────
    if (submitParisianChallengeAttempt(userText, userId, leaId)) return; // skip normal flow

    // ── Normal chat reaction ──────────────────────────────────────────────────
    // Fetch Léa's reply + correction in parallel
    fetch('/api/speaking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reaction',
        utterance: userText,
        narratorId: 'lea',
        topic: 'conversation générale en français',
        openingLine: lastLeaText,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.text) {
          const resolved = chatHistoryRef.current.map(m =>
            m.id === leaId ? { ...m, loading: false, text: data.text } : m
          );
          chatHistoryRef.current = resolved;
          setChatHistory(resolved);
          playNarratorLine({ id: 'lea', text: data.text });
        } else {
          const filtered = chatHistoryRef.current.filter(m => m.id !== leaId);
          chatHistoryRef.current = filtered;
          setChatHistory(filtered);
        }
      })
      .catch(() => {
        const filtered = chatHistoryRef.current.filter(m => m.id !== leaId);
        chatHistoryRef.current = filtered;
        setChatHistory(filtered);
      })
      .finally(() => setChatLeaLoading(false));

    // Correction check (fire-and-forget, attaches to user bubble)
    fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: userText }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.corrected && data.corrected.trim() !== userText.trim()) {
          const withCorr = chatHistoryRef.current.map(m =>
            m.id === userId ? { ...m, correction: data.corrected.trim() } : m
          );
          chatHistoryRef.current = withCorr;
          setChatHistory(withCorr);
        }
      })
      .catch(() => {});
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto write mode when Writing tab activates; restore speak when back on Chat
  React.useEffect(() => {
    if (activeTab === 'writing') {
      setInputMode('write');
      setLastSpeakWriteMode('write');
    } else if (inputMode === 'write') {
      setInputMode('speak');
      setLastSpeakWriteMode('speak');
    }
    if (activeTab !== 'transcript') {
      setParisianWordChallenge(null);
      parisianWordChallengeRef.current = null;
      setParisianWordChallengeLoading(false);
      setParisianChallengeAttempt(0);
      parisianChallengeAttemptRef.current = 0;
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  React.useEffect(() => {
    stopParisianAudio();
    audioRef.current?.pause();
    if (chatAudioRef.current) { chatAudioRef.current.pause(); chatAudioRef.current = null; setChatPlayingId(null); setChatPlayingTime(null); }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { setSpeakCorrectionOpen(false); }, [manualCorrection]);

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
      const congratsLine = getAlreadyCorrectLine(readerId);
      setSentenceCongrats(congratsLine);
      if (targetUtteranceId != null) {
        setCongratsByUtterance((prev) => ({ ...prev, [targetUtteranceId]: congratsLine }));
      }
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
      const successLine = getRepeatSuccessLine(correctionReaderId);
      setSentenceCongrats(successLine);
      if (correctionUtteranceId != null) {
        setCongratsByUtterance((prev) => ({ ...prev, [correctionUtteranceId]: successLine }));
      }
      return;
    }
    setRepeatFeedback('fail');
    playNarratorLine(getRepeatFailLine(correctionReaderId));
  }, [manualCorrection, correctionReaderId, correctionUtteranceId, gainExperience, playNarratorLine]);

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

  const firePointsDelta = React.useCallback((value) => {
    gainDailyParisianPoints(value);
    setPointsDelta({ value, id: Date.now() });
    setTimeout(() => setPointsDelta(null), 1400);
  }, [gainDailyParisianPoints]);

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
    if (readingVocab?.length > 0) gainDailyParisianPoints();
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

  const clearTabCapture = React.useCallback(() => {
    releaseTabCapture(tabCaptureRef.current);
    tabCaptureRef.current = null;
  }, []);

  const stopRecordingWithGrace = React.useCallback(async () => {
    if (!isRecording) return;
    const session = ++stopRecordingSessionRef.current;
    setStoppingRecording(true);
    try {
      await wait(RECORDING_STOP_GRACE_MS);
      if (stopRecordingSessionRef.current !== session) return;
      await stop();
      clearTabCapture();
      await wait(RECORDING_STOP_SETTLE_MS);
    } finally {
      if (stopRecordingSessionRef.current === session) {
        setStoppingRecording(false);
      }
    }
  }, [isRecording, stop, clearTabCapture]);

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
    isRepeatRecordingRef.current = awaitingRepeat;
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
    clearTabCapture();
    setSource('mic');
    setTabCaptureError(null);
    await start(awaitingRepeat ? {
      utteranceEndMs: 1000,
      endpointing: 500,
      onSpeechFinal: handleRepeatSpeechFinal,
    } : {});
  };

  const toggleTabRecording = async () => {
    if (stoppingRecording || manualCorrecting || awaitingRepeat) return;
    if (isRecording) {
      await stopRecordingWithGrace();
      return;
    }

    setTime(0);
    setPlaybackTime(null);
    setIsPlaying(false);
    isRepeatRecordingRef.current = false;
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
    setHighlightMic(false);
    setShowStartHint(false);
    repeatAutoStoppingRef.current = false;
    stopParisianAudio();
    clearTabCapture();

    try {
      const capture = await captureTabAudioStream();
      tabCaptureRef.current = capture;
      capture.stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!tabCaptureRef.current) return;
          stopRecordingWithGrace();
        };
      });
      setSource('tab');
      setTabCaptureError(null);
      await start({ stream: capture.stream });
    } catch (err) {
      clearTabCapture();
      setSource('mic');
      setTabCaptureError(err?.message || 'Unable to capture tab audio.');
    }
  };

  // Dev REC button: pipe system audio into the normal speech box
  const stopRecordingWithGraceRef = React.useRef(stopRecordingWithGrace);
  stopRecordingWithGraceRef.current = stopRecordingWithGrace;
  const startRef = React.useRef(start);
  startRef.current = start;

  React.useEffect(() => {
    const onSysAudioStart = async (e) => {
      const { stream } = e.detail;
      if (!stream) return;
      if (isRecording) await stopRecordingWithGraceRef.current();
      setTime(0); setPlaybackTime(null); setIsPlaying(false);
      setSpeakCorrection(null); setPreviewCorrection(null); setNarratorReaction(null);
      setManualCorrection(null); setSentenceCongrats(null); setCorrectionUtteranceId(null);
      setManualCorrecting(false); setAwaitingRepeat(false); setRepeatFeedback(null);
      correctionAudioPlayedRef.current = null;
      setHighlightMic(false); setShowStartHint(false);
      repeatAutoStoppingRef.current = false;
      stopParisianAudio(); clearTabCapture();
      setSource('system');
      setTabCaptureError(null);
      await startRef.current({ stream });
    };
    const onSysAudioStop = () => stopRecordingWithGraceRef.current();
    window.addEventListener('dev-sysaudio-start', onSysAudioStart);
    window.addEventListener('dev-sysaudio-stop', onSysAudioStop);
    return () => {
      window.removeEventListener('dev-sysaudio-start', onSysAudioStart);
      window.removeEventListener('dev-sysaudio-stop', onSysAudioStop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    const onExerciseTab = ['reading', 'listening', 'speaking', 'writing'].includes(activeTabProp);
    if (initialLearnMode === 'speak') {
      setInputMode('speak');
      setLastSpeakWriteMode('speak');
      if (!onExerciseTab) setActiveTab('transcript');
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
    } else if (initialLearnMode === 'write') {
      setInputMode('write');
      setLastSpeakWriteMode('write');
      if (!onExerciseTab) setActiveTab('transcript');
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

  // Same-text resubmission is only blocked while a review of it is in
  // progress — if nothing is on screen (stage idle), let it through, otherwise
  // the tick silently does nothing and looks broken.
  const isDuplicateSubmit = (trimmed) =>
    trimmed === writeSubmittedText && !(activeTab === 'writing' && writeReview.stage === 'idle');

  const finishWriteInput = () => {
    const trimmed = writeText.trim();
    if (!trimmed || isDuplicateSubmit(trimmed)) return;
    setWriteSubmittedText(trimmed);
    setWriteCorrection(null);
    setManualCorrection(null);
    setPreviewCorrection(null);
    setWriteEditing(false);

    // On the Writing tab → run the guided review flow (judge against the challenge).
    if (activeTab === 'writing') {
      // Freeze the exchange we just finished so it stays in the thread.
      if (writeReview.stage !== 'idle' && writeReview.original) {
        setWriteReviewHistory((h) => [...h, { ...writeReview, id: writeReview.id || `wr-${Date.now()}` }]);
      }
      setWriteText('');
      startWritingReview(trimmed);
      return;
    }
    // Active Parisian-word challenge → a written sentence continues the exercise
    // exactly like a spoken one (judged by the Parisian, attempts count).
    if (parisianWordChallengeRef.current) {
      const userId = `user-${Date.now()}`;
      const leaId = `lea-${Date.now()}`;
      const replyNarrator = parisianWordChallengeRef.current.narratorId || 'lea';
      const updated = [
        ...chatHistoryRef.current,
        { id: userId, role: 'user', text: trimmed },
        { id: leaId, role: 'lea', loading: true, narratorId: replyNarrator },
      ];
      chatHistoryRef.current = updated;
      setChatHistory(updated);
      setChatLeaLoading(true);
      submitParisianChallengeAttempt(trimmed, userId, leaId);
      setWriteText('');
      setWriteSubmittedText('');
      return;
    }
    // Elsewhere (chat write box) → keep the simple preview correction.
    setNarratorReaction(pickNarratorReaction(effectiveLevel));
    fetchPreviewCorrection(writeText);
  };

  // ── Guided writing review (Writing tab) ────────────────────────────────────
  const startWritingReview = React.useCallback(async (text) => {
    const narratorId = writingNarratorId || 'lea';
    setWriteReviewQuestion('');
    // Fresh exchange → clear the previous "Show example" so it doesn't carry over.
    setWriteReviewExample(null);
    setWriteReviewExampleLoading(false);
    setWriteReview({ stage: 'judging', narratorId, original: text });
    try {
      const r = await fetch('/api/writing-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'feedback', text, prompt: writingPrompt, tips: writingTips, wordTarget: writingWordTarget, narratorId, level: effectiveLevel || 'B1' }),
      });
      const data = await r.json();
      const reaction = (data.reaction || 'Pas mal ! Voyons comment on peut améliorer ça.').replace(/\*\*/g, '');
      if (data.usedTips) onWritingProgress?.(data.usedTips);
      setWriteReview({ stage: 'judged', narratorId, original: text, reaction });
      playNarratorLine({ id: narratorId, text: reaction });
    } catch {
      setWriteReview({ stage: 'judged', narratorId, original: text, reaction: 'Bien joué ! Regardons la correction.' });
    }
  }, [writingNarratorId, writingPrompt, writingTips, writingWordTarget, effectiveLevel, playNarratorLine, onWritingProgress]);

  const runWritingCorrection = React.useCallback(async () => {
    setWriteReview((rv) => ({ ...rv, stage: 'correcting' }));
    const original = writeReview.original || writeText.trim();
    try {
      const r = await fetch('/api/correct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Standard register = fix only real grammar errors. A correct sentence
        // comes back unchanged → we show a green tick instead of a "correction".
        body: JSON.stringify({ text: original, register: 'Standard', learnerLevel: effectiveLevel }),
      });
      const data = await r.json();
      const corrected = data.corrected?.trim() || original;
      setWriteReview((rv) => ({ ...rv, stage: 'corrected', corrected, translation: data.translation?.trim() || null }));
    } catch {
      setWriteReview((rv) => ({ ...rv, stage: 'corrected', corrected: original }));
    }
  }, [writeReview.original, writeText, effectiveLevel]);

  const submitWritingQuestion = React.useCallback(async () => {
    const q = writeReviewQuestion.trim();
    if (!q) return;
    const narratorId = writeReview.narratorId || 'lea';
    setWriteReview((rv) => ({ ...rv, stage: 'explaining', userQuestion: q }));
    try {
      const r = await fetch('/api/writing-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'explain', question: q, original: writeReview.original, corrected: writeReview.corrected, narratorId, level: effectiveLevel || 'B1' }),
      });
      const data = await r.json();
      setWriteReview((rv) => ({ ...rv, stage: 'explained', explanation: data.explanation || '', exercise: data.exercise || null }));
      if (data.explanation) playNarratorLine({ id: narratorId, text: data.explanation });
    } catch {
      setWriteReview((rv) => ({ ...rv, stage: 'explained', explanation: '', exercise: null }));
    }
  }, [writeReviewQuestion, writeReview.narratorId, writeReview.original, writeReview.corrected, effectiveLevel, playNarratorLine]);

  const resetWritingReview = React.useCallback(() => {
    setWriteReview({ stage: 'idle' });
    setWriteReviewHistory([]);
    setWriteReviewQuestion('');
    setWriteReviewExample(null);
    setWriteReviewExampleLoading(false);
    setWriteText('');
    setWriteSubmittedText(null);
    setWriteEditing(true);
    onNewWritingChallenge?.();
    setTimeout(() => writeTextareaRef.current?.focus(), 50);
  }, [onNewWritingChallenge]);

  const fetchWritingExample = React.useCallback(async () => {
    if (writeReviewExampleLoading || writeReviewExample !== null) return;
    setWriteReviewExampleLoading(true);
    try {
      const r = await fetch('/api/writing-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'example', prompt: writingPrompt, tips: writingTips, wordTarget: writingWordTarget, narratorId: writeReview.narratorId || 'lea', level: effectiveLevel || 'B1' }),
      });
      const data = await r.json();
      setWriteReviewExample(data.example || '');
    } catch {
      setWriteReviewExample('');
    }
    setWriteReviewExampleLoading(false);
  }, [writeReviewExampleLoading, writeReviewExample, writingPrompt, writingTips, writingWordTarget, writeReview.narratorId, effectiveLevel]);

  // Retry the SAME challenge: back to the textarea with the previous answer
  // kept so it can be improved — no new prompt is fetched.
  const retryWritingChallenge = React.useCallback(() => {
    setWriteReview({ stage: 'idle' });
    setWriteReviewQuestion('');
    setWriteSubmittedText(null);
    setWriteEditing(true);
    setTimeout(() => writeTextareaRef.current?.focus(), 50);
  }, []);

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

  const correctNow = async (overrideReaderId = null) => {
    const text = inputMode === 'write'
      ? writeText.trim()
      : getLatestSpeakText();
    if (!text) return;
    const readerId = overrideReaderId ?? narratorReaction?.id ?? correctionReaderId ?? pickNarratorReaction(effectiveLevel).id;
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

  // Défi speaking is now a guided conversation (see the reaction effect above):
  // the Parisian replies and relances; there is no automatic correction here.

  // Défi réussi: the badge + "Prochain exercice" button now appear (see render).
  // The learner advances on their own with that button — no auto-reset.

  const resetTranscript = () => {
    stopRecordingSessionRef.current += 1;
    setStoppingRecording(false);
    stopRaf();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    reset();
    clearTabCapture();
    setSource('mic');
    setTabCaptureError(null);
    setTime(0);
    setSpeakCorrection(null);
    setFetchingCorrection(false);
    setNarratorReaction(null);
    setReplyByUtterance({});
    setReplyLoadingUttId(null);
    setCorrectionByUtterance({});
    setOpenCorrectionUttId(null);
    setDefiComplete(false);
    setDefiBadge(null);
    setDefiUsedVocab([]);
    setDefiUsedGrammar(false);
    setCorrectionReaderId(null);
    setManualCorrection(null);
    setSentenceCongrats(null);
    setCorrectionUtteranceId(null);
    setManualCorrecting(false);
    setPreviewCorrection(null);
    setFetchingPreview(false);
    setAwaitingRepeat(false);
    isRepeatRecordingRef.current = false;
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
    // Stay on the Speaking défi tab; only the open-ended Chat falls back to transcript.
    if (activeTab !== 'speaking') setActiveTab('transcript');
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

  const transcriptHeight = 'flex-1 min-h-0';
  const isExerciseTab = activeTab === 'reading' || activeTab === 'listening';

  // Clear leftover speech transcription when switching the card's tab, so a tab
  // like Speaking starts empty instead of showing remnants of the Chat session.
  const prevCardTabRef = React.useRef(activeTab);
  React.useEffect(() => {
    if (prevCardTabRef.current !== activeTab) {
      prevCardTabRef.current = activeTab;
      if (!isRecording) {
        reset();
        chatCommittedRef.current = 0; // keep chat utterance tracking in sync
      }
      // Leaving the Writing tab resets the guided review.
      if (activeTab !== 'writing') { setWriteReview({ stage: 'idle' }); setWriteReviewHistory([]); setWriteReviewQuestion(''); }
    }
  }, [activeTab, isRecording, reset]);

  const speakActionControls = inputMode === 'speak' ? (
    <div className="flex items-center gap-3 shrink-0">
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
        {/* Parisian Points display */}
        <PointsBurst points={dailyParisianPoints} className="mr-1">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-full bg-wine/[0.06] border-2 border-wine/20 select-none">
            <div className="flex flex-col items-center gap-[3px] -mt-1.5">
              <span className="font-display text-[19px] font-bold text-wine leading-none tabular-nums">
                {dailyParisianPoints}
              </span>
              <span className="text-[6.5px] font-mono tracking-wide uppercase text-wine/60 leading-tight">points</span>
            </div>
            {pointsDelta && (
              <span
                key={pointsDelta.id}
                className={`absolute -top-4 left-1/2 -translate-x-1/2 font-display font-bold text-[13px] whitespace-nowrap pointer-events-none`}
                style={{
                  color: pointsDelta.value > 0 ? '#16a34a' : '#8B1E2D',
                  animation: 'parisianDeltaFloat 1.4s ease-out forwards',
                }}
              >
                {pointsDelta.value > 0 ? `+${pointsDelta.value}` : pointsDelta.value}
              </span>
            )}
          </div>
        </PointsBurst>
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
          {/* Sound-wave rings when recording */}
          {isRecording && (
            <>
              <span className="absolute w-[52px] h-[52px] rounded-full bg-wine/25 animate-ping pointer-events-none" style={{ animationDuration: '1.1s' }} />
              <span className="absolute w-[68px] h-[68px] rounded-full bg-wine/12 animate-ping pointer-events-none" style={{ animationDuration: '1.1s', animationDelay: '0.4s' }} />
            </>
          )}
          <button type="button" onClick={toggleRecording} disabled={status === 'connecting' || manualCorrecting || stoppingRecording || (isRecording && (source === 'tab' || source === 'system')) || (wordPlaying && !isRecording)}
            className={`relative w-11 h-11 rounded-full bg-wine disabled:opacity-60 inline-flex items-center justify-center transition-all ${
              isRecording ? 'shadow-[0_0_0_3px_rgba(139,30,45,0.3)]' :
              (highlightMic || showRepeatHint) ? 'hover:bg-wine2 hover:scale-105 shadow-md ring-2 ring-wine/35' : 'hover:bg-wine2 hover:scale-105'
            }`}
            aria-label="Toggle microphone recording">
            {isRecording ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <rect x="1" y="1" width="10" height="10" rx="2" fill="#F6F1E8" />
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
        ? 'fixed inset-6 z-50 bg-paper flex overflow-hidden rounded-2xl'
        : 'relative bg-paper hairline flex flex-col overflow-hidden rounded-2xl w-full max-w-[640px] lg:w-[640px] lg:min-w-[640px] shrink-0'}
      style={fullscreen ? { boxShadow: '0 40px 120px -20px rgba(26,35,64,0.4)' } : { boxShadow: '0 30px 80px -30px rgba(26,35,64,0.25), 0 8px 24px -12px rgba(26,35,64,0.08)', height: 500, minHeight: 500, maxHeight: 500 }}
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
      <div className={fullscreen ? 'flex-[2] flex flex-col overflow-y-auto min-w-0' : 'flex flex-col flex-1 min-h-0'}>
      {/* Mode controls + speech box */}
      <div className="px-3 sm:px-7 pt-3 flex flex-col gap-2 flex-1 min-h-0">
        <div className="flex items-center justify-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          <div className="relative flex items-center rounded-full p-0.5 bg-wine/10">
            <div
              className="absolute top-0.5 bottom-0.5 rounded-full bg-wine transition-all duration-200"
              style={(activeTab === 'writing' || activeTab === 'speaking') ? { width: 'calc(100% - 4px)', left: '2px' } : { width: 'calc((100% - 4px) / 2)', left: lastSpeakWriteMode === 'write' ? 'calc(2px + (100% - 4px) / 2)' : '2px' }}
            />
            {[
              { id: 'speak', label: 'Speak' },
              { id: 'write', label: 'Write' },
            ].filter((m) => (activeTab !== 'writing' || m.id === 'write') && (activeTab !== 'speaking' || m.id === 'speak')).map((m) => (
              <button key={m.id} type="button" onClick={() => (m.id === 'write' ? activateWriteMode() : activateSpeakMode())}
                className={`relative z-10 font-display text-[15px] tracking-wide px-4 py-1.5 rounded-full capitalize transition-colors duration-200 ${(lastSpeakWriteMode === m.id || activeTab === 'writing' || activeTab === 'speaking') ? 'text-ivory' : 'text-navy/45 hover:text-navy/70'}`}>
                {m.label}
              </button>
            ))}
          </div>

          <span className="text-[14px] text-navy/40 font-display italic">or</span>

          <button type="button" onClick={async () => {
            setHighlightDiscover(false);
            // Switch to Chat tab + speak mode
            setActiveTab('transcript');
            setInputMode('speak');
            setLastSpeakWriteMode('speak');
            if (parisianWordChallengeLoading) return;
            setParisianWordChallengeLoading(true);
            setParisianWordChallenge(null);
            try {
              const res = await fetch('/api/word', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              const data = await res.json();
              if (!data?.word) return;
              // Narrator + explanation come from the DB so the pre-generated
              // audio in the narrator-audio bucket matches exactly (no TTS wait)
              const narratorId = data.narratorId || (Math.random() < 0.5 ? 'lea' : 'jules');
              const intro = data.explanation || `Voici ton mot parisien du jour : « ${data.word} ». Ça veut dire "${data.meaning}". Par exemple : "${data.example}". Essaie maintenant de l'utiliser dans une phrase !`;
              const challenge = { word: data.word, meaning: data.meaning, example: data.example, exampleTranslation: data.exampleTranslation, narratorId };
              setParisianWordChallenge(challenge);
              parisianWordChallengeRef.current = challenge;
              setParisianChallengeAttempt(0);
              parisianChallengeAttemptRef.current = 0;
              // Append the word card + Léa's intro inline, below existing chat
              const cardId = `word-card-${Date.now()}`;
              const introId = `lea-intro-${Date.now()}`;
              const withCard = [
                ...chatHistoryRef.current,
                { id: cardId, role: 'word-card', word: data.word, meaning: data.meaning, example: data.example },
                { id: introId, role: 'lea', text: intro, narratorId },
              ];
              chatHistoryRef.current = withCard;
              setChatHistory(withCard);
              playNarratorLine({ id: narratorId, text: intro });
            } catch {}
            setParisianWordChallengeLoading(false);
          }}
            className={`relative inline-flex items-center px-4 py-1.5 font-display text-[15px] tracking-wide rounded-full transition-all duration-300 ${
              inputMode === 'discover'
                ? 'bg-wine text-ivory ring-2 ring-wine/30'
                : highlightDiscover
                  ? 'bg-wine text-ivory ring-[3px] ring-wine/45 shadow-md scale-[1.03]'
                  : 'bg-wine text-ivory hover:bg-wine2'
            }`}>
            Discover a Parisian word
          </button>
        </div>

        <div ref={writeBoxRef} className="relative bg-ivory/60 border border-line/70 overflow-hidden flex-1 flex flex-col min-h-0">
          {isExerciseTab ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Exercise subtab bar */}
              <div className="flex border-b border-line/50 shrink-0 overflow-x-auto">
                {[
                  { id: 'comprehension', label: 'Compréhension' },
                  { id: 'vocabulary',    label: 'Vocabulaire' },
                  { id: 'grammar',       label: 'Grammaire' },
                  { id: 'conjugation',   label: 'Conjugaison' },
                ].map((t) => (
                  <button key={t.id} type="button" onClick={() => setExerciseSubTab(t.id)}
                    className={`text-[9px] tracking-widest uppercase px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${exerciseSubTab === t.id ? 'border-wine text-wine' : 'border-transparent text-navy/35 hover:text-navy/60'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Exercise content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
                {/* COMPRÉHENSION */}
                {exerciseSubTab === 'comprehension' && (
                  exerciseQuestions.length === 0
                    ? <p className="text-[13px] text-navy/40 italic mt-4 text-center">{exerciseLoading ? 'Chargement des questions…' : "Pas de questions pour cet article."}</p>
                    : exerciseQuestions.map((q, qi) => (
                        <ComprehensionItem key={qi} q={q} qi={qi} firePointsDelta={firePointsDelta} narratorId={exerciseNarrator} />
                      ))
                )}
                {/* VOCABULAIRE */}
                {exerciseSubTab === 'vocabulary' && (
                  exerciseVocab.length === 0
                    ? <p className="text-[13px] text-navy/40 italic mt-4 text-center">{exerciseLoading ? 'Chargement du vocabulaire…' : "Pas de vocabulaire pour cet article."}</p>
                    : exerciseVocab.map((v, vi) => (
                        <VocabItem key={vi} v={v} vi={vi} firePointsDelta={firePointsDelta} narratorId={exerciseNarrator} />
                      ))
                )}
                {/* GRAMMAIRE */}
                {exerciseSubTab === 'grammar' && (
                  exerciseGrammar.length === 0
                    ? <p className="text-[13px] text-navy/40 italic mt-4 text-center">{exerciseLoading ? 'Chargement de la grammaire…' : "Pas d'exercice de grammaire pour cet article."}</p>
                    : exerciseGrammar.slice(0, 2).map((g, gi) => (
                        <div key={g.point || gi} className="border border-line/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[9px] font-mono tracking-widest uppercase text-wine/60 bg-wine/8 px-1.5 py-0.5">Grammaire</span>
                            <span className="font-display text-[14px] text-navy font-medium"><TranslatableText text={g.point} narratorId={exerciseNarrator} /></span>
                          </div>
                          {g.example && <blockquote className="border-l-2 border-navy/20 pl-2 mb-2"><p className="font-display text-[12px] italic text-navy/70">« <TranslatableText text={g.example} narratorId={exerciseNarrator} /> »</p></blockquote>}
                          <p className="text-[12px] text-navy/75 leading-snug mb-1"><TranslatableText text={g.explanation} narratorId={exerciseNarrator} /></p>
                          {g.tip && <p className="text-[11px] font-mono text-wine/70"><span className="text-[9px] uppercase tracking-widest mr-1">Tip:</span><TranslatableText text={g.tip} narratorId={exerciseNarrator} /></p>}
                          <GrammarRuleExercises rule={g} onCorrect={() => firePointsDelta(2)} />
                        </div>
                      ))
                )}
                {/* CONJUGAISON */}
                {exerciseSubTab === 'conjugation' && (
                  exerciseConjugation.length === 0
                    ? <p className="text-[13px] text-navy/40 italic mt-4 text-center">{exerciseLoading ? 'Chargement des conjugaisons…' : "Pas d'exercice de conjugaison pour cet article."}</p>
                    : (
                      <>
                        {exerciseConjugation.map((c, ci) => (
                          <ConjugationItem key={ci} c={c} ci={ci} firePointsDelta={firePointsDelta} narratorId={exerciseNarrator} />
                        ))}
                        {(() => {
                          const verbs = [...new Set(exerciseConjugation.map(c => c.verb).filter(Boolean))].slice(0, 2);
                          const tense = exerciseConjugation[0]?.tense || '';
                          const instr = verbs.length
                            ? `Écris ta propre phrase en conjuguant ${verbs.map(v => `« ${v} »`).join(' ou ')}${tense ? ` (par exemple au ${tense})` : ''}.`
                            : 'Écris ta propre phrase en utilisant un des verbes ci-dessus.';
                          const req = verbs.length
                            ? `${verbs.map(v => `le verbe « ${v} »`).join(' ou ')}${tense ? ` au ${tense}` : ''}`
                            : '';
                          return <ProductionExercise instruction={instr} requireGrammar={req} />;
                        })()}
                      </>
                    )
                )}
              </div>
            </div>
          ) : inputMode === 'discover' && activeTab !== 'writing' ? (
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
                              className={`group relative w-14 h-14 rounded-full overflow-hidden transition-all duration-200 ${narrator === n.id && wordPlaying ? 'ring-2 ring-wine shadow-md scale-110' : narrator === n.id ? 'ring-2 ring-wine/50 shadow-sm scale-105' : 'ring-1 ring-line/40 opacity-55 hover:opacity-90 hover:scale-105'}`}>
                              <img src={n.src} alt={n.label} className="w-full h-full object-cover object-top" />
                              {!(wordPlaying && narrator === n.id) && <PortraitHoverPlay />}
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
          ) : !isExerciseTab && activeTab !== 'practice' && inputMode === 'write' ? (
            <div className={`${transcriptHeight} flex flex-col relative`}>
              {activeTab === 'writing' && (writeReview.stage !== 'idle' || writeReviewHistory.length > 0) ? (
                <div ref={writeThreadScrollRef} className="flex flex-col h-full min-h-0 overflow-y-auto scroll-premium">
                  {writeReviewHistory.map((rv) => (
                    <WritingReviewThread
                      key={rv.id}
                      review={rv}
                      frozen
                      onReplay={(text, id) => playNarratorLine({ id, text })}
                      challengeContext={writingPrompt}
                    />
                  ))}
                  <WritingReviewThread
                    review={writeReview}
                    question={writeReviewQuestion}
                    onQuestionChange={setWriteReviewQuestion}
                    onCorriger={runWritingCorrection}
                    onSubmitQuestion={submitWritingQuestion}
                    onNewChallenge={resetWritingReview}
                    onRetry={retryWritingChallenge}
                    onReplay={(text, id) => playNarratorLine({ id, text })}
                    onScoreDelta={firePointsDelta}
                    challengeContext={writingPrompt}
                    onShowExample={fetchWritingExample}
                    example={writeReviewExample}
                    exampleLoading={writeReviewExampleLoading}
                  />
                  <div className="border-t border-line/40 px-4 py-2 shrink-0">
                    <textarea
                      ref={writeTextareaRef}
                      className="w-full bg-transparent resize-none outline-none font-display text-[16px] leading-snug text-navy placeholder:text-navy/30 scroll-premium"
                      placeholder="Réessaie ou continue à écrire…"
                      rows={2}
                      spellCheck={false}
                      value={writeText}
                      onChange={(e) => { setWriteText(e.target.value); setWriteEditing(true); setWriteCorrection(null); setNarratorReaction(null); setManualCorrection(null); }}
                    />
                  </div>
                </div>
              ) : showChatDiff ? (
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
                  className="flex-1 px-4 pt-3 pb-4 overflow-y-auto scroll-premium cursor-text flex flex-col gap-3"
                  onClick={() => { setWriteEditing(true); setTimeout(() => writeTextareaRef.current?.focus(), 0); }}
                >
                  {activeTab === 'writing' && (
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-wine/30 shrink-0 parisian-exp-bump">
                        <img
                          src={narratorReaction?.id === 'jules' ? '/assets/jules.png' : '/assets/lea.png'}
                          alt={narratorReaction?.id === 'jules' ? 'Jules' : 'Léa'}
                          className="w-full h-full object-cover object-top"
                        />
                      </div>
                      <p className="font-display text-[13px] italic text-navy/55 leading-snug">
                        {writeCorrection.corrected?.trim() === writeText.trim()
                          ? 'Parfait ! Très bon français. 🎉'
                          : 'Voici comment je l\'écrirais…'}
                      </p>
                    </div>
                  )}
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
                    <span key={`border-${writeHintKey}`} className="absolute top-3 left-3 right-3 bottom-3 rounded-lg border-2 border-wine/30 animate-pulse pointer-events-none" aria-hidden />
                  )}
                  {activeTab !== 'writing' && (
                    <div className="flex items-start gap-3 px-4 pt-4 pb-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => chatIntroLine && playNarratorLine({ id: 'lea', text: chatIntroLine.text })}
                        className="group relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-wine/25 shrink-0 hover:ring-wine/60 transition-all hover:scale-105"
                        aria-label="Replay Léa's intro"
                      >
                        <img src="/assets/lea.png" alt="Léa" className="w-full h-full object-cover object-top" />
                        <PortraitHoverPlay />
                        {wordPlaying && parisianSpeakingText === chatIntroLine?.text && (
                          <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40" />
                        )}
                      </button>
                      <p className="font-display text-[16px] italic text-navy/70 leading-snug pt-1">
                        {wordPlaying && chatIntroLine?.text && parisianSpeakingText === chatIntroLine.text.trim() && parisianTimings.length > 0
                          ? parisianTimings.map((w, i) => (
                              <span key={i} style={wordHighlightInlineStyle(isTimedWordActive(parisianTimings, i, parisianPlaybackTime))}>
                                {w.word}{' '}
                              </span>
                            ))
                          : (chatIntroLine?.text ?? 'Bonjour ! Ask me anything in French — I\'ll help you improve. 🗼')}
                      </p>
                    </div>
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
              {writeCorrecting && activeTab === 'writing' && (
                <div className="absolute bottom-3 left-4 flex items-center gap-2 pointer-events-none">
                  <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-wine/25 shrink-0">
                    <img
                      src={narratorReaction?.id === 'jules' ? '/assets/jules.png' : '/assets/lea.png'}
                      alt={narratorReaction?.id === 'jules' ? 'Jules' : 'Léa'}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <CorrectionLoading />
                </div>
              )}
              {writeCorrecting && activeTab !== 'writing' && (
                <div className="absolute bottom-2 right-3 pointer-events-none">
                  <CorrectionLoading />
                </div>
              )}
            </div>
          ) : !isExerciseTab && activeTab !== 'practice' ? (
          <div className={`${transcriptHeight} flex flex-col min-h-0 overflow-hidden`}>
          <div ref={scrollRef} className="scroll-premium flex-1 min-h-0 max-h-full px-3.5 pt-3 pb-6 overflow-y-auto overscroll-contain">
            {activeTab === 'transcript' ? (
              /* ── Chat conversation thread ── */
              <div className="flex flex-col gap-4">
                {chatHistory.map(msg => (
                  msg.role === 'word-card' ? (
                    <div key={msg.id} className="px-3 py-2 border-l-4 border-wine bg-wine/5" style={{ borderRadius: '0 4px 4px 0' }}>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display text-[17px] font-bold text-wine italic">« {msg.word} »</span>
                        <span className="text-[12px] text-navy/50">{msg.meaning}</span>
                        {parisianWordChallenge?.word === msg.word && (
                          <span className="ml-auto text-[10px] font-mono text-wine/50">{parisianChallengeAttempt}/3</span>
                        )}
                      </div>
                      <p className="text-[12px] text-navy/55 italic mt-0.5 leading-snug">« {msg.example} »</p>
                    </div>
                  ) : msg.role === 'lea' ? (
                    <div key={msg.id} className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => !msg.loading && msg.text && playNarratorLine({ id: msg.narratorId || 'lea', text: msg.text })}
                        className="group relative w-9 h-9 rounded-full overflow-hidden ring-2 ring-wine/25 shrink-0 hover:ring-wine/60 transition-all hover:scale-105 mt-0.5"
                        aria-label="Replay"
                      >
                        <img src={(msg.narratorId === 'jules') ? '/assets/jules.png' : '/assets/lea.png'} alt={(msg.narratorId === 'jules') ? 'Jules' : 'Léa'} className="w-full h-full object-cover object-top" />
                        <PortraitHoverPlay />
                        {wordPlaying && parisianSpeakingText === msg.text && (
                          <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40" />
                        )}
                      </button>
                      {msg.loading ? (
                        <div className="flex items-center gap-1.5 h-10 pl-1">
                          {[0, 150, 300].map(delay => (
                            <span key={delay} className="w-2 h-2 bg-navy/25 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                          ))}
                        </div>
                      ) : (
                        <p className="font-display text-[16px] italic text-navy/80 leading-snug max-w-[85%]">
                          {wordPlaying && parisianSpeakingText === msg.text?.trim() && parisianTimings.length > 0 ? (
                            parisianTimings.map((w, i) => (
                              <span key={i} style={wordHighlightInlineStyle(isTimedWordActive(parisianTimings, i, parisianPlaybackTime))}>
                                {w.word}{' '}
                              </span>
                            ))
                          ) : (
                            <TranslatableText text={msg.text} narratorId={msg.narratorId || 'lea'} />
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div key={msg.id} className="flex flex-col gap-1.5">
                      <TranscriptSentenceRow gutter={
                        <TranscriptAudioSlot
                          mode={msg.audioUrl ? 'play' : 'empty'}
                          isPlaying={chatPlayingId === msg.id}
                          onPlay={() => {
                            if (chatPlayingId === msg.id) {
                              chatAudioRef.current?.pause();
                              chatAudioRef.current = null;
                              setChatPlayingId(null);
                              setChatPlayingTime(null);
                            } else {
                              if (chatAudioRef.current) { chatAudioRef.current.pause(); chatAudioRef.current = null; }
                              const audio = new Audio(msg.audioUrl);
                              chatAudioRef.current = audio;
                              setChatPlayingId(msg.id);
                              setChatPlayingTime(0);
                              // rAF loop for smooth word highlighting
                              let rafId;
                              const tick = () => {
                                if (!audio.paused && !audio.ended) {
                                  setChatPlayingTime(audio.currentTime);
                                  rafId = requestAnimationFrame(tick);
                                }
                              };
                              audio.onplay = () => { rafId = requestAnimationFrame(tick); };
                              audio.onended = () => { cancelAnimationFrame(rafId); chatAudioRef.current = null; setChatPlayingId(null); setChatPlayingTime(null); };
                              audio.onpause = () => cancelAnimationFrame(rafId);
                              audio.play();
                            }
                          }}
                        />
                      }>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          {/* Original sentence — highlight during playback, underline mistakes at rest */}
                          <span className="font-display text-[16px] text-navy leading-snug">
                            {chatPlayingId === msg.id && msg.words?.length > 0
                              ? msg.words.map((w, i) => {
                                  const next = msg.words[i + 1];
                                  const offset = msg.wordOffset || 0;
                                  const wStart = w.start - offset;
                                  const wEnd = next ? (next.start - offset) : ((w.end ?? w.start) - offset + 0.1);
                                  const active = chatPlayingTime !== null && chatPlayingTime >= wStart && chatPlayingTime < wEnd;
                                  return (
                                    <span key={i} className={active ? 'text-wine font-semibold' : ''}>
                                      {w.word}{' '}
                                    </span>
                                  );
                                })
                              : msg.correction
                                ? wordDiff(msg.text, msg.correction).map((w, i) =>
                                    w.struck
                                      ? <span key={i} className="underline decoration-wine/50 underline-offset-2">{w.word} </span>
                                      : <React.Fragment key={i}>{w.word} </React.Fragment>
                                  )
                                : msg.text}
                          </span>
                          {msg.correction && (
                            <button
                              type="button"
                              onClick={() => setChatCorrectionPopup(
                                chatCorrectionPopup?.msgId === msg.id ? null :
                                { msgId: msg.id, original: msg.text, corrected: msg.correction }
                              )}
                              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-wine/70 border border-wine/30 rounded-full px-2 py-0.5 hover:bg-wine/10 hover:text-wine transition-colors"
                            >
                              Correct my sentence
                              <svg
                                width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden
                                className={`transition-transform duration-200 ${chatCorrectionPopup?.msgId === msg.id ? 'rotate-180' : ''}`}
                              >
                                <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                          {!msg.correction && msg.correctionOk && (
                            <span
                              className="shrink-0 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-green-600 text-white text-[11px] leading-none"
                              title="Ta phrase est correcte !"
                              aria-label="Sentence correct"
                            >✓</span>
                          )}
                        </div>
                      </TranscriptSentenceRow>
                      {/* Inline correction panel */}
                      {chatCorrectionPopup?.msgId === msg.id && (
                        <TranscriptSentenceRow gutter={<TranscriptAudioSlot mode="empty" />}>
                        <div className="inline-flex items-center gap-2.5 bg-paper border border-line/50 rounded-xl px-3 py-2.5 shadow-sm self-start">
                          <button
                            type="button"
                            onClick={() => playNarratorLine({ id: 'lea', text: msg.correction })}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-wine/15 hover:bg-wine/25 shrink-0 transition-colors"
                            aria-label="Écouter la correction"
                          >
                            <svg width="7" height="9" viewBox="0 0 7 9" fill="none" aria-hidden>
                              <path d="M1 1l5 3.5L1 8V1z" fill="#8B1E2D" opacity="0.8"/>
                            </svg>
                          </button>
                          <p className="font-display text-[15px] italic text-navy/80 leading-snug">{msg.correction}</p>
                        </div>
                        </TranscriptSentenceRow>
                      )}
                    </div>
                  )
                ))}
                {/* Live utterance while recording */}
                {isRecording && (settledText || partialTranscript) && (
                  <TranscriptSentenceRow gutter={<TranscriptAudioSlot mode="loading" />}>
                    <span className="font-display text-[16px] text-navy/50 italic leading-snug">
                      {settledText}{partialTranscript && (settledText ? ' ' : '')}{partialTranscript}
                    </span>
                  </TranscriptSentenceRow>
                )}
                {/* Discovering a Parisian word — inline below existing chat */}
                {parisianWordChallengeLoading && (
                  <div className="flex items-center gap-2 text-[12px] text-navy/40 font-display italic pl-1">
                    <div className="w-3 h-3 rounded-full border-2 border-wine/20 border-t-wine animate-spin" />
                    Discovering a Parisian word…
                  </div>
                )}
              </div>
            ) : hasContent ? (
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

                    const congrats = congratsByUtterance[utt.id];
                    const isCongratsLineSpeaking = wordPlaying && congrats && parisianSpeakingText === congrats.text?.trim();
                    const isLastUtt = utt === mainUtterances[mainUtterances.length - 1];
                    const showCorrBtn = isLastUtt && hasSpeakCorrection;
                    const repeatSucceeded = repeatFeedback === 'success';
                    // Défi: per-sentence correctness — blue tick if correct, else a
                    // "Correct my sentence" button that reveals the fix.
                    const defiCorr = correctionByUtterance[utt.id];
                    const defiNeedsFix = defiCorr && !defiCorr.correct && !!defiCorr.corrected;
                    return (
                      <React.Fragment key={utt.id}>
                        <TranscriptSentenceRow
                          gutter={(
                            <TranscriptAudioSlot
                              mode={utteranceSlotMode}
                              isPlaying={isPlayingThis}
                              onPlay={() => toggleUtterancePlayback(utt)}
                            />
                          )}
                        >
                          {wordSpans}
                          {congrats && (
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
                                +1 point parisien
                              </span>
                            </span>
                          )}
                          {showCorrBtn && (
                            <button
                              type="button"
                              onClick={() => setSpeakCorrectionOpen(o => !o)}
                              className="shrink-0 inline-flex items-center gap-1 ml-1.5 align-middle text-[11px] font-sans font-semibold text-wine/70 border border-wine/30 rounded-full px-2 py-0.5 hover:bg-wine/10 hover:text-wine transition-colors"
                            >
                              Correct my sentence
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className={`transition-transform duration-200 ${speakCorrectionOpen ? 'rotate-180' : ''}`}>
                                <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                          {/* Défi: correct → blue tick; wrong → "Correct my sentence" */}
                          {defiCorr && defiCorr.correct && (
                            <span className="inline-flex items-center ml-1.5 align-middle shrink-0" title="Parfait, c'est correct !">
                              <svg width="18" height="18" viewBox="0 0 48 48" fill="none" stroke="#1A2340" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                                <path d="M42 12L18 36l-12-12" />
                              </svg>
                            </span>
                          )}
                          {defiNeedsFix && (
                            <button
                              type="button"
                              onClick={() => setOpenCorrectionUttId(o => (o === utt.id ? null : utt.id))}
                              className="shrink-0 inline-flex items-center gap-1 ml-1.5 align-middle text-[11px] font-sans font-semibold text-wine/70 border border-wine/30 rounded-full px-2 py-0.5 hover:bg-wine/10 hover:text-wine transition-colors"
                            >
                              Correct my sentence
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className={`transition-transform duration-200 ${openCorrectionUttId === utt.id ? 'rotate-180' : ''}`}>
                                <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </TranscriptSentenceRow>
                        {defiNeedsFix && openCorrectionUttId === utt.id && (
                          <TranscriptSentenceRow gutter={<TranscriptAudioSlot mode="empty" />}>
                            <div className="inline-flex items-start gap-2.5 bg-paper border border-line/50 rounded-xl px-3 py-2.5 shadow-sm self-start">
                              <button
                                type="button"
                                onClick={() => playNarratorLine({ id: speakingNarratorId, text: defiCorr.corrected })}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-wine/15 hover:bg-wine/25 shrink-0 transition-colors mt-0.5"
                                aria-label="Écouter la correction"
                              >
                                <svg width="7" height="9" viewBox="0 0 7 9" fill="none" aria-hidden>
                                  <path d="M1 1l5 3.5L1 8V1z" fill="#8B1E2D" opacity="0.8"/>
                                </svg>
                              </button>
                              <div className="flex flex-col gap-1 min-w-0">
                                <p className="font-display text-[15px] italic text-wine/90 leading-snug">{defiCorr.corrected}</p>
                                {defiCorr.translation && (
                                  <p className="text-[12px] text-navy/45 italic leading-snug">{defiCorr.translation}</p>
                                )}
                              </div>
                            </div>
                          </TranscriptSentenceRow>
                        )}
                        {showCorrBtn && speakCorrectionOpen && (
                          <TranscriptSentenceRow gutter={<TranscriptAudioSlot mode="empty" />}>
                            <div className="inline-flex items-start gap-2.5 bg-paper border border-line/50 rounded-xl px-3 py-2.5 shadow-sm self-start">
                              <button
                                type="button"
                                onClick={replayCorrectionAudio}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-wine/15 hover:bg-wine/25 shrink-0 transition-colors mt-0.5"
                                aria-label="Écouter la correction"
                              >
                                <svg width="7" height="9" viewBox="0 0 7 9" fill="none" aria-hidden>
                                  <path d="M1 1l5 3.5L1 8V1z" fill="#8B1E2D" opacity="0.8"/>
                                </svg>
                              </button>
                              <div className="flex flex-col gap-2">
                                <p className="font-display text-[15px] italic text-navy/80 leading-snug">
                                  {manualCorrection.corrected}
                                </p>
                                <div className="flex items-center gap-2">
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
                                    className="text-[11px] font-mono uppercase tracking-wider px-3 py-1 rounded-full border border-wine bg-wine text-ivory hover:bg-wine2 transition-colors disabled:opacity-60"
                                  >
                                    {savingExpression ? '…' : 'Save'}
                                  </button>
                                  {!repeatSucceeded && (
                                    <button
                                      type="button"
                                      onClick={() => { setManualCorrection(null); setCorrectionReaderId(null); }}
                                      className="text-[11px] font-mono uppercase tracking-wider text-navy/45 hover:text-wine transition-colors"
                                    >
                                      Skip
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TranscriptSentenceRow>
                        )}
                        {congrats && (
                          <div className="mt-1.5 mb-1 flex items-center gap-2 min-w-0">
                            <NarratorPortrait
                              narratorId={congrats.id}
                              speaking={isCongratsLineSpeaking}
                              onReplay={() => playNarratorLine({ id: congrats.id, text: congrats.text })}
                              hideName
                              size="lg"
                            />
                            <NarratorHoverText
                              text={congrats.text}
                              translation={congrats.translation}
                              highlightSpeech={isCongratsLineSpeaking}
                              speechPlaybackTime={isCongratsLineSpeaking ? parisianPlaybackTime : null}
                              speechTimings={isCongratsLineSpeaking ? parisianTimings : []}
                              className="font-display text-[16px] italic text-navy leading-snug"
                              wrapperClassName="relative flex-1 min-w-0"
                              tooltipPosition="above"
                            />
                          </div>
                        )}
                        {/* Parisian's conversational reply, pinned under this utterance */}
                        {replyLoadingUttId === utt.id && (
                          <div className="mt-2 mb-1">
                            <NarratorAnswerLoading narratorId={speakingNarratorId} />
                          </div>
                        )}
                        {replyByUtterance[utt.id] && (
                          <div className="mt-1.5 mb-1 flex items-start gap-2.5 min-w-0">
                            <NarratorPortrait
                              narratorId={replyByUtterance[utt.id].id}
                              speaking={wordPlaying && parisianSpeakingText === replyByUtterance[utt.id].text?.trim()}
                              onReplay={() => playNarratorLine(replyByUtterance[utt.id])}
                              hideName
                              size="lg"
                            />
                            <NarratorHoverText
                              text={replyByUtterance[utt.id].text}
                              translation={replyByUtterance[utt.id].translation}
                              className="font-display text-[16px] italic text-navy leading-snug"
                              wrapperClassName="relative flex-1 min-w-0"
                              tooltipPosition="above"
                            />
                          </div>
                        )}
                      </React.Fragment>
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

                {/* Parisian thinking — inline below the recorded speech */}
                {manualCorrecting && (
                  <div className="mt-2">
                    <NarratorAnswerLoading narratorId={pendingNarratorId} />
                  </div>
                )}
                {/* Inline narrator reaction — auto-plays audio */}
                {narratorReaction && !manualCorrection && !manualCorrecting && (
                  <div className="mt-2">
                    <NarratorReactionPanel
                      reaction={narratorReaction}
                      onDone={() => setNarratorReaction(null)}
                    />
                  </div>
                )}

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
                  <p className="mt-2 font-display text-[13px] italic text-green-700">+1 point parisien</p>
                )}
                {repeatFeedback === 'fail' && !isRecording && (
                  <p className="mt-2 font-display text-[13px] italic text-wine/70">Not quite — try again.</p>
                )}

                {/* Défi réussi: the learner used every target — earn the level badge
                    (progress toward levelling up) and choose to do the next défi. */}
                {activeTab === 'speaking' && defiComplete && defiBadge && (
                  <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-navy/15 bg-navy/[0.04] px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <img
                        src={getLevelBadgeSrc(defiBadge.level)}
                        alt={`Badge ${defiBadge.level}`}
                        className="w-14 h-14 object-contain shrink-0 defi-badge-pop"
                      />
                      <div className="min-w-0">
                        <p className="font-display text-[16px] text-navy font-medium leading-snug">
                          {defiBadge.leveledUp
                            ? `Niveau atteint : ${defiBadge.level} !`
                            : 'Défi réussi !'}
                        </p>
                        <p className="text-[12px] text-navy/55 leading-snug">
                          {defiBadge.leveledUp
                            ? 'Nouveau badge débloqué — visible dans ta progression parisienne.'
                            : `+${DEFI_COMPLETE_XP} % vers ton prochain niveau (${defiBadge.level}).`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { resetTranscript(); onNewSpeakingChallenge?.(); }}
                      className="inline-flex items-center gap-1.5 font-display text-[15px] italic px-4 h-9 rounded-full bg-navy text-ivory hover:bg-navy2 shadow-sm transition-colors"
                    >
                      Prochain exercice
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M3 8h9M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                )}

                {/* Make it Parisien — inline below last utterance (not on Défi speaking: correction is automatic there) */}
                {inputMode === 'speak' && activeTab !== 'speaking' && !manualCorrection && !sentenceCongrats && !isLive && !narratorReaction && utterances.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => { setShowCorrectHint(false); correctNow(); }}
                      disabled={manualCorrecting}
                      className={`relative font-display text-[15px] italic px-4 h-9 rounded-full transition-all duration-200 whitespace-nowrap ${
                        'bg-wine text-ivory hover:bg-wine2 shadow-sm'
                      } disabled:opacity-60`}
                    >
                      Make it Parisien !
                      {showCorrectHint && !manualCorrecting && (
                        <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40 pointer-events-none" />
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (!isLive || !hadContentRef.current) && (
              isRecording ? (
                <p className="font-display text-[17px] leading-snug text-navy/30">
                  {source === 'tab' ? 'Listening to tab audio…' : source === 'system' ? 'Listening to system audio…' : 'Start speaking…'}
                </p>
              ) : status !== 'connecting' && activeTab !== 'speaking' && activeTab !== 'writing' ? (
                <div className="flex items-start gap-3 py-1">
                  <button
                    type="button"
                    onClick={() => chatIntroLine && playNarratorLine({ id: 'lea', text: chatIntroLine.text })}
                    className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-wine/25 shrink-0 hover:ring-wine/60 transition-all hover:scale-105"
                    aria-label="Replay Léa's intro"
                  >
                    <img src="/assets/lea.png" alt="Léa" className="w-full h-full object-cover object-top" />
                    {wordPlaying && parisianSpeakingText === chatIntroLine?.text && (
                      <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-40" />
                    )}
                  </button>
                  <p className="font-display text-[16px] italic text-navy/70 leading-snug pt-1">
                    {chatIntroLine?.text ?? 'Bonjour ! Ask me anything in French — I\'ll help you improve. 🗼'}
                  </p>
                </div>
              ) : null
            )}

          </div>
          </div>
          ) : null}

          {/* ── Progress tabs ─────────────────────────────────────────── */}
          {false && (activeTab === 'speaking' || activeTab === 'listening' || activeTab === 'reading' || activeTab === 'writing') && (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">

              {/* SPEAKING PROGRESS */}
              {activeTab === 'speaking' && (
                <div className="space-y-3">
                  <h3 className="text-[9px] font-mono tracking-widest uppercase text-navy/40">My Speaking Progress</h3>
                  {overallLevel ? (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-[28px] font-bold text-wine leading-none">{overallLevel}</span>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-navy/60 font-display">Detected level</span>
                          {overallStrength && <span className="text-[11px] text-green-600 font-display">✓ {overallStrength}</span>}
                          {overallWeakness && <span className="text-[11px] text-wine font-display">↗ {overallWeakness}</span>}
                        </div>
                      </div>
                      {Object.keys(skillProgress).length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-mono tracking-widest uppercase text-navy/35">Skills practiced</p>
                          {Object.entries(skillProgress).map(([skill, pct]) => (
                            <div key={skill} className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-navy/8 rounded-full overflow-hidden">
                                <div className="h-full bg-wine/60 rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-[10px] font-display text-navy/50 w-32 truncate">{skill}</span>
                              <span className="text-[9px] font-mono text-navy/35 tabular-nums w-6 text-right">{Math.min(pct,100)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6 space-y-2">
                      <p className="font-display text-[15px] text-navy/50 italic">No speaking session yet.</p>
                      <p className="text-[12px] text-navy/35">Press the mic button and start speaking French — Léa will assess your level.</p>
                    </div>
                  )}
                  <div className="pt-1 border-t border-line/40">
                    <p className="text-[9px] font-mono tracking-widest uppercase text-navy/35 mb-2">This session</p>
                    <div className="flex gap-4">
                      <div><p className="text-[18px] font-display font-bold text-navy leading-none">{utterances?.length ?? 0}</p><p className="text-[9px] text-navy/40 font-mono uppercase tracking-wider mt-0.5">sentences</p></div>
                      <div><p className="text-[18px] font-display font-bold text-wine leading-none">{dailyParisianPoints}</p><p className="text-[9px] text-navy/40 font-mono uppercase tracking-wider mt-0.5">points</p></div>
                    </div>
                  </div>
                </div>
              )}

              {/* LISTENING PROGRESS */}
              {activeTab === 'listening' && (
                <div className="space-y-3">
                  <h3 className="text-[9px] font-mono tracking-widest uppercase text-navy/40">My Listening Progress</h3>
                  {listeningQuestions.length > 0 ? (
                    <>
                      <div className="flex gap-4">
                        {(() => {
                          const answered = Object.keys(practiceAnsweredQ).length;
                          const correct  = Object.entries(practiceAnsweredQ).filter(([qi, ans]) => ans === listeningQuestions[+qi]?.answer).length;
                          return (
                            <>
                              <div><p className="text-[24px] font-display font-bold text-wine leading-none">{correct}/{answered}</p><p className="text-[9px] text-navy/40 font-mono uppercase tracking-wider mt-0.5">correct</p></div>
                              <div><p className="text-[24px] font-display font-bold text-navy leading-none">{listeningQuestions.length}</p><p className="text-[9px] text-navy/40 font-mono uppercase tracking-wider mt-0.5">questions</p></div>
                              <div><p className="text-[24px] font-display font-bold text-green-600 leading-none">{Object.keys(practiceVocabAnswers).filter(k => (practiceVocabAnswers[k]||'').trim().toLowerCase() === (listeningVocab[+k]?.word||'').toLowerCase()).length}</p><p className="text-[9px] text-navy/40 font-mono uppercase tracking-wider mt-0.5">vocab ✓</p></div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="space-y-1.5 pt-1 border-t border-line/40">
                        {listeningQuestions.map((q, qi) => {
                          const ans = practiceAnsweredQ[qi];
                          const correct = ans === q.answer;
                          return (
                            <div key={qi} className={`flex items-start gap-2 text-[12px] font-display ${ans ? (correct ? 'text-green-700' : 'text-wine') : 'text-navy/35'}`}>
                              <span className="shrink-0 mt-0.5">{ans ? (correct ? '✓' : '✗') : '○'}</span>
                              <span className="line-clamp-1">{q.question}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 space-y-2">
                      <p className="font-display text-[15px] text-navy/50 italic">No listening episode loaded yet.</p>
                      <p className="text-[12px] text-navy/35">Click "How to reach" → Listening to start a challenge.</p>
                    </div>
                  )}
                </div>
              )}

              {/* READING PROGRESS */}
              {activeTab === 'reading' && (
                <div className="space-y-3">
                  <h3 className="text-[9px] font-mono tracking-widest uppercase text-navy/40">My Reading Progress</h3>
                  {readingVocab.length > 0 ? (
                    <>
                      <div className="flex gap-4">
                        <div><p className="text-[24px] font-display font-bold text-wine leading-none">{readingVocab.length}</p><p className="text-[9px] text-navy/40 font-mono uppercase tracking-wider mt-0.5">words read</p></div>
                      </div>
                      <div className="space-y-1.5 pt-1 border-t border-line/40">
                        <p className="text-[9px] font-mono tracking-widest uppercase text-navy/35">Vocabulary from this article</p>
                        <div className="flex flex-wrap gap-1.5">
                          {readingVocab.slice(0, 12).map((v, i) => (
                            <span key={i} className="inline-block bg-navy/5 border border-navy/10 px-2 py-0.5 text-[11px] font-display text-navy/70 rounded">{typeof v === 'string' ? v : v.word}</span>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 space-y-2">
                      <p className="font-display text-[15px] text-navy/50 italic">No reading session yet.</p>
                      <p className="text-[12px] text-navy/35">Click "How to reach" → Reading to start an article.</p>
                    </div>
                  )}
                </div>
              )}

              {/* WRITING PROGRESS */}
              {activeTab === 'writing' && (
                <div className="space-y-3">
                  <h3 className="text-[9px] font-mono tracking-widest uppercase text-navy/40">My Writing Progress</h3>
                  <div className="text-center py-6 space-y-2">
                    <p className="font-display text-[15px] text-navy/50 italic">No writing session yet.</p>
                    <p className="text-[12px] text-navy/35">Switch to Write mode and start composing — Léa will correct you.</p>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Practice tab — subtabs: Comprehension / Vocabulary / Grammar + exercises */}
          {activeTab === 'practice' && (
            <div className="flex-1 min-h-0 flex flex-col border-t border-line/50">
              {/* Subtab bar */}
              <div className="flex gap-0 border-b border-line/40 shrink-0">
                {[
                  { id: 'comprehension', label: 'Comprehension' },
                  { id: 'vocabulary',    label: 'Vocabulary' },
                  { id: 'grammar',       label: 'Grammar' },
                  { id: 'exercises',     label: 'Exercises' },
                ].map((st) => (
                  <button key={st.id} type="button" onClick={() => setPracticeSubTab(st.id)}
                    className={`text-[9px] tracking-widest uppercase px-3 py-1.5 border-b-2 transition-colors whitespace-nowrap ${practiceSubTab === st.id ? 'border-wine text-wine' : 'border-transparent text-navy/35 hover:text-navy/60'}`}>
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Subtab content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">

                {/* COMPREHENSION subtab */}
                {practiceSubTab === 'comprehension' && (
                  listeningQuestions.length === 0
                    ? <p className="text-[13px] text-navy/40 italic">No questions available — load a listening episode first.</p>
                    : listeningQuestions.map((q, qi) => {
                        const answered = practiceAnsweredQ[qi];
                        return (
                          <div key={qi} className="space-y-2">
                            <p className="font-display text-[15px] leading-snug text-navy">{q.question}</p>
                            <div className="flex flex-col gap-1">
                              {(q.options || []).map((opt, oi) => {
                                const isSelected = answered === opt;
                                const isCorrect = opt === q.answer;
                                let cls = 'border border-line/60 text-navy/70 hover:border-wine/40 hover:text-navy transition-colors';
                                if (answered) {
                                  if (isCorrect) cls = 'border border-green-500 bg-green-50 text-green-700';
                                  else if (isSelected) cls = 'border border-wine/60 bg-wine/5 text-wine';
                                  else cls = 'border border-line/30 text-navy/30';
                                }
                                return (
                                  <button key={oi} type="button" disabled={!!answered}
                                    onClick={() => { setPracticeAnsweredQ((prev) => ({ ...prev, [qi]: opt })); firePointsDelta(isCorrect ? 3 : -1); }}
                                    className={`text-left px-3 py-1.5 text-[13px] font-display ${cls}`}>
                                    <span className="text-[10px] font-mono text-navy/30 mr-2">{String.fromCharCode(65 + oi)}.</span>
                                    {opt}
                                    {answered && isCorrect && <span className="ml-1.5 text-green-600 text-[11px]">✓</span>}
                                    {isSelected && !isCorrect && <span className="ml-1.5 text-wine text-[11px]">✗</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                )}

                {/* VOCABULARY subtab */}
                {practiceSubTab === 'vocabulary' && (
                  listeningVocab.length === 0
                    ? <p className="text-[13px] text-navy/40 italic">No vocabulary available — load a listening episode first.</p>
                    : listeningVocab.map((v, vi) => {
                        const userAns = practiceVocabAnswers[vi] ?? '';
                        const submitted = userAns !== '' && userAns !== '__editing__';
                        const correct = submitted && userAns.trim().toLowerCase() === v.word.toLowerCase();
                        return (
                          <div key={vi} className={`p-3 border ${correct ? 'border-green-400/50 bg-green-50/50' : submitted ? 'border-wine/30 bg-wine/5' : 'border-line/50'}`}>
                            <div className="flex items-start gap-2 mb-2">
                              <span className="text-[10px] font-mono text-navy/30 mt-0.5 shrink-0">{vi + 1}.</span>
                              <p className="font-display text-[14px] leading-snug text-navy flex-1">
                                {v.sentence?.replace('___', '______') || '___'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {submitted ? (
                                <span className={`font-display text-[14px] font-medium ${correct ? 'text-green-600' : 'text-wine'}`}>
                                  {userAns} {correct ? '✓' : `✗ → ${v.word}`}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={userAns === '__editing__' ? '' : userAns}
                                  onChange={(e) => setPracticeVocabAnswers((p) => ({ ...p, [vi]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && userAns.trim()) { const ans = userAns.trim(); const isC = ans.toLowerCase() === v.word.toLowerCase(); setPracticeVocabAnswers((p) => ({ ...p, [vi]: ans })); firePointsDelta(isC ? 2 : -1); } }}
                                  placeholder="Votre réponse…"
                                  className="flex-1 border border-navy/20 px-2 py-1 text-[13px] font-display text-navy focus:outline-none focus:border-wine/50 bg-transparent"
                                />
                              )}
                              {!submitted && userAns.trim() && (
                                <button type="button" onClick={() => { const ans = userAns.trim(); const isC = ans.toLowerCase() === v.word.toLowerCase(); setPracticeVocabAnswers((p) => ({ ...p, [vi]: ans })); firePointsDelta(isC ? 2 : -1); }}
                                  className="px-2 py-1 text-[11px] font-mono bg-wine text-ivory hover:bg-wine/80 transition-colors">
                                  OK
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-navy/45 mt-1 italic">{v.definition}</p>
                          </div>
                        );
                      })
                )}

                {/* GRAMMAR subtab */}
                {practiceSubTab === 'grammar' && (
                  listeningGrammar.length === 0
                    ? <p className="text-[13px] text-navy/40 italic">No grammar points available — load a listening episode first.</p>
                    : listeningGrammar.slice(0, 2).map((g, gi) => (
                        <div key={gi} className="border border-line/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[9px] font-mono tracking-widest uppercase text-wine/60 bg-wine/8 px-1.5 py-0.5">Grammaire</span>
                            <span className="font-display text-[15px] text-navy font-medium">{g.point}</span>
                          </div>
                          {g.example && (
                            <blockquote className="border-l-2 border-navy/20 pl-2 mb-2">
                              <p className="font-display text-[13px] italic text-navy/70 leading-snug">« {g.example} »</p>
                            </blockquote>
                          )}
                          <p className="text-[13px] text-navy/75 leading-snug mb-1">{g.explanation}</p>
                          {g.tip && (
                            <p className="text-[12px] font-mono text-wine/70">
                              <span className="text-[9px] uppercase tracking-widest mr-1">Tip:</span>{g.tip}
                            </p>
                          )}
                        </div>
                      ))
                )}

                {/* EXERCISES subtab */}
                {practiceSubTab === 'exercises' && (
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

              </div>
            </div>
          )}

          {/* Word discovery panel — inside the speech box */}

        </div>
      </div>


      {/* Level assessment panel — also outside speech box */}
      {(assessingLevel || overallLevel) && (
        <div className={fullscreen ? undefined : 'absolute left-0 right-0 bottom-[64px] z-10 overflow-y-auto'}>
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
        </div>
      )}

      {/* Combined row: tabs (left) + controls (right) */}
      <div className="flex items-start shrink-0">
        {/* Left column: tabs + correction UI */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="ml-3 sm:ml-7 flex overflow-x-auto border-t border-line/50">
            {[
              { id: 'transcript', label: 'Chat' },
              { id: 'listening',  label: 'Listening' },
              { id: 'reading',    label: 'Reading' },
              { id: 'speaking',   label: 'Speaking' },
              { id: 'writing',    label: 'Writing' },
            ].map((t) => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                className={`text-[11px] px-3 tracking-wide uppercase py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 ${activeTab === t.id ? 'border-wine text-wine' : 'border-transparent text-navy/70 hover:text-navy'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Parisian reaction + correction now render inline in the transcript
              above (no separate bottom bar). */}
        </div>{/* end left column */}
        {/* Right controls */}
        {inputMode === 'write' ? (
          <div className="shrink-0 flex items-center gap-2 pr-3 py-1">
            {writeText.trim().length > 0 && (
              <button type="button" onClick={resetTranscript}
                className="relative w-11 h-11 rounded-full border border-navy/20 text-navy/50 hover:border-wine/40 hover:text-wine/70 inline-flex items-center justify-center transition-colors shrink-0"
                aria-label="Reset">
                <span className="text-[9px] tracking-widest uppercase leading-none">Reset</span>
              </button>
            )}
            {/* Parisian Points */}
            <PointsBurst points={dailyParisianPoints} className="mr-1">
              <div className="relative flex items-center justify-center w-11 h-11 rounded-full bg-wine/[0.06] border-2 border-wine/20 select-none">
                <div className="flex flex-col items-center gap-[3px] -mt-1.5">
                  <span className="font-display text-[19px] font-bold text-wine leading-none tabular-nums">
                    {dailyParisianPoints}
                  </span>
                  <span className="text-[6.5px] font-mono tracking-wide uppercase text-wine/60 leading-tight">points</span>
                </div>
                {pointsDelta && (
                  <span key={pointsDelta.id} className="absolute -top-4 left-1/2 -translate-x-1/2 font-display font-bold text-[13px] whitespace-nowrap pointer-events-none"
                    style={{ color: pointsDelta.value > 0 ? '#16a34a' : '#8B1E2D', animation: 'parisianDeltaFloat 1.4s ease-out forwards' }}>
                    {pointsDelta.value > 0 ? `+${pointsDelta.value}` : pointsDelta.value}
                  </span>
                )}
              </div>
            </PointsBurst>
            {/* Submit button — same size as mic */}
            <button type="button" onClick={finishWriteInput}
              disabled={!writeText.trim() || isDuplicateSubmit(writeText.trim())}
              className="relative w-11 h-11 rounded-full bg-wine hover:bg-wine2 disabled:opacity-40 disabled:cursor-default inline-flex items-center justify-center transition-all hover:scale-105"
              aria-label="Submit writing">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6.5l2.5 2.5L10 3" stroke="#F6F1E8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : inputMode === 'speak' ? (
          <div className="shrink-0 pr-3 py-1">
            {speakActionControls}
          </div>
        ) : null}
      </div>{/* end combined row */}

      {(error || tabCaptureError) && (
        <p className="px-7 pb-2 text-[12px] text-wine">{error || tabCaptureError}</p>
      )}

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

function VocabExercise({ vocab, onGoodAnswer }) {
  const [answers, setAnswers] = React.useState({});
  const [revealed, setRevealed] = React.useState({});
  const [activeBlank, setActiveBlank] = React.useState(null); // index of focused blank
  const inputRefs = React.useRef({});
  const rewardedRef = React.useRef({});

  React.useEffect(() => {
    rewardedRef.current = {};
    setAnswers({});
    setRevealed({});
    setActiveBlank(null);
  }, [vocab]);

  if (!vocab || vocab.length === 0) {
    return <p className="text-[13px] text-navy/40 italic">Vocabulary exercise not available for this article.</p>;
  }

  const rewardIfCorrect = (idx, answer, expected) => {
    const isCorrect = String(answer || '').trim().toLowerCase() === expected.trim().toLowerCase();
    if (isCorrect && !rewardedRef.current[idx]) {
      rewardedRef.current[idx] = true;
      onGoodAnswer?.();
    }
    return isCorrect;
  };

  const check = (idx) => {
    const expected = vocab[idx]?.word || '';
    rewardIfCorrect(idx, answers[idx], expected);
    setRevealed((r) => ({ ...r, [idx]: true }));
    setActiveBlank(null);
  };

  const fillWord = (word) => {
    if (activeBlank === null) return;
    const idx = activeBlank;
    const expected = vocab[idx]?.word || '';
    setAnswers((a) => ({ ...a, [idx]: word }));
    rewardIfCorrect(idx, word, expected);
    setRevealed((r) => ({ ...r, [idx]: true }));
    setActiveBlank(null);
  };

  const allDone = vocab.every((_, i) => revealed[i]);

  return (
    <div className="flex flex-col gap-4">
      {/* Word bank */}
      <div className="flex flex-wrap gap-2">
        {vocab.map((v) => {
          const usedIdx = Object.entries(answers).find(([, val]) => val === v.word)?.[0];
          const isUsed = usedIdx !== undefined && revealed[Number(usedIdx)];
          const isClickable = activeBlank !== null && !isUsed;
          return (
            <div key={v.word} className="group relative">
              <button
                type="button"
                onClick={() => isClickable && fillWord(v.word)}
                className={`px-2.5 py-1 border font-display text-[13px] rounded-sm transition-all ${
                  isUsed
                    ? 'border-wine/15 bg-transparent text-wine/30 cursor-default'
                    : isClickable
                      ? 'border-wine bg-wine text-ivory cursor-pointer scale-105 shadow-sm'
                      : 'border-wine/30 bg-wine/5 text-wine cursor-default'
                }`}
              >
                {v.word}
              </button>
              <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-navy text-ivory text-[10px] font-mono rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {v.definition}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] font-mono tracking-widest uppercase text-wine/50 -mt-2 transition-opacity duration-150" style={{ opacity: activeBlank !== null ? 1 : 0, pointerEvents: 'none' }}>
        ↑ click a word above
      </p>

      <div className="border-t border-line/40" />

      {/* Sentences */}
      <div className="flex flex-col gap-3">
        {vocab.map((v, i) => {
          const parts = v.sentence.split('___');
          const ans = answers[i] || '';
          const isCorrect = ans.trim().toLowerCase() === v.word.toLowerCase();
          const isRevealed = revealed[i];
          const isFocused = activeBlank === i;
          return (
            <div key={i} className="flex flex-col gap-1">
              <p className="font-display text-[14px] text-navy/80 leading-snug">
                {parts[0]}
                {isRevealed ? (
                  <span className="inline-block px-1.5 py-0.5 rounded text-[13px] font-semibold mx-0.5 bg-wine/10 text-wine">{ans || '—'}</span>
                ) : (
                  <input
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    value={ans}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && ans.trim() && check(i)}
                    onFocus={() => setActiveBlank(i)}
                    onBlur={() => { if (activeBlank === i) setTimeout(() => setActiveBlank(null), 150); }}
                    placeholder=""
                    className={`inline-block w-[110px] border-b-2 bg-transparent text-navy text-center outline-none px-1 font-display text-[14px] mx-0.5 transition-colors ${isFocused ? 'border-wine' : 'border-wine/30'}`}
                    autoComplete="off"
                  />
                )}
                {parts[1]}
              </p>
              {isRevealed && !isCorrect && (
                <p className="text-[11px] text-navy/40">→ <span className="font-semibold text-navy/70">{v.word}</span></p>
              )}
              {!isRevealed && ans.trim() && (
                <button type="button" onClick={() => check(i)}
                  className="self-start px-3 py-0.5 rounded-full bg-wine text-ivory text-[10px] font-display hover:bg-wine/85 transition-colors">
                  Check
                </button>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <p className="text-[11px] tracking-widest uppercase text-green-600 border-t border-line/40 pt-2">
          {vocab.filter((v, i) => (answers[i] || '').trim().toLowerCase() === v.word.toLowerCase()).length}/{vocab.length} correct
        </p>
      )}
    </div>
  );
}


const HINT_COST = 1; // Parisianism points per extra batch of translations

// Reusable striking burst: wrap any round points chip. On a points change the
// wrapped element bounces/glows and rings + sparks radiate outward.
function PointsBurst({ points, className = '', children }) {
  const prevRef = React.useRef(points);
  const increased = points > prevRef.current;
  const decreased = points < prevRef.current;
  const [burst, setBurst] = React.useState({ key: 0, up: true });
  React.useEffect(() => {
    if (points !== prevRef.current) setBurst((b) => ({ key: b.key + 1, up: points > prevRef.current }));
    prevRef.current = points;
  }, [points]);
  const accent = increased ? '#16a34a' : '#8B1E2D';
  const accentRgb = increased ? '22,163,74' : '139,30,45';

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence>
        {burst.key > 0 && (
          <React.Fragment key={burst.key}>
            <motion.span className="absolute inset-0 rounded-full pointer-events-none"
              style={{ border: `2px solid rgba(${accentRgb},0.9)` }}
              initial={{ scale: 0.8, opacity: 0.9 }} animate={{ scale: 2.3, opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }} />
            <motion.span className="absolute inset-0 rounded-full pointer-events-none"
              style={{ border: `1.5px solid rgba(${accentRgb},0.6)` }}
              initial={{ scale: 0.8, opacity: 0.7 }} animate={{ scale: 3.1, opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut', delay: 0.08 }} />
            {burst.up && [0, 60, 120, 180, 240, 300].map((deg) => (
              <motion.span key={deg} className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full pointer-events-none"
                style={{ backgroundColor: accent }}
                initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1 }}
                animate={{ x: `calc(-50% + ${Math.cos((deg * Math.PI) / 180) * 26}px)`, y: `calc(-50% + ${Math.sin((deg * Math.PI) / 180) * 26}px)`, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.6, ease: 'easeOut' }} />
            ))}
          </React.Fragment>
        )}
      </AnimatePresence>
      <motion.div
        key={`burst-${burst.key}`}
        animate={increased
          ? { scale: [1, 1.45, 0.9, 1.1, 1], rotate: [0, -8, 8, 0], boxShadow: ['0 0 0 0 rgba(22,163,74,0)', '0 0 22px 4px rgba(22,163,74,0.55)', '0 0 0 0 rgba(22,163,74,0)'] }
          : decreased
            ? { x: [0, -5, 5, -4, 4, 0], boxShadow: ['0 0 0 0 rgba(139,30,45,0)', '0 0 16px 3px rgba(139,30,45,0.5)', '0 0 0 0 rgba(139,30,45,0)'] }
            : { scale: 1 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        className="rounded-full"
      >
        {children}
      </motion.div>
    </div>
  );
}

function DailyParisianPointsIndicator({ points, hideLabel = false }) {
  const prevRef = React.useRef(points);
  const increased = points > prevRef.current;
  const decreased = points < prevRef.current;
  const [burst, setBurst] = React.useState({ key: 0, up: true });
  React.useEffect(() => {
    if (points !== prevRef.current) setBurst((b) => ({ key: b.key + 1, up: points > prevRef.current }));
    prevRef.current = points;
  }, [points]);

  const circleSize = hideLabel ? 'w-12 h-12' : 'w-14 h-14';
  const numSize = hideLabel ? 'text-[17px]' : 'text-[18px]';
  const accent = increased ? '#16a34a' : decreased ? '#8B1E2D' : '#8B1E2D';
  const accentRgb = increased ? '22,163,74' : '139,30,45';

  return (
    <div className="flex items-center gap-2 shrink-0" aria-live="polite">
      <div className="relative shrink-0">
        {/* Burst rings + sparks radiating out on any change */}
        <AnimatePresence>
          {burst.key > 0 && (
            <React.Fragment key={burst.key}>
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ border: `2px solid rgba(${accentRgb},0.9)` }}
                initial={{ scale: 0.8, opacity: 0.9 }}
                animate={{ scale: 2.3, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ border: `1.5px solid rgba(${accentRgb},0.6)` }}
                initial={{ scale: 0.8, opacity: 0.7 }}
                animate={{ scale: 3.1, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: 'easeOut', delay: 0.08 }}
              />
              {burst.up && [0, 60, 120, 180, 240, 300].map((deg) => (
                <motion.span
                  key={deg}
                  className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full pointer-events-none"
                  style={{ backgroundColor: accent }}
                  initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1 }}
                  animate={{
                    x: `calc(-50% + ${Math.cos((deg * Math.PI) / 180) * 26}px)`,
                    y: `calc(-50% + ${Math.sin((deg * Math.PI) / 180) * 26}px)`,
                    opacity: 0, scale: 0.4,
                  }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              ))}
            </React.Fragment>
          )}
        </AnimatePresence>

        <motion.div
          key={`disc-${burst.key}`}
          animate={increased
            ? { scale: [1, 1.45, 0.9, 1.1, 1], rotate: [0, -8, 8, 0],
                boxShadow: ['0 0 0 0 rgba(22,163,74,0)', '0 0 22px 4px rgba(22,163,74,0.55)', '0 0 0 0 rgba(22,163,74,0)'],
                backgroundColor: ['rgba(139,30,45,0.10)', 'rgba(22,163,74,0.22)', 'rgba(139,30,45,0.10)'] }
            : decreased
              ? { x: [0, -5, 5, -4, 4, 0], boxShadow: ['0 0 0 0 rgba(139,30,45,0)', '0 0 16px 3px rgba(139,30,45,0.5)', '0 0 0 0 rgba(139,30,45,0)'] }
              : { scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className={`relative ${circleSize} rounded-full border border-wine/30 bg-wine/10 flex flex-col items-center justify-center ${hideLabel ? '' : 'overflow-hidden'}`}
        >
          {hideLabel ? (
            <>
              <motion.span key={points}
                initial={{ scale: 1.4, color: accent }}
                animate={{ scale: 1, color: ['#16a34a', '#16a34a', '#8B1E2D'] }}
                transition={{ duration: 0.5 }}
                className={`font-stat ${numSize} font-bold tabular-nums leading-none text-wine`}
              >
                {points}
              </motion.span>
              <span className="text-[7px] font-mono tracking-wide uppercase text-wine/55 leading-none mt-0.5">points</span>
            </>
          ) : (
            /* Flip-board: old number slides up & out, new drops in, flashing the accent colour */
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={points}
                initial={{ y: '-120%', opacity: 0, scale: 1.4 }}
                animate={{ y: '0%', opacity: 1, scale: 1, color: [accent, accent, '#8B1E2D'] }}
                exit={{ y: '120%', opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], color: { duration: 0.9 } }}
                className={`absolute font-stat ${numSize} font-bold tabular-nums leading-none`}
              >
                {points}
              </motion.span>
            </AnimatePresence>
          )}
        </motion.div>
      </div>
      {!hideLabel && (
        <span className="text-[9px] font-mono tracking-[0.08em] uppercase text-navy/45 leading-tight w-[3.25rem]">
          My Parisian Points
        </span>
      )}
    </div>
  );
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Title-case each word in an English translation (e.g. "relating to media" → "Relating To Media"). */
function formatTranslationWords(text) {
  return String(text || '')
    .trim()
    .split(/(\s+)/)
    .map((part) => {
      if (!/\S/.test(part)) return part;
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

function buildPassageSegments(passage, vocabEntries) {
  if (!passage) return [];
  if (!vocabEntries.length) return [{ type: 'text', value: passage }];

  const sorted = [...vocabEntries].sort((a, b) => b.word.length - a.word.length);
  const pattern = sorted.map((v) => escapeRegex(v.word)).join('|');
  const re = new RegExp(`(${pattern})`, 'giu');
  const defByLower = new Map(sorted.map((v) => [v.word.toLowerCase(), v]));

  return passage.split(re).filter((part) => part.length > 0).map((part) => {
    const entry = defByLower.get(part.toLowerCase());
    if (entry) return { type: 'vocab', value: part, entry };
    return { type: 'text', value: part };
  });
}

function VocabWordHighlight({ word, definition }) {
  const anchorRef = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });

  const updatePosition = React.useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPos({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const showTooltip = () => {
    updatePosition();
    setHovered(true);
  };

  const hideTooltip = () => setHovered(false);
  const toggleTooltip = () => { if (hovered) { setHovered(false); } else { updatePosition(); setHovered(true); } };

  React.useEffect(() => {
    if (!hovered) return undefined;
    const onScroll = () => updatePosition();
    const onDocClick = (e) => { if (anchorRef.current && !anchorRef.current.contains(e.target)) setHovered(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mousedown', onDocClick, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDocClick, true);
    };
  }, [hovered, updatePosition]);

  const tooltip = hovered ? createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[250] min-w-[11.5rem] max-w-[16rem] rounded-md border border-navy/10 bg-navy px-3 py-2.5 text-left text-[12px] leading-snug text-ivory shadow-[0_10px_32px_rgba(26,35,64,0.35)]"
      style={{
        top: tooltipPos.top,
        left: tooltipPos.left,
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      {formatTranslationWords(definition)}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <span
        ref={anchorRef}
        role="button"
        tabIndex={0}
        className="relative inline cursor-pointer"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onClick={(e) => { e.stopPropagation(); toggleTooltip(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTooltip(); } }}
      >
        <mark className="bg-wine/15 text-navy/80 rounded-sm px-0.5 underline decoration-dotted decoration-wine/40 underline-offset-2">
          {word}
        </mark>
      </span>
      {tooltip}
    </>
  );
}

function PassageWithVocabHighlights({ passage, vocabEntries, highlightActive, className }) {
  // Split into paragraphs on blank lines or numbered lines (e.g. "1. ...")
  const paragraphs = React.useMemo(() => {
    return (passage || '')
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);
  }, [passage]);

  const paraClass = className || "font-display text-[15px] sm:text-[16px] leading-[1.75] text-navy/80";

  return (
    <div className="space-y-4">
      {paragraphs.map((para, pi) => {
        const segments = highlightActive
          ? buildPassageSegments(para, vocabEntries)
          : [{ type: 'text', value: para }];
        return (
          <p key={pi} className={paraClass}>
            {segments.map((seg, i) => {
              if (seg.type === 'text') return <React.Fragment key={i}>{seg.value}</React.Fragment>;
              return <VocabWordHighlight key={i} word={seg.value} definition={seg.entry.definition} />;
            })}
          </p>
        );
      })}
    </div>
  );
}

const TITLE_SIZES = [26, 22, 19, 18];

function AutoFitTitle({ title }) {
  const ref = React.useRef(null);
  const [sizeIdx, setSizeIdx] = React.useState(0);

  React.useLayoutEffect(() => {
    setSizeIdx(0);
  }, [title]);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || TITLE_SIZES[sizeIdx] * 1.3;
    const fits = el.scrollHeight <= lineHeight * 2 + 2;
    if (!fits && sizeIdx < TITLE_SIZES.length - 1) {
      setSizeIdx(i => i + 1);
    }
  });

  return (
    <h2
      ref={ref}
      className="font-display leading-[1.3] tracking-[-0.01em] text-navy"
      style={{ fontSize: TITLE_SIZES[sizeIdx], overflow: 'hidden' }}
    >
      {title}
    </h2>
  );
}

function ReadingArticlePanel({
  loading,
  title,
  passage,
  source,
  author,
  date,
  vocab = [],
  parisianPercent = 0,
  dailyParisianPoints = 0,
  onSpendExperience,
}) {
  const [revealedBatchCount, setRevealedBatchCount] = React.useState(0);
  const [translateActive, setTranslateActive] = React.useState(false);

  React.useEffect(() => {
    setRevealedBatchCount(0);
    setTranslateActive(false);
  }, [passage]);

  const hintBatches = React.useMemo(() => {
    const batches = [];
    for (let i = 0; i < vocab.length; i += 2) batches.push(vocab.slice(i, i + 2));
    return batches;
  }, [vocab]);

  const revealedWords = React.useMemo(
    () => hintBatches.slice(0, revealedBatchCount).flat(),
    [hintBatches, revealedBatchCount],
  );

  const hasMoreHints = revealedBatchCount < hintBatches.length;
  const canAffordHint = parisianPercent >= HINT_COST;

  const handleTranslateClick = () => {
    if (translateActive) {
      setTranslateActive(false);
      return;
    }
    if (revealedBatchCount === 0) {
      setRevealedBatchCount(1);
    }
    setTranslateActive(true);
  };

  const revealMoreWords = () => {
    if (!hasMoreHints) return;
    if (revealedBatchCount > 0 && !canAffordHint) return;
    if (revealedBatchCount > 0) onSpendExperience?.(HINT_COST);
    setRevealedBatchCount((c) => Math.min(c + 1, hintBatches.length));
    setTranslateActive(true);
  };

  const fmtArticleDate = (d) => {
    if (!d) return '';
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  // Just the newspaper name + a clean date — no author, no raw timestamp.
  const byline = [source, fmtArticleDate(date)].filter(Boolean).join(' — ');

  return (
    <div className="flex flex-col" style={{ height: 520 }}>
      {loading ? (
        <div className="flex items-center gap-3 mt-auto mb-auto">
          <div className="w-4 h-4 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
          <span className="text-[14px] text-navy/40 font-display italic">Searching for an article…</span>
        </div>
      ) : (
        <>
          {/* Title — auto-shrinks to fit 2 lines, never truncated */}
          {title && (
            <div className="mb-5 shrink-0 mr-3 px-4 py-3 border-l-4 border-navy bg-navy/5" style={{ borderRadius: '0 4px 4px 0' }}>
              <AutoFitTitle title={title} />
            </div>
          )}

          {/* Full article text — scrolls internally, fills remaining space */}
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pl-4 pr-3">
            <PassageWithVocabHighlights
              passage={passage}
              vocabEntries={revealedWords}
              highlightActive={translateActive && revealedWords.length > 0}
            />
          </div>

          {/* Byline, daily points circle, translate */}
          <div className="mt-4 shrink-0 border-t pt-3 pl-4 pr-3" style={{ borderColor: 'rgba(139,30,45,0.2)' }}>
            {byline ? (
              <p className="text-[10px] font-mono tracking-[0.12em] mb-3 truncate" style={{ color: '#8b1e2d' }}>
                {byline}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2 relative">
              <DailyParisianPointsIndicator points={dailyParisianPoints} hideLabel />

              {/* Hint + arrow, in between the points circle and the button */}
              {vocab.length > 0 && !translateActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-1 min-w-0 px-0.5 pointer-events-none leading-[1.15]"
                >
                  <span className="font-display text-[10.5px] italic text-wine/70">Use my Parisian points to translate</span>
                  <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden className="shrink-0">
                    <path d="M1 5 H15 M11 1.5 L15 5 L11 8.5" stroke="#8B1E2D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
                  </svg>
                </motion.div>
              )}

            <div className="flex items-center gap-3 shrink-0">
              {vocab.length > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={handleTranslateClick}
                    className={`inline-flex items-center rounded-full bg-wine hover:bg-wine2 text-ivory px-4 py-2 text-[13px] font-medium font-display transition-colors duration-200 whitespace-nowrap ${translateActive ? 'ring-2 ring-wine/30 ring-offset-2 ring-offset-paper' : ''}`}
                    aria-label="Translate hard words"
                    aria-pressed={translateActive}
                  >
                    Translate hard words
                  </button>
                  {translateActive && hasMoreHints && revealedBatchCount > 0 && (
                    <button
                      type="button"
                      onClick={revealMoreWords}
                      disabled={!canAffordHint}
                      className={`text-[9px] font-mono tracking-widest uppercase transition-colors ${canAffordHint ? 'text-wine/70 hover:text-wine' : 'text-navy/25 cursor-not-allowed'}`}
                    >
                      {canAffordHint ? `+ more words — ${HINT_COST} pts` : `need ${HINT_COST} Parisianism`}
                    </button>
                  )}
                </div>
              )}

            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const WORDS_PER_PAGE = 120;

// Count French syllables for a word — vowel groups + punctuation pause weight
function frSyllables(word) {
  const clean = word.replace(/[^a-zA-ZàâäéèêëîïôùûüÿœæçÀÂÄÉÈÊËÎÏÔÙÛÜŸŒÆÇ]/g, '');
  if (!clean) return 0.3; // punctuation-only token → tiny pause
  const vowels = clean.match(/[aeiouyàâäéèêëîïôùûüÿœæ]/gi) || [];
  const syl = Math.max(1, vowels.length);
  // Add a small pause weight for sentence-ending punctuation
  const hasPause = /[.!?;]/.test(word);
  return syl + (hasPause ? 1.2 : 0);
}

function AudioSyncedTranscript({ text, currentTime, duration, allWordWeights, wordTimings, onWordClick, className, vocabEntries = [], highlightActive = false }) {
  const words = React.useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const activeRef = React.useRef(null);

  // Revealed vocab lookup — single words match directly; multi-word entries
  // match on their first word so the tooltip still lands somewhere sensible.
  const vocabByWord = React.useMemo(() => {
    const m = new Map();
    for (const v of vocabEntries) {
      const key = String(v.word || '').toLowerCase().split(/\s+/)[0];
      if (key) m.set(key, v);
    }
    return m;
  }, [vocabEntries]);

  const currentWordIdx = React.useMemo(() => {
    // --- Real Deepgram timestamps path ---
    if (wordTimings && wordTimings.length > 0) {
      for (let i = 0; i < words.length; i++) {
        const t = wordTimings[i];
        if (!t) continue;
        if (currentTime >= t.start && currentTime < t.end + 0.05) return i;
      }
      return -1;
    }

    // --- Syllable-weight fallback ---
    if (!duration || !allWordWeights || allWordWeights.length === 0) return -1;
    const totalWeight = allWordWeights.reduce((s, w) => s + w, 0);
    if (!totalWeight) return -1;

    let elapsed = 0;
    for (let i = 0; i < words.length; i++) {
      const wDur = (allWordWeights[i] / totalWeight) * duration;
      if (currentTime < elapsed + wDur) return i;
      elapsed += wDur;
    }
    return words.length - 1;
  }, [currentTime, duration, words, allWordWeights, wordTimings]);

  // Auto-scroll highlighted word into view
  React.useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentWordIdx]);

  return (
    <p className={className}>
      {words.map((word, i) => {
        const clean = word.replace(/[^\p{L}'’-]/gu, '').toLowerCase();
        const vocabEntry = highlightActive ? vocabByWord.get(clean) : null;
        if (vocabEntry) {
          return (
            <React.Fragment key={i}>
              <VocabWordHighlight word={word} definition={vocabEntry.definition} />{' '}
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={i}>
            <span
              ref={i === currentWordIdx ? activeRef : null}
              onClick={() => onWordClick?.(i)}
              className={`cursor-pointer rounded transition-colors duration-75 ${
                i === currentWordIdx
                  ? 'bg-wine/20 text-wine'
                  : 'hover:bg-navy/8'
              }`}
            >{word}</span>{' '}
          </React.Fragment>
        );
      })}
    </p>
  );
}

const CEFR_BADGE = {
  A1: { bg: '#16a34a', label: 'A1' },
  A2: { bg: '#0d9488', label: 'A2' },
  B1: { bg: '#8b1e2d', label: 'B1' },
  B2: { bg: '#d97706', label: 'B2' },
  C1: { bg: '#8b1e2d', label: 'C1' },
  C2: { bg: '#4a1942', label: 'C2' },
};

function ListeningPanel({ loading, title, audioUrl, clipStart = 0, clipEnd = 180, transcript, wordTimings = null, source, date, vocab = [], questions = [], grammar = [], vocabTheme = '', contentLevel = '', parisianPercent = 0, dailyParisianPoints = 0, onSpendExperience }) {
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const audioRef = React.useRef(null);
  // Effective duration is the clip window length
  const clipLength = clipEnd - clipStart;
  const effectiveDuration = clipLength > 0 ? clipLength : (duration ? Math.min(duration, clipEnd) : clipEnd);
  const [translateActive, setTranslateActive] = React.useState(false);
  const [revealedBatchCount, setRevealedBatchCount] = React.useState(0);

  React.useEffect(() => { setTranslateActive(false); setRevealedBatchCount(0); }, [transcript]);
  React.useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Normalize transcript (Deepgram flat string, or old scraped text with newlines)
  const normalizedTranscript = React.useMemo(() =>
    (transcript || '').replace(/\s*\n+\s*/g, ' ').trim()
  , [transcript]);

  const hintBatches = React.useMemo(() => {
    const b = [];
    for (let i = 0; i < vocab.length; i += 2) b.push(vocab.slice(i, i + 2));
    return b;
  }, [vocab]);
  const revealedWords = React.useMemo(() => hintBatches.slice(0, revealedBatchCount).flat(), [hintBatches, revealedBatchCount]);
  const hasMoreHints = revealedBatchCount < hintBatches.length;
  const canAffordHint = parisianPercent >= HINT_COST;

  const handleTranslateClick = () => {
    if (translateActive) { setTranslateActive(false); return; }
    if (revealedBatchCount === 0) setRevealedBatchCount(1);
    setTranslateActive(true);
  };

  const revealMoreWords = () => {
    if (!hasMoreHints) return;
    if (revealedBatchCount > 0 && !canAffordHint) return;
    if (revealedBatchCount > 0) onSpendExperience?.(HINT_COST);
    setRevealedBatchCount((c) => Math.min(c + 1, hintBatches.length));
    setTranslateActive(true);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const seek = (e) => {
    if (!audioRef.current || !effectiveDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * effectiveDuration + clipStart;
  };

  // Syllable weights for every word — used as fallback when no Deepgram timings
  const allWordWeights = React.useMemo(() => {
    if (!normalizedTranscript) return [];
    return normalizedTranscript.split(/\s+/).filter(Boolean).map(frSyllables);
  }, [normalizedTranscript]);
  const totalWeight = React.useMemo(() => allWordWeights.reduce((s, w) => s + w, 0), [allWordWeights]);

  // Click a word → seek audio to its exact (Deepgram) or estimated (syllable-weighted) position
  const seekToWord = (wordIdx) => {
    if (!audioRef.current) return;
    if (wordTimings && wordTimings[wordIdx]) {
      audioRef.current.currentTime = wordTimings[wordIdx].start + clipStart;
    } else if (effectiveDuration && totalWeight) {
      const wBefore = allWordWeights.slice(0, wordIdx).reduce((s, w) => s + w, 0);
      audioRef.current.currentTime = (wBefore / totalWeight) * effectiveDuration + clipStart;
    }
  };


  const fmtDate = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return d.split(' ').slice(1, 4).join(' '); }
  };
  const byline = [source, fmtDate(date)].filter(Boolean).join(' — ');
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = effectiveDuration ? (Math.min(currentTime, effectiveDuration) / effectiveDuration) * 100 : 0;

  // Only transcript tab lives in the listening panel now;
  // comprehension / vocabulary / grammar are in the AudioDemoCard speech box.

  return (
    <div className="flex flex-col pr-4" style={{ height: 520 }}>
      {loading ? (
        <div className="flex flex-col gap-4 pt-2">
          <div className="h-8 bg-navy/8 rounded w-3/4 animate-pulse" />
          <div className="flex items-center gap-2.5 px-3 py-2 bg-navy/5 border border-navy/10 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-wine/20 animate-pulse shrink-0" />
            <div className="flex-1 h-1 bg-navy/10 rounded-full animate-pulse" />
            <div className="w-7 h-3 bg-navy/10 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-4 h-4 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
            <span className="text-[13px] text-navy/40 font-display italic">Chargement de l'épisode…</span>
          </div>
        </div>
      ) : (
        <>
          {/* Title */}
          {title && (
            <div className="mb-2 shrink-0 px-3 py-2 border-l-4 border-navy bg-navy/5" style={{ borderRadius: '0 4px 4px 0' }}>
              <div className="flex items-start gap-2">
                <h2 className="font-display text-[16px] sm:text-[18px] leading-[1.25] tracking-[-0.01em] line-clamp-2 text-navy flex-1">{title}</h2>
                {contentLevel && CEFR_BADGE[contentLevel] && (
                  <span className="shrink-0 mt-0.5 px-2 py-1 rounded text-[13px] font-mono font-bold text-white leading-none"
                    style={{ backgroundColor: CEFR_BADGE[contentLevel].bg }}>
                    {CEFR_BADGE[contentLevel].label}
                  </span>
                )}
              </div>
              {vocabTheme && <span className="text-[9px] font-mono tracking-widest uppercase text-wine/60 mt-0.5 block">{vocabTheme}</span>}
            </div>
          )}

          {/* Audio bar */}
          <div className="shrink-0 mb-2">
            {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata"
              onTimeUpdate={() => {
                const t = audioRef.current?.currentTime || 0;
                if (t >= clipEnd) { audioRef.current.pause(); audioRef.current.currentTime = clipEnd; setPlaying(false); }
                setCurrentTime(t - clipStart);
              }}
              onLoadedMetadata={() => {
                setDuration(audioRef.current?.duration || 0);
                if (clipStart > 0) audioRef.current.currentTime = clipStart;
              }}
              onEnded={() => setPlaying(false)} />}
            <div className="flex items-center gap-2.5 px-3 py-2 bg-navy/5 border border-navy/10 rounded-lg">
              <button type="button" onClick={togglePlay} disabled={!audioUrl}
                className="w-7 h-7 rounded-full bg-wine text-ivory flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wine/80">
                {playing
                  ? <svg width="8" height="10" viewBox="0 0 8 10" fill="none"><rect x="0" y="0" width="2.5" height="10" rx="1" fill="white"/><rect x="5" y="0" width="2.5" height="10" rx="1" fill="white"/></svg>
                  : <svg width="8" height="10" viewBox="0 0 8 10" fill="none"><path d="M1 0.5l6 4.5L1 9.5V0.5z" fill="white"/></svg>}
              </button>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] font-mono text-navy/35 tabular-nums w-7 shrink-0">{fmtTime(currentTime)}</span>
                <div className={`flex-1 h-1 rounded-full relative group ${audioUrl ? 'cursor-pointer' : 'cursor-default'} bg-navy/25`} onClick={audioUrl ? seek : undefined}>
                  <div className="h-full bg-wine rounded-full transition-[width] duration-100" style={{ width: `${pct}%` }} />
                  {audioUrl && <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-wine border-2 border-white shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ left: `calc(${pct}% - 5px)` }} />}
                </div>
                <span className="text-[10px] font-mono text-navy/35 tabular-nums w-7 shrink-0 text-right">{fmtTime(effectiveDuration)}</span>
              </div>
            </div>
          </div>


          {/* Transcript — fills remaining space, scrolls */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {wordTimings ? (
              // Word-synced mode: all words visible, highlighted word auto-scrolls into view
              <AudioSyncedTranscript
                text={normalizedTranscript}
                currentTime={currentTime}
                duration={effectiveDuration}
                allWordWeights={allWordWeights}
                wordTimings={wordTimings}
                onWordClick={seekToWord}
                className="font-display text-[17px] leading-[1.65] text-navy/80"
                vocabEntries={revealedWords}
                highlightActive={translateActive && revealedWords.length > 0}
              />
            ) : (
              // Static text mode — normalize newlines so sentences flow as prose
              <PassageWithVocabHighlights
                passage={normalizedTranscript}
                vocabEntries={revealedWords}
                highlightActive={translateActive && revealedWords.length > 0}
                className="font-display text-[16px] leading-[1.7] text-navy/80"
              />
            )}
          </div>

          {/* Footer: byline + points + translate */}
          <div className="shrink-0 border-t pt-2" style={{ borderColor: 'rgba(139,30,45,0.2)' }}>
            {byline && <p className="text-[10px] font-mono tracking-[0.12em] mb-1.5 truncate" style={{ color: '#8b1e2d' }}>{byline}</p>}
            <div className="flex items-center justify-between gap-2 relative">
              <DailyParisianPointsIndicator points={dailyParisianPoints} hideLabel />

              {vocab.length > 0 && !translateActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-1 min-w-0 px-0.5 pointer-events-none leading-[1.15]"
                >
                  <span className="font-display text-[10.5px] italic text-wine/70">Use my Parisian points to translate</span>
                  <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden className="shrink-0">
                    <path d="M1 5 H15 M11 1.5 L15 5 L11 8.5" stroke="#8B1E2D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
                  </svg>
                </motion.div>
              )}

              {vocab.length > 0 && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleTranslateClick}
                    className={`inline-flex items-center rounded-full bg-wine hover:bg-wine2 text-ivory px-4 py-2 text-[13px] font-medium font-display transition-colors duration-200 whitespace-nowrap ${translateActive ? 'ring-2 ring-wine/30 ring-offset-2 ring-offset-paper' : ''}`}
                    aria-label="Translate hard words"
                    aria-pressed={translateActive}
                  >
                    Translate hard words
                  </button>
                  {translateActive && hasMoreHints && revealedBatchCount > 0 && (
                    <button
                      type="button"
                      onClick={revealMoreWords}
                      disabled={!canAffordHint}
                      className={`text-[9px] font-mono tracking-widest uppercase transition-colors ${canAffordHint ? 'text-wine/70 hover:text-wine' : 'text-navy/25 cursor-not-allowed'}`}
                    >
                      {canAffordHint ? `+ more words — ${HINT_COST} pts` : `need ${HINT_COST} Parisianism`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const NARRATOR_PORTRAITS = { lea: '/assets/lea.png', jules: '/assets/jules.png' };

// Normalize a vocab item for loose matching (strip articles, accents, case).
function normVocab(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(l['’]|le |la |les |un |une |des |du |de |d['’])/, '')
    .replace(/[^a-z' ]/g, '')
    .trim();
}
// Did the learner use this target vocab word? (tolerant of inflection/articles)
function isVocabUsed(word, usedList) {
  const t = normVocab(word);
  if (!t) return false;
  return (usedList || []).some((u) => {
    const n = normVocab(u);
    return n && (n === t || n.includes(t) || t.includes(n));
  });
}

function SpeakingChallengePanel({ loading, narratorId = 'lea', openingLine = '', openingLineTranslation = '', topicLabel = '', targetGrammar = null, targetVocab = null, usedVocab = [], usedGrammar = false }) {
  const name = narratorId === 'lea' ? 'Léa' : 'Jules';

  const [speaking, setSpeaking] = React.useState(false);
  const [playbackTime, setPlaybackTime] = React.useState(null);
  const [timings, setTimings] = React.useState([]);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);

  const stopAudio = React.useCallback(() => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setSpeaking(false);
    setPlaybackTime(null);
    setTimings([]);
  }, []);

  React.useEffect(() => stopAudio, [stopAudio]);

  const playOpeningLine = async () => {
    if (!openingLine) return;
    if (speaking) { stopAudio(); return; }
    stopAudio();
    const session = sessionRef.current;
    const siteSession = beginSiteAudioPlayback();
    try {
      const buf = await fetchNarratorAudio(openingLine, narratorId);
      if (session !== sessionRef.current || !isSiteAudioPlaybackCurrent(siteSession)) return;
      const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (session !== sessionRef.current || !isSiteAudioPlaybackCurrent(siteSession)) return;
      setTimings(buildWordTimings(openingLine, decoded.duration));
      setPlaybackTime(0);
      setSpeaking(true);
      registerSiteAudioStop(stopAudio);
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: narratorId,
        sourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (session !== sessionRef.current) return;
          setPlaybackTime(t);
          if (t == null) stopAudio();
        },
      });
    } catch { stopAudio(); }
  };

  return (
    <div className="flex flex-col pr-4" style={{ height: 520 }}>
      {loading ? (
        <div className="flex items-center gap-3 mt-auto mb-auto">
          <div className="w-4 h-4 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
          <span className="text-[14px] text-navy/40 font-display italic">Preparing the conversation…</span>
        </div>
      ) : (
        <>
          <div className="mb-6 shrink-0 px-4 py-3 border-l-4 border-wine bg-wine/5" style={{ borderRadius: '0 4px 4px 0' }}>
            <p className="text-[10px] tracking-widest uppercase text-wine/60 mb-1 font-mono">Speaking Challenge</p>
            <h2 className="font-display text-[24px] leading-snug text-navy">{topicLabel}</h2>
          </div>

          <div className="flex gap-4 items-start mb-6 shrink-0">
            {/* Narrator portrait — click to play */}
            <div className="relative shrink-0">
              <button type="button" onClick={playOpeningLine} aria-label={`Listen to ${name}`}
                className="relative w-16 h-16 rounded-full overflow-hidden border-2 transition-all hover:scale-105 active:scale-95"
                style={{ borderColor: speaking ? '#8b1e2d' : 'rgba(139,30,45,0.2)' }}>
                <img src={NARRATOR_PORTRAITS[narratorId]} alt={name} className="w-full h-full object-cover object-top" />
                {/* play/pause overlay */}
                <div className={`absolute inset-0 flex items-center justify-center bg-navy/30 transition-opacity ${speaking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {speaking
                    ? <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="0" y="0" width="3" height="12" rx="0.5" fill="white"/><rect x="6" y="0" width="3" height="12" rx="0.5" fill="white"/></svg>
                    : <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><path d="M1 1l8 5-8 5V1z" fill="white"/></svg>}
                </div>
              </button>
              {speaking && <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-30 pointer-events-none" />}
            </div>

            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-widest uppercase text-wine/60 font-mono">{name}</span>
                <button type="button" onClick={playOpeningLine}
                  className="flex items-center gap-1 text-[10px] font-mono text-wine/50 hover:text-wine transition-colors">
                  {speaking
                    ? <><svg width="8" height="10" viewBox="0 0 10 12" fill="none"><rect x="0" y="0" width="3" height="12" rx="0.5" fill="currentColor"/><rect x="6" y="0" width="3" height="12" rx="0.5" fill="currentColor"/></svg> pause</>
                    : <><svg width="8" height="10" viewBox="0 0 10 12" fill="none"><path d="M1 1l8 5-8 5V1z" fill="currentColor"/></svg> écouter</>}
                </button>
              </div>
              {openingLine ? (
                <NarratorHoverText
                  text={openingLine}
                  translation={openingLineTranslation}
                  highlightSpeech={speaking}
                  speechPlaybackTime={playbackTime}
                  speechTimings={timings}
                  quote
                  className="font-display text-[16px] italic leading-snug text-navy"
                  wrapperClassName="relative w-full"
                />
              ) : (
                <p className="font-display text-[15px] text-navy/40 italic">Réponds en français…</p>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-end gap-3 pb-4">
            {/* Your challenge — grammar + vocab targets the opening question elicits */}
            {(targetGrammar || (targetVocab && targetVocab.length > 0)) ? (
              <div className="border border-wine/25 bg-wine/[0.04] px-4 py-3 space-y-3" style={{ borderRadius: 4 }}>
                <p className="text-[10px] tracking-widest uppercase text-wine/60 font-mono">Ton défi</p>

                {targetGrammar && (targetGrammar.point || targetGrammar.hint) && (
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-wine/50 shrink-0 mt-1 w-[58px]">Grammaire</span>
                    <div className="min-w-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-display text-[14px] font-medium transition-colors duration-300 ${usedGrammar ? 'bg-navy/10 border border-navy/30 text-navy' : 'text-navy'}`}>
                        {usedGrammar && (
                          <svg width="13" height="13" viewBox="0 0 48 48" fill="none" stroke="#1A2340" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden><path d="M42 12L18 36l-12-12" /></svg>
                        )}
                        {targetGrammar.point}
                      </span>
                      {targetGrammar.hint && <p className="text-[12px] text-navy/55 leading-snug mt-0.5">{targetGrammar.hint}</p>}
                    </div>
                  </div>
                )}

                {targetVocab && targetVocab.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-wine/50 shrink-0 mt-1 w-[58px]">Vocab</span>
                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {targetVocab.map((v, i) => {
                        const used = isVocabUsed(v.word, usedVocab);
                        return (
                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors duration-300 ${used ? 'bg-navy/10 border-navy/30' : 'bg-wine/10 border-wine/15'}`}>
                            {used && (
                              <svg width="11" height="11" viewBox="0 0 48 48" fill="none" stroke="#1A2340" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden><path d="M42 12L18 36l-12-12" /></svg>
                            )}
                            <span className={`font-display text-[13px] font-medium transition-colors duration-300 ${used ? 'text-navy' : 'text-wine'}`}>{v.word}</span>
                            {v.meaning && <span className="text-[10px] text-navy/45">· {v.meaning}</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-navy/45 italic pt-0.5 leading-snug">
                  Réponds à {name} en utilisant ces éléments.
                </p>
              </div>
            ) : (
              <div className="border border-line/40 bg-paper/60 px-4 py-3 space-y-2">
                <p className="text-[10px] tracking-widest uppercase text-navy/35 font-mono">Tips</p>
                <ul className="space-y-1">
                  {['Parle naturellement, sans trop réfléchir', 'Utilise des expressions idiomatiques parisiennes', 'N\'hésite pas à demander des clarifications'].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-navy/60 font-display">
                      <span className="text-wine/40 shrink-0 mt-0.5">—</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Splits French text into clickable words that fetch translations + pronunciation on demand. */
function TranslatableText({ text, className = '', context = '', narratorId = 'lea' }) {
  text = typeof text === 'string' ? text : (text == null ? '' : String(text));
  const cacheRef = React.useRef({});
  const audioCacheRef = React.useRef({});
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [loadingWord, setLoadingWord] = React.useState(null);
  const [activeWord, setActiveWord] = React.useState(null);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });
  const [playingWord, setPlayingWord] = React.useState(null);

  // Close tooltip on outside click
  React.useEffect(() => {
    if (!activeWord) return undefined;
    const handler = () => setActiveWord(null);
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [activeWord]);

  const handleClick = React.useCallback(async (raw, rect) => {
    const clean = raw.replace(/[^a-zA-ZÀ-ÿœæ'-]/g, '').toLowerCase();
    if (!clean || clean.length < 2) return;
    setTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
    setActiveWord(clean);
    if (cacheRef.current[clean] !== undefined) return;
    setLoadingWord(clean);
    try {
      const r = await fetch('/api/translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: clean, context: (context || text).slice(0, 150) }),
      });
      const { translation } = await r.json();
      cacheRef.current[clean] = translation || clean;
      forceUpdate();
    } catch {
      cacheRef.current[clean] = clean;
    } finally {
      setLoadingWord(null);
    }
  }, [context, text]);

  const handlePronounce = React.useCallback(async (clean) => {
    if (playingWord === clean) return;
    setPlayingWord(clean);
    try {
      let url = audioCacheRef.current[clean];
      if (!url) {
        // ElevenLabs Parisian voice (Léa/Jules), cached across levels
        const buf = await fetchNarratorAudio(clean, narratorId);
        url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
        audioCacheRef.current[clean] = url;
      }
      const audio = new Audio(url);
      audio.onended = () => setPlayingWord(null);
      audio.onerror = () => setPlayingWord(null);
      await audio.play();
    } catch {
      setPlayingWord(null);
    }
  }, [narratorId, playingWord]);

  // Tokenise keeping punctuation/spaces as separate tokens
  const tokens = React.useMemo(() => text.split(/([^a-zA-ZÀ-ÿœæ'-]+)/u), [text]);

  const tooltip = activeWord ? createPortal(
    <div
      className="fixed z-[300] min-w-[7rem] max-w-[15rem] rounded-md border border-navy/10 bg-navy px-3 py-2 shadow-[0_8px_28px_rgba(26,35,64,0.32)]"
      style={{ top: tooltipPos.top, left: tooltipPos.left, transform: 'translate(-50%, calc(-100% - 9px))' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 justify-center">
        <span className="text-[12px] leading-snug text-ivory text-center">
          {loadingWord === activeWord
            ? <span className="opacity-50">…</span>
            : formatTranslationWords(cacheRef.current[activeWord] ?? '…')}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handlePronounce(activeWord); }}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-ivory/50 hover:text-ivory"
          aria-label="Écouter"
        >
          {playingWord === activeWord
            ? <span className="w-1.5 h-1.5 rounded-full bg-wine/80 animate-ping" />
            : <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 5v4h2.5L8 12V2L4.5 5H2z" fill="currentColor" stroke="none"/>
                <path d="M10.5 4.5a3.5 3.5 0 010 5"/>
              </svg>
          }
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <span className={className}>
      {tokens.map((tok, i) => {
        if (!/[a-zA-ZÀ-ÿœæ'-]/.test(tok)) return <span key={i}>{tok}</span>;
        const clean = tok.replace(/[^a-zA-ZÀ-ÿœæ'-]/g, '').toLowerCase();
        const isActive = activeWord === clean;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            className={`cursor-pointer rounded-sm px-[1px] transition-colors ${isActive ? 'bg-wine/15 text-navy' : 'hover:bg-wine/10'}`}
            onMouseDown={(e) => { e.stopPropagation(); handleClick(tok, e.currentTarget.getBoundingClientRect()); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(tok, e.currentTarget.getBoundingClientRect()); } }}
          >
            {tok}
          </span>
        );
      })}
      {tooltip}
    </span>
  );
}

// ── Guided writing review thread (Writing tab) ───────────────────────────────
function WriteBubble({ narratorId, children, onReplay, text }) {
  const portrait = narratorId === 'jules' ? '/assets/jules.png' : '/assets/lea.png';
  const alt = narratorId === 'jules' ? 'Jules' : 'Léa';
  return (
    <div className="flex items-start gap-2.5">
      <button type="button" onClick={() => text && onReplay?.(text, narratorId)}
        className="relative w-9 h-9 rounded-full overflow-hidden ring-2 ring-wine/25 shrink-0 hover:ring-wine/60 transition-all hover:scale-105 mt-0.5"
        aria-label="Replay">
        <img src={portrait} alt={alt} className="w-full h-full object-cover object-top" />
      </button>
      <div className="font-display text-[15px] italic text-navy/80 leading-snug max-w-[88%] pt-1">{children}</div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 h-8 pl-1">
      {[0, 150, 300].map(d => (
        <span key={d} className="w-2 h-2 bg-navy/25 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

function WritingPracticeExercise({ exercise, narratorId, onScoreDelta, context }) {
  const [ans, setAns] = React.useState('');
  const [picked, setPicked] = React.useState(null);
  const [done, setDone] = React.useState(false);
  if (!exercise || !exercise.type) return null;
  // The AI sometimes returns answer as a number or array — coerce to string
  const norm = (s) => String(Array.isArray(s) ? s[0] ?? '' : s ?? '').trim().toLowerCase().replace(/[.!?]$/, '');

  if (exercise.type === 'mcq') {
    return (
      <div className="border border-wine/20 bg-wine/[0.04] rounded px-3 py-2.5 space-y-2">
        <p className="text-[9px] font-mono uppercase tracking-widest text-wine/55">Exercice</p>
        <p className="font-display text-[14px] text-navy"><TranslatableText text={exercise.question || ''} narratorId={narratorId} context={context} /></p>
        <div className="flex flex-col gap-1.5">
          {(exercise.options || []).map((opt, i) => {
            const correct = norm(opt) === norm(exercise.answer);
            const isPicked = picked === i;
            const cls = !done ? 'border-navy/15 hover:border-wine/40'
              : correct ? 'border-green-600 bg-green-600/10'
              : isPicked ? 'border-wine bg-wine/10' : 'border-navy/10 opacity-60';
            return (
              <button key={i} type="button" disabled={done}
                onClick={() => { setPicked(i); setDone(true); onScoreDelta?.(correct ? 2 : -1); }}
                className={`text-left text-[13px] font-display px-2.5 py-1.5 rounded border transition-colors ${cls}`}>
                {opt}{done && correct ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // fill-blank or rephrase → text input
  const target = exercise.type === 'rephrase' ? exercise.answer : exercise.answer;
  const promptText = exercise.type === 'rephrase' ? exercise.instruction : exercise.sentence;
  const correct = done && norm(ans) === norm(target);
  return (
    <div className="border border-wine/20 bg-wine/[0.04] rounded px-3 py-2.5 space-y-2">
      <p className="text-[9px] font-mono uppercase tracking-widest text-wine/55">Exercice</p>
      <p className="font-display text-[14px] text-navy"><TranslatableText text={promptText || ''} narratorId={narratorId} context={context} /></p>
      {exercise.type === 'rephrase' && exercise.example && (
        <p className="text-[12px] italic text-navy/55">« {exercise.example} »</p>
      )}
      <div className="flex items-center gap-2">
        <input value={ans} onChange={(e) => setAns(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ans.trim()) { setDone(true); onScoreDelta?.(norm(ans) === norm(target) ? 2 : -1); } }}
          disabled={done && correct}
          placeholder="Ta réponse…"
          className="flex-1 min-w-0 text-[13px] font-display px-2.5 py-1.5 rounded border border-navy/15 bg-ivory/80 outline-none focus:border-wine/40" />
        {!correct && (
          <button type="button" onClick={() => { if (ans.trim()) { setDone(true); onScoreDelta?.(norm(ans) === norm(target) ? 2 : -1); } }}
            className="shrink-0 text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded bg-wine text-ivory hover:bg-wine2 transition-colors">OK</button>
        )}
      </div>
      {done && (
        <p className={`text-[12px] font-display ${correct ? 'text-green-600' : 'text-wine'}`}>
          {correct ? '✓ Bravo !' : `✗ → ${target}`}
          {exercise.hint && !correct ? ` · ${exercise.hint}` : ''}
        </p>
      )}
    </div>
  );
}

function WritingReviewThread({ review, frozen = false, question, onQuestionChange, onCorriger, onSubmitQuestion, onNewChallenge, onRetry, onReplay, onScoreDelta, challengeContext, onShowExample, example, exampleLoading }) {
  const { stage, narratorId = 'lea', reaction, original, corrected, explanation, userQuestion, exercise } = review;
  const endRef = React.useRef(null);
  // Frozen past exchanges that were already corrected start expanded.
  const [correctionOpen, setCorrectionOpen] = React.useState(frozen && !!corrected);
  // Reset the toggle only when a brand-new sentence loads — NOT when its
  // correction arrives (that would snap the panel shut right after opening).
  React.useEffect(() => { setCorrectionOpen(frozen && !!corrected); }, [original]); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto-scroll is handled by the parent container (it owns the scroller and
  // can defer until the whole thread has laid out).
  const reached = (s) => {
    const order = ['idle', 'judging', 'judged', 'correcting', 'corrected', 'explaining', 'explained'];
    return order.indexOf(stage) >= order.indexOf(s);
  };

  return (
    <div className="px-4 pt-3 pb-2 flex flex-col gap-4 shrink-0">
      {/* Original text + "Correct my sentence" inline — appears as soon as judged */}
      {original && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="font-display text-[16px] text-navy leading-snug whitespace-pre-wrap">{original}</p>
            {reached('judged') && (!frozen || corrected) && (
              <button
                type="button"
                onClick={() => {
                  if (!frozen && !reached('correcting')) onCorriger();
                  setCorrectionOpen(o => !o);
                }}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-wine/70 border border-wine/30 rounded-full px-2 py-0.5 hover:bg-wine/10 hover:text-wine transition-colors"
              >
                Correct my sentence
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className={`transition-transform duration-200 ${correctionOpen ? 'rotate-180' : ''}`}>
                  <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
          {correctionOpen && (
            corrected ? (
              (() => {
                const norm = (s) => (s || '').trim().replace(/\s+/g, ' ').replace(/[.!?…]+$/, '').toLowerCase();
                const isCorrect = norm(original) === norm(corrected);
                return isCorrect ? (
                  <div className="flex items-center gap-1.5 text-[13px] font-display text-green-600 self-start">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="6.4" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                      <path d="M4 7.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Parfait, ta phrase est correcte&nbsp;!
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2.5 bg-paper border border-line/50 rounded-xl px-3 py-2.5 shadow-sm self-start">
                    <button
                      type="button"
                      onClick={() => onReplay(corrected, narratorId)}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-wine/15 hover:bg-wine/25 shrink-0 transition-colors"
                      aria-label="Écouter la correction"
                    >
                      <svg width="7" height="9" viewBox="0 0 7 9" fill="none" aria-hidden>
                        <path d="M1 1l5 3.5L1 8V1z" fill="#8B1E2D" opacity="0.8"/>
                      </svg>
                    </button>
                    <CorrectionBlock original={original} corrected={corrected} className="font-display text-[15px] italic text-navy/80 leading-snug select-text" />
                  </div>
                );
              })()
            ) : (
              <div className="flex items-center gap-1.5 text-[12px] font-display italic text-navy/40">
                <div className="w-3 h-3 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
                Correction en cours…
              </div>
            )
          )}
        </div>
      )}

      {/* Reaction / judgement */}
      {stage === 'judging' ? (
        <WriteBubble narratorId={narratorId}><TypingDots /></WriteBubble>
      ) : reaction ? (
        <WriteBubble narratorId={narratorId} text={reaction} onReplay={onReplay}>
          <TranslatableText text={reaction} narratorId={narratorId} context={challengeContext} />
        </WriteBubble>
      ) : null}

      {/* Show example — only interactive on the active exchange */}
      {!frozen && stage === 'judged' && (
        <div className="flex flex-col gap-2">
          <button type="button"
            onClick={() => { if (!example && !exampleLoading) onShowExample?.(); }}
            disabled={exampleLoading || example !== null}
            className="self-start text-[12px] font-mono uppercase tracking-wider px-4 py-1.5 rounded-full bg-wine text-ivory hover:bg-wine2 transition-colors disabled:opacity-60">
            {exampleLoading ? '…' : example !== null ? 'Example shown ↓' : 'Show example'}
          </button>
          {exampleLoading && (
            <div className="flex items-center gap-1.5 text-[12px] font-display italic text-navy/40">
              <div className="w-3 h-3 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
              Génération de l'exemple…
            </div>
          )}
          {example !== null && example !== '' && (
            <div className="bg-paper border border-line/50 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-[9px] font-mono uppercase tracking-widest text-wine/50 mb-2">Exemple de rédaction</p>
              <p className="font-display text-[15px] text-navy/80 leading-relaxed whitespace-pre-wrap">{example}</p>
            </div>
          )}
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

const TIPS_SECTIONS = [
  { key: 'vocab',       label: 'Vocabulaire',  icon: '📖', pill: true  },
  { key: 'expressions', label: 'Expressions',  icon: '💬', pill: true  },
  { key: 'grammar',     label: 'Grammaire',    icon: '📝', pill: false },
  { key: 'conjugation', label: 'Conjugaisons', icon: '🔄', pill: false },
  { key: 'connecteurs', label: 'Connecteurs',  icon: '🔗', pill: true  },
];

function WritingChallengePanel({ loading, prompt = '', tips = {}, wordTarget = 80, narratorId = 'lea' }) {
  const hasTips = TIPS_SECTIONS.some(s => (tips[s.key] || []).length > 0);
  const name = narratorId === 'jules' ? 'Jules' : 'Léa';

  const [speaking, setSpeaking] = React.useState(false);
  const [playbackTime, setPlaybackTime] = React.useState(null);
  const [timings, setTimings] = React.useState([]);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);

  const stopAudio = React.useCallback(() => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setSpeaking(false);
    setPlaybackTime(null);
    setTimings([]);
  }, []);
  React.useEffect(() => stopAudio, [stopAudio]);

  const playPrompt = async () => {
    if (!prompt) return;
    if (speaking) { stopAudio(); return; }
    stopAudio();
    const session = sessionRef.current;
    const siteSession = beginSiteAudioPlayback();
    try {
      const buf = await fetchNarratorAudio(prompt, narratorId);
      if (session !== sessionRef.current || !isSiteAudioPlaybackCurrent(siteSession)) return;
      const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (session !== sessionRef.current || !isSiteAudioPlaybackCurrent(siteSession)) return;
      setTimings(buildWordTimings(prompt, decoded.duration));
      setPlaybackTime(0);
      setSpeaking(true);
      registerSiteAudioStop(stopAudio);
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: narratorId,
        sourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (session !== sessionRef.current) return;
          setPlaybackTime(t);
          if (t == null) stopAudio();
        },
      });
    } catch { stopAudio(); }
  };

  // Read the challenge aloud once when it arrives
  const autoPlayedRef = React.useRef(null);
  React.useEffect(() => {
    if (loading || !prompt || autoPlayedRef.current === prompt) return;
    autoPlayedRef.current = prompt;
    playPrompt();
  }, [prompt, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col pr-4 overflow-y-auto" style={{ height: 520 }}>
      {loading ? (
        <div className="flex items-center gap-3 mt-auto mb-auto">
          <div className="w-4 h-4 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
          <span className="text-[14px] text-navy/40 font-display italic">Preparing your writing prompt…</span>
        </div>
      ) : (
        <>
          {/* Challenge — read aloud by the narrator */}
          <div className="mb-4 shrink-0 px-4 py-3 border-l-4 border-wine bg-wine/5" style={{ borderRadius: '0 4px 4px 0' }}>
            <p className="text-[10px] tracking-widest uppercase text-wine/60 mb-1.5 font-mono">Writing Challenge</p>
            <div className="flex items-start gap-3">
              <div className="relative shrink-0">
                <button type="button" onClick={playPrompt} aria-label={`Listen to ${name}`}
                  className="group relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all hover:scale-105 active:scale-95"
                  style={{ borderColor: speaking ? '#8b1e2d' : 'rgba(139,30,45,0.2)' }}>
                  <img src={NARRATOR_PORTRAITS[narratorId]} alt={name} className="w-full h-full object-cover object-top" />
                  <div className={`absolute inset-0 flex items-center justify-center bg-navy/30 transition-opacity ${speaking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {speaking
                      ? <svg width="9" height="11" viewBox="0 0 10 12" fill="none"><rect x="0" y="0" width="3" height="12" rx="0.5" fill="white"/><rect x="6" y="0" width="3" height="12" rx="0.5" fill="white"/></svg>
                      : <svg width="9" height="11" viewBox="0 0 10 12" fill="none"><path d="M1 1l8 5-8 5V1z" fill="white"/></svg>}
                  </div>
                </button>
                {speaking && <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-30 pointer-events-none" />}
              </div>
              <p className="font-display text-[17px] leading-snug text-navy flex-1 min-w-0">
                {speaking && timings.length > 0
                  ? timings.map((w, i) => (
                      <span key={i} style={wordHighlightInlineStyle(isTimedWordActive(timings, i, playbackTime))}>
                        {w.word}{' '}
                      </span>
                    ))
                  : <TranslatableText text={prompt || 'Écris en français sur ce sujet…'} />}
              </p>
            </div>
          </div>

          {/* Word target */}
          <div className="mb-4 shrink-0 flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="6" stroke="#8B1E2D" strokeWidth="1.2" opacity="0.4"/>
              <path d="M7 4v3.5l2 1.5" stroke="#8B1E2D" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
            </svg>
            <span className="text-[11px] font-mono text-navy/40">Objectif : ~{wordTarget} mots</span>
          </div>

          {/* Conseils */}
          {hasTips && (
            <div className="border border-line/40 bg-paper/60 px-4 py-3 shrink-0">
              <p className="text-[10px] tracking-widest uppercase text-navy/35 font-mono mb-3">Conseils</p>
              <div className="space-y-3">
                {TIPS_SECTIONS.map(({ key, label, icon, pill }) => {
                  const items = tips[key] || [];
                  if (!items.length) return null;
                  return (
                    <div key={key}>
                      <p className="text-[9px] tracking-widest uppercase text-navy/30 font-mono mb-1.5">{icon} {label}</p>
                      {pill ? (
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item, i) => (
                            <span key={i} className="inline-flex items-center border border-navy/15 bg-ivory/80 px-2 py-0.5 text-[12px] font-display text-navy/70 rounded-sm">
                              <TranslatableText text={item} context={prompt} />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {items.map((item, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[12px] font-display text-navy/65 leading-snug">
                              <span className="text-wine/35 shrink-0 mt-0.5">—</span>
                              <TranslatableText text={item} context={prompt} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-[16px]" />
          <p className="text-[11px] text-navy/30 font-display italic mt-3 shrink-0">
            Écris dans la zone de texte à droite, puis clique sur <em>Make it Parisien!</em> pour une correction.
            <span className="block mt-0.5 text-wine/40">← Clique sur un mot pour le traduire.</span>
          </p>
        </>
      )}

    </div>
  );
}

export default function Hero() {
  const { effectiveLevel, profile, spendExperience, gainExperience, dailyParisianPoints } = useLearnerProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [heroActiveTab, setHeroActiveTab] = React.useState('transcript');
  const learnMode = searchParams.get('learn');
  const learnLevel = searchParams.get('level');
  const practiceTopic = searchParams.get('practice');
  const practiceType = searchParams.get('ptype');

  const [exerciseSubTab, setExerciseSubTab] = React.useState('comprehension');

  const [readingActive, setReadingActive] = React.useState(false);
  const [readingTopic, setReadingTopic] = React.useState('');
  const [readingPassage, setReadingPassage] = React.useState('');
  const [readingTitle, setReadingTitle] = React.useState('');
  const [readingSource, setReadingSource] = React.useState(null);
  const [readingAuthor, setReadingAuthor] = React.useState(null);
  const [readingDate, setReadingDate] = React.useState(null);
  const [readingVocab, setReadingVocab] = React.useState([]);
  const [readingQuestions, setReadingQuestions] = React.useState([]);
  const [readingGrammar, setReadingGrammar] = React.useState([]);
  const [readingConjugation, setReadingConjugation] = React.useState([]);
  const [readingLoading, setReadingLoading] = React.useState(false);

  // Track which topic is currently loaded per exercise type.
  // Exercises persist through Chat tab switches; only reload when a *new* topic arrives.
  const loadedReadingTopicRef = React.useRef(null);
  const loadedListeningTopicRef = React.useRef(null);
  const loadedSpeakingTopicRef = React.useRef(null);
  const loadedWritingTopicRef = React.useRef(null);

  // Detect reading mode from URL once — store in state so it survives clearPracticeParam
  React.useEffect(() => {
    if (practiceType === 'reading' && practiceTopic && loadedReadingTopicRef.current !== practiceTopic) {
      loadedReadingTopicRef.current = practiceTopic;
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
          setExerciseSubTab('comprehension');
          setReadingQuestions(data.questions || []);
          setReadingVocab(data.vocab || []);
          setReadingGrammar(data.grammar || []);
          setReadingConjugation(data.conjugation || []);
        })
        .catch(() => setReadingLoading(false));
    }
  }, [practiceTopic, practiceType]);

  // Listening mode state
  const [listeningActive, setListeningActive] = React.useState(false);
  const [listeningLoading, setListeningLoading] = React.useState(false);
  const [listeningTitle, setListeningTitle] = React.useState('');
  const [listeningAudioUrl, setListeningAudioUrl] = React.useState(null);
  const [listeningTranscript, setListeningTranscript] = React.useState('');
  const [listeningSource, setListeningSource] = React.useState(null);
  const [listeningDate, setListeningDate] = React.useState(null);
  const [listeningVocab, setListeningVocab] = React.useState([]);
  const [listeningQuestions, setListeningQuestions] = React.useState([]);
  const [listeningGrammar, setListeningGrammar] = React.useState([]);
  const [listeningConjugation, setListeningConjugation] = React.useState([]);
  const [listeningVocabTheme, setListeningVocabTheme] = React.useState('');
  const [listeningContentLevel, setListeningContentLevel] = React.useState('');
  const [listeningWordTimings, setListeningWordTimings] = React.useState(null);
  const [listeningClipStart, setListeningClipStart] = React.useState(0);
  const [listeningClipEnd, setListeningClipEnd] = React.useState(180);

  React.useEffect(() => {
    if (practiceType === 'listening' && practiceTopic && loadedListeningTopicRef.current !== practiceTopic) {
      loadedListeningTopicRef.current = practiceTopic;
      setListeningActive(true);
      setListeningLoading(true);
      fetch('/api/listening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: practiceTopic, learnerLevel: effectiveLevel || 'B1' }),
      })
        .then((r) => r.json())
        .then((data) => {
          setListeningTitle(data.title || '');
          setListeningAudioUrl(data.audioUrl || null);
          setListeningClipStart(data.clipStart ?? 0);
          setListeningClipEnd(data.clipEnd ?? 180);
          setListeningTranscript(data.transcript || '');
          setListeningSource(data.source || null);
          setListeningDate(data.date || null);
          setListeningVocabTheme(data.vocabTheme || '');
          setListeningContentLevel(data.contentLevel || '');
          setListeningWordTimings(data.wordTimings || null);
          setListeningLoading(false);
          setExerciseSubTab('comprehension');
          setListeningQuestions(data.questions || []);
          setListeningVocab(data.vocab || []);
          setListeningGrammar(data.grammar || []);
          setListeningConjugation(data.conjugation || []);
        })
        .catch(() => setListeningLoading(false));
    }
  }, [practiceTopic, practiceType, effectiveLevel]);

  // Speaking challenge state
  const [speakingActive, setSpeakingActive] = React.useState(false);
  const [speakingLoading, setSpeakingLoading] = React.useState(false);
  const [speakingNarrator, setSpeakingNarrator] = React.useState('lea');
  const [speakingOpeningLine, setSpeakingOpeningLine] = React.useState('');
  const [speakingOpeningTranslation, setSpeakingOpeningTranslation] = React.useState('');
  const [speakingTopicLabel, setSpeakingTopicLabel] = React.useState('');
  const [speakingTargetGrammar, setSpeakingTargetGrammar] = React.useState(null);
  const [speakingTargetVocab, setSpeakingTargetVocab] = React.useState(null);
  // Live défi progress reported by the recording card (which targets are used).
  const [speakingUsedVocab, setSpeakingUsedVocab] = React.useState([]);
  const [speakingUsedGrammar, setSpeakingUsedGrammar] = React.useState(false);

  React.useEffect(() => {
    if (practiceType === 'speaking' && practiceTopic && loadedSpeakingTopicRef.current !== practiceTopic) {
      loadedSpeakingTopicRef.current = practiceTopic;
      setSpeakingActive(true);
      setSpeakingLoading(true);
      fetch('/api/speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: practiceTopic }),
      })
        .then((r) => r.json())
        .then((data) => {
          setSpeakingNarrator(data.narratorId || 'lea');
          setSpeakingOpeningLine(data.openingLine || '');
          setSpeakingOpeningTranslation(data.openingLineTranslation || '');
          setSpeakingTopicLabel(data.topicLabel || practiceTopic);
          setSpeakingTargetGrammar(data.targetGrammar || null);
          setSpeakingTargetVocab(data.targetVocab || null);
          setSpeakingLoading(false);
        })
        .catch(() => setSpeakingLoading(false));
    }
  }, [practiceTopic, practiceType]);

  // Fresh speaking défi on the same theme: new question + new target words/grammar.
  const loadNewSpeakingChallenge = React.useCallback(() => {
    setSpeakingLoading(true);
    setSpeakingUsedVocab([]);
    setSpeakingUsedGrammar(false);
    fetch('/api/speaking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: practiceTopic || speakingTopicLabel || 'la vie parisienne' }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSpeakingNarrator(data.narratorId || 'lea');
        setSpeakingOpeningLine(data.openingLine || '');
        setSpeakingOpeningTranslation(data.openingLineTranslation || '');
        setSpeakingTopicLabel(data.topicLabel || practiceTopic);
        setSpeakingTargetGrammar(data.targetGrammar || null);
        setSpeakingTargetVocab(data.targetVocab || null);
        setSpeakingLoading(false);
      })
      .catch(() => setSpeakingLoading(false));
  }, [practiceTopic, speakingTopicLabel]);

  // Writing challenge state
  const [writingActive, setWritingActive] = React.useState(false);
  const [writingLoading, setWritingLoading] = React.useState(false);
  const [writingPrompt, setWritingPrompt] = React.useState('');
  const [writingTips, setWritingTips] = React.useState({ vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] });
  const [writingWordTarget, setWritingWordTarget] = React.useState(80);
  const [writingNarrator, setWritingNarrator] = React.useState('lea');

  React.useEffect(() => {
    if (practiceType === 'writing' && practiceTopic && loadedWritingTopicRef.current !== practiceTopic) {
      loadedWritingTopicRef.current = practiceTopic;
      setWritingActive(true);
      setWritingLoading(true);
      setWritingNarrator(Math.random() < 0.5 ? 'lea' : 'jules');
      fetch('/api/writing-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: practiceTopic, learnerLevel: effectiveLevel || 'B1' }),
      })
        .then((r) => r.json())
        .then((data) => {
          setWritingPrompt(data.prompt || '');
          setWritingTips(data.tips || { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] });
          setWritingWordTarget(data.wordTarget || 80);
          setWritingLoading(false);
        })
        .catch(() => setWritingLoading(false));
    }
  }, [practiceTopic, practiceType, effectiveLevel]);

  const loadNewWritingChallenge = React.useCallback(() => {
    setWritingLoading(true);
    setWritingNarrator(Math.random() < 0.5 ? 'lea' : 'jules');
    fetch('/api/writing-prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: practiceTopic || '', learnerLevel: effectiveLevel || 'B1' }),
    })
      .then((r) => r.json())
      .then((data) => {
        setWritingPrompt(data.prompt || '');
        setWritingTips(data.tips || { vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] });
        setWritingWordTarget(data.wordTarget || 80);
        setWritingLoading(false);
      })
      .catch(() => setWritingLoading(false));
  }, [practiceTopic, effectiveLevel]);

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

  // Auto-switch to the correct tab when arriving from MyTargets
  React.useEffect(() => {
    if (!practiceType) return;
    const tabMap = { listening: 'listening', reading: 'reading', writing: 'writing', speaking: 'speaking' };
    const tab = tabMap[practiceType];
    if (tab) setHeroActiveTab(tab);
  }, [practiceType]);

  // Trigger exercise generation when user clicks an exercise tab directly
  const tabTriggeredRef = React.useRef(new Set());
  // Topic pools — one is picked at random per visit so the défis vary.
  const EXERCISE_TOPIC_POOLS = {
    reading: ['La vie parisienne', 'La gastronomie française', "L'actualité culturelle", 'Le sport en France', "L'environnement", 'La technologie au quotidien', 'Le cinéma français'],
    listening: ['La culture française', "L'histoire de France", 'La société française', 'La musique francophone', 'Le cinéma français', 'Les sciences au quotidien'],
    speaking: ['Mon quotidien à Paris', 'Les voyages', 'La cuisine et les restos', 'Le travail et les études', 'Les loisirs et le sport', "La famille et l'amitié", 'Les week-ends parfaits'],
    writing: ['Paris et ses secrets', 'Un souvenir de voyage', 'La vie de quartier', 'Les réseaux sociaux', 'Un dîner mémorable', 'Le métro parisien', 'Les saisons à Paris', 'Mon café préféré', 'Une rencontre inattendue'],
  };
  const DEFAULT_EXERCISE_TOPICS = Object.fromEntries(
    Object.entries(EXERCISE_TOPIC_POOLS).map(([k, pool]) => [k, pool[Math.floor(Math.random() * pool.length)]])
  );
  React.useEffect(() => {
    const type = heroActiveTab;
    if (!['reading', 'listening', 'speaking', 'writing'].includes(type)) return;
    if (tabTriggeredRef.current.has(type)) return;
    tabTriggeredRef.current.add(type);
    // If already triggered via URL params from MyTargets, skip
    if (practiceType === type && practiceTopic) return;
    const topic = DEFAULT_EXERCISE_TOPICS[type];
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('practice', topic);
      next.set('ptype', type);
      return next;
    }, { replace: true });
  }, [heroActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // When switching back to Chat: keep all exercise state so students can return mid-exercise.
  // Only reset the trigger tracker + URL params so tabs can re-trigger if the student
  // hasn't visited them yet. The loaded-topic refs prevent unnecessary API re-calls
  // when the same default topic is re-set by the trigger.
  const prevHeroTabRef = React.useRef(heroActiveTab);
  React.useEffect(() => {
    const prev = prevHeroTabRef.current;
    prevHeroTabRef.current = heroActiveTab;
    const wasExercise = ['reading', 'listening', 'speaking', 'writing'].includes(prev);
    if (heroActiveTab !== 'transcript' || !wasExercise) return;
    // Allow re-triggering unvisited exercise tabs (topic refs prevent actual reload)
    tabTriggeredRef.current = new Set();
    // Clear URL params for cleanliness (exercises are preserved via state, not URL)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('practice');
      next.delete('ptype');
      return next;
    }, { replace: true });
  }, [heroActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="relative pt-24 lg:pt-12 pb-12 min-h-screen overflow-visible">
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
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[1fr_680px] gap-8 items-stretch lg:h-[calc(100vh-96px)]">
          <div className="relative flex flex-col justify-center overflow-visible">
            {heroActiveTab === 'reading' && readingActive && (
              <ReadingArticlePanel
                loading={readingLoading}
                title={readingTitle}
                passage={readingPassage}
                source={readingSource}
                author={readingAuthor}
                date={readingDate}
                vocab={readingVocab}
                parisianPercent={profile?.parisianPercent ?? 0}
                dailyParisianPoints={dailyParisianPoints}
                onSpendExperience={spendExperience}
              />
            )}
            {heroActiveTab === 'listening' && listeningActive && (
              <ListeningPanel
                loading={listeningLoading}
                title={listeningTitle}
                audioUrl={listeningAudioUrl}
                clipStart={listeningClipStart}
                clipEnd={listeningClipEnd}
                transcript={listeningTranscript}
                source={listeningSource}
                date={listeningDate}
                vocab={listeningVocab}
                questions={listeningQuestions}
                grammar={listeningGrammar}
                vocabTheme={listeningVocabTheme}
                contentLevel={listeningContentLevel}
                wordTimings={listeningWordTimings}
                parisianPercent={profile?.parisianPercent ?? 0}
                dailyParisianPoints={dailyParisianPoints}
                onSpendExperience={spendExperience}
              />
            )}
            {heroActiveTab === 'speaking' && speakingActive && (
              <SpeakingChallengePanel
                loading={speakingLoading}
                narratorId={speakingNarrator}
                openingLine={speakingOpeningLine}
                openingLineTranslation={speakingOpeningTranslation}
                topicLabel={speakingTopicLabel}
                targetGrammar={speakingTargetGrammar}
                targetVocab={speakingTargetVocab}
                usedVocab={speakingUsedVocab}
                usedGrammar={speakingUsedGrammar}
              />
            )}
            {heroActiveTab === 'writing' && writingActive && (
              <WritingChallengePanel
                loading={writingLoading}
                prompt={writingPrompt}
                tips={writingTips}
                wordTarget={writingWordTarget}
                narratorId={writingNarrator}
              />
            )}
            {/* Always mounted so Reveal components don't re-animate on tab switch */}
            <div className={`flex flex-col items-center text-center overflow-visible ${
              (heroActiveTab === 'reading' && readingActive) ||
              (heroActiveTab === 'listening' && listeningActive) ||
              (heroActiveTab === 'speaking' && speakingActive) ||
              (heroActiveTab === 'writing' && writingActive) ? 'hidden' : ''
            }`}>
            <h1 className="font-display text-[48px] leading-[0.95] tracking-[-0.015em] text-navy flex flex-col gap-2">
              <Reveal delay={0.08}>Learn French</Reveal>
              <Reveal delay={0.18} className="text-wine italic">From Parisiens.</Reveal>
            </h1>

            {/* Jules et Léa — hidden on practice tabs */}
            {!['speaking','listening','reading','writing'].includes(heroActiveTab) && (
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
            )}

            <Reveal delay={0.35}>
              <p className="mt-6 max-w-[min(500px,calc(100vw-3rem))] text-[15px] leading-[1.6] text-navy/70">
                Parisly listens as you speak and correct your French in real time,
                helping you express yourself with fluency and confidence.
              </p>
            </Reveal>
            <Reveal delay={0.42}>
              <div className="mt-8 flex items-center">
                <div className="relative inline-flex">
                  <ParisianExperienceHint placement="right" />
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
          </div>

          <div className="flex justify-center lg:justify-end self-center shrink-0 w-full lg:w-[680px] lg:min-w-[680px] lg:max-w-[680px] lg:pr-10" style={{ height: 500, minHeight: 500, maxHeight: 500 }}>
            <div className="relative shrink-0 w-full max-w-[640px] lg:w-[640px] lg:min-w-[640px]" style={{ height: 500, minHeight: 500, maxHeight: 500 }}>
            <AudioDemoCard
              onOpenFullscreen={(topic) => goToDashboard(topic)}
              initialTopic={practiceType === 'reading' ? null : practiceTopic}
              initialLearnMode={speakingActive ? 'speak' : writingActive ? 'write' : learnMode}
              initialLearnLevel={learnLevel}
              onLearnModeHandled={clearLearnParams}
              onPracticeTopicHandled={practiceType === 'reading' ? undefined : clearPracticeParam}
              readingVocab={heroActiveTab === 'listening' ? listeningVocab : readingVocab}
              listeningQuestions={listeningQuestions}
              listeningVocab={listeningVocab}
              listeningGrammar={listeningGrammar}
              exerciseQuestions={heroActiveTab === 'listening' ? listeningQuestions : readingQuestions}
              exerciseVocab={heroActiveTab === 'listening' ? listeningVocab : readingVocab}
              exerciseGrammar={heroActiveTab === 'listening' ? listeningGrammar : readingGrammar}
              exerciseConjugation={heroActiveTab === 'listening' ? listeningConjugation : readingConjugation}
              exerciseLoading={heroActiveTab === 'listening' ? listeningLoading : readingLoading}
              activeTab={heroActiveTab}
              onTabChange={setHeroActiveTab}
              exerciseSubTabProp={exerciseSubTab}
              onExerciseSubTabChange={setExerciseSubTab}
              speakingNarratorId={speakingNarrator}
              speakingTopicLabel={speakingTopicLabel}
              speakingOpeningLine={speakingOpeningLine}
              speakingTargetGrammar={speakingTargetGrammar}
              speakingTargetVocab={speakingTargetVocab}
              onDefiProgress={({ usedVocab, usedGrammar }) => { setSpeakingUsedVocab(usedVocab); setSpeakingUsedGrammar(usedGrammar); }}
              onNewSpeakingChallenge={loadNewSpeakingChallenge}
              writingNarratorId={writingNarrator}
              writingPrompt={writingPrompt}
              writingTips={writingTips}
              writingWordTarget={writingWordTarget}
              onNewWritingChallenge={loadNewWritingChallenge}
            />
            </div>
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
              <a href="https://kruremi.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 mt-1 group"
                onClick={(e) => e.stopPropagation()}
              >
                <img src="/assets/remi-avatar.png" alt="Kru Rémi" className="w-8 h-8 rounded-full object-cover object-top ring-2 ring-wine/60 group-hover:ring-wine transition-all" />
                <span className="font-display text-[12px] italic text-navy/60 leading-none">
                  by <span className="text-navy font-semibold not-italic group-hover:text-wine transition-colors">Kru Rémi</span> · certified French teacher
                </span>
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
