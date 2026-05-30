import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import {
  ButtonPrimary,
  ButtonGhost,
  Container,
  Reveal,
  Star,
} from './atoms';

// Small TTS play button for corrections
function TtsPlayButton({ text }) {
  const [playing, setPlaying] = React.useState(false);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);

  const stopAudio = React.useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    ctxRef.current?.close().catch?.(() => {});
    sourceRef.current = null; ctxRef.current = null;
    setPlaying(false);
  }, []);

  React.useEffect(() => () => stopAudio(), [stopAudio]);

  const play = async () => {
    stopAudio();
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    setPlaying(true);
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource();
      src.buffer = decoded; src.connect(ctx.destination);
      src.onended = stopAudio; src.start(0);
      sourceRef.current = src;
    } catch { stopAudio(); }
  };

  return (
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
  );
}

// Pulsing dots while correction loads
function CorrectionLoading() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-wine/40"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
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

function wordDiff(original, corrected) {
  const ow = original.trim().split(/\s+/);
  const cw = corrected.trim().split(/\s+/);
  const norm = (s) => s.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
  const m = ow.length, n = cw.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = norm(ow[i-1]) === norm(cw[j-1])
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);

  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && norm(ow[i-1]) === norm(cw[j-1])) {
      ops.unshift({ type: 'keep', oi: i-1, ci: j-1 }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ type: 'insert', ci: j-1 }); j--;
    } else {
      ops.unshift({ type: 'delete', oi: i-1 }); i--;
    }
  }

  const result = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === 'keep') {
      result.push({ word: ow[op.oi], struck: false, fix: null });
    } else if (op.type === 'delete') {
      const fixes = [];
      let ahead = k + 1;
      while (ahead < ops.length && ops[ahead].type === 'insert') {
        fixes.push(cw[ops[ahead].ci]);
        ahead++;
      }
      result.push({ word: ow[op.oi], struck: true, fix: fixes.length ? fixes.join(' ') : null });
    }
  }
  return result;
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
              <span
                className="cursor-help text-wine"
                onMouseEnter={(e) => handleEnter(e.currentTarget, w.fix)}
                onMouseLeave={() => setTooltip(null)}
              >{w.word}</span>{' '}
            </React.Fragment>
          ) : (
            <React.Fragment key={i}>{w.word}{' '}</React.Fragment>
          )
        )}
      </p>
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

export function AudioDemoCard({ fullscreen = false, onClose, onOpenFullscreen, initialTopic }) {
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
  } = useDeepgramTranscription();

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
  const [practiceExercises, setPracticeExercises] = React.useState(null);
  const [loadingPractice, setLoadingPractice] = React.useState(false);
  const [skillProgress, setSkillProgress] = React.useState({});
  const [completedInBatch, setCompletedInBatch] = React.useState(new Set());
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [inputMode, setInputMode] = React.useState('speak');
  const [writeText, setWriteText] = React.useState('');
  const [writeCorrection, setWriteCorrection] = React.useState(null);
  const [writeCorrecting, setWriteCorrecting] = React.useState(false);
  const [writeEditing, setWriteEditing] = React.useState(true);
  const writeTextareaRef = React.useRef(null);
  const [speakCorrection, setSpeakCorrection] = React.useState(null);
  const [fetchingCorrection, setFetchingCorrection] = React.useState(false);
  const [playbackTime, setPlaybackTime] = React.useState(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef(null);

  const prevPartialRef = React.useRef('');
  const prevLengthRef = React.useRef(0);
  const hadContentRef = React.useRef(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [utterances, settledText, partialTranscript]);

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
        body: JSON.stringify({ text: fullText, register, assessOnly: true, includeTopics: true }),
      });
      const data = await res.json();
      setOverallLevel(data.level || null);
      setOverallStrength(data.strength || null);
      setOverallWeakness(data.weakness || null);
      setPracticeTopics(data.topics || (data.weakness ? [data.weakness] : []));
    } catch {}
    setAssessingLevel(false);
  };

  const startPractice = async (topic) => {
    const t = topic || overallWeakness;
    if (!t) return;
    onOpenFullscreen?.(t);
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
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stop();
      const fullText = utterances.map((u) => u.text).join(' ').trim();
      if (fullText) {
        setFetchingCorrection(true);
        setSpeakCorrection(null);
        try {
          const res = await fetch('/api/correct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: fullText, register }),
          });
          const data = await res.json();
          setSpeakCorrection(data);
        } catch {}
        setFetchingCorrection(false);
      }
      return;
    }
    setTime(0);
    setPlaybackTime(null);
    setIsPlaying(false);
    setSpeakCorrection(null);
    await start(source);
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

  const togglePlayback = () => {
    if (!audioUrl) return;
    if (isPlaying) {
      audioRef.current?.pause();
      stopRaf();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          stopRaf();
          setIsPlaying(false);
          setPlaybackTime(null);
        };
      }
      audioRef.current.play();
      startRaf();
      setIsPlaying(true);
    }
  };

  React.useEffect(() => {
    stopRaf();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false); setPlaybackTime(null);
  }, [audioUrl]);

  React.useEffect(() => () => stopRaf(), [stopRaf]);

  React.useEffect(() => {
    if (initialTopic) startPractice(initialTopic);
  }, []);

  const correctWriting = async () => {
    if (!writeText.trim()) return;
    setWriteCorrecting(true);
    setWriteCorrection(null);
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: writeText, register }),
      });
      const data = await res.json();
      setWriteCorrection(data);
      if (data.corrected?.trim() !== writeText.trim()) setWriteEditing(false);
    } catch {}
    setWriteCorrecting(false);
  };

  const resetTranscript = () => {
    stopRaf();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    reset();
    setTime(0);
    setSpeakCorrection(null);
    setFetchingCorrection(false);
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
  };

  const mm = String(Math.floor(time / 60)).padStart(2, '0');
  const ss = String(time % 60).padStart(2, '0');
  const isLive = isRecording || status === 'connecting';
  const hasContent = utterances.length > 0 || !!partialTranscript || !!settledText;
  if (hasContent) hadContentRef.current = true;

  const transcriptHeight = fullscreen ? 'flex-1' : 'h-[220px]';

  return (
    <>
    {fullscreen && <div className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-40" onClick={onClose} />}
    <motion.div
      layout
      initial={{ opacity: 0, y: fullscreen ? 0 : 30, scale: fullscreen ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={fullscreen
        ? 'fixed inset-6 z-50 bg-paper flex overflow-hidden'
        : 'relative w-full max-w-[720px] bg-paper hairline'}
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
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widests uppercase text-navy/40 invisible">Mode</span>
              <div className="relative flex items-center rounded-full p-0.5 gap-0" style={{ background: 'rgba(26,35,64,0.08)' }}>
                <div
                  className="absolute top-0.5 bottom-0.5 rounded-full bg-wine transition-all duration-200"
                  style={{ width: '50%', left: inputMode === 'speak' ? '2px' : 'calc(50% - 2px)' }}
                />
                {['speak', 'write'].map((m) => (
                  <button key={m} type="button" onClick={() => setInputMode(m)}
                    className={`relative z-10 text-[11px] tracking-wide px-3 py-0.5 rounded-full capitalize transition-colors duration-200 ${inputMode === m ? 'text-ivory' : 'text-navy/45 hover:text-navy/70'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-navy/40">Correction Formality Level</span>
              <div className="flex items-center gap-1">
                {['Casual', 'Standard', 'Formal'].map((r) => (
                  <button key={r} type="button" onClick={() => setRegister(r)}
                    className={`text-[11px] tracking-wide px-2 py-0.5 border transition-colors ${register === r ? 'border-wine text-wine bg-wine/5' : 'border-navy/15 text-navy/35 hover:border-navy/30 hover:text-navy/60'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {inputMode === 'speak' && <div className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-navy/40">Source</span>
              <div className="flex items-center gap-1">
                {[{ id: 'mic', label: 'Mic' }, { id: 'tab', label: 'Tab' }].map(({ id, label }) => (
                  <button key={id} type="button" disabled={isRecording} onClick={() => setSource(id)}
                    className={`text-[11px] tracking-wide px-2 py-0.5 border transition-colors disabled:opacity-40 ${source === id ? 'border-wine text-wine bg-wine/5' : 'border-navy/15 text-navy/35 hover:border-navy/30 hover:text-navy/60'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>}
          </div>
          {isLive && (
            <div className="flex items-center gap-2">
              <span className="relative inline-flex">
                <span className="w-2 h-2 rounded-full bg-wine" />
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-wine animate-ping opacity-60" />
              </span>
              <span className="text-[13px] text-navy">
                {status === 'connecting' ? 'Connecting…' : 'Live'}
              </span>
            </div>
          )}
        </div>
        <span className="text-[13px] text-navy/60 font-mono tabular-nums">00:{mm}:{ss}</span>
      </div>

      {/* Tab switcher */}
      {activeTab === 'practice' && (
        <div className="flex border-b border-line mx-5">
          <button type="button" onClick={() => setActiveTab('transcript')}
            className={`text-[10px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors ${activeTab === 'transcript' ? 'border-navy text-navy' : 'border-transparent text-navy/35 hover:text-navy/60'}`}>
            Transcript
          </button>
          <button type="button" onClick={() => setActiveTab('practice')}
            className={`text-[10px] tracking-widest uppercase px-3 py-2 border-b-2 transition-colors ${activeTab === 'practice' ? 'border-wine text-wine' : 'border-transparent text-navy/35 hover:text-navy/60'}`}>
            Practice — {overallWeakness}
          </button>
        </div>
      )}

      {/* Transcript / Write box */}
      <div className={`px-5 pt-4 pb-2${fullscreen ? ' flex-1 flex flex-col' : ''}`}>
        <div className={`relative bg-ivory/60 border border-line/70 overflow-hidden${fullscreen ? ' flex-1 flex flex-col' : ''}`}>
          {activeTab !== 'practice' && inputMode === 'write' ? (
            <div className={`${transcriptHeight} flex flex-col relative`}>
              {!writeEditing && writeCorrection && writeCorrection.corrected?.trim() !== writeText.trim() ? (
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
                <textarea
                  ref={writeTextareaRef}
                  className="flex-1 w-full px-4 pt-4 pb-4 bg-transparent resize-none outline-none font-display text-[18px] leading-relaxed text-navy placeholder:text-navy/25 scroll-premium"
                  placeholder="Écrivez en français…"
                  spellCheck={false}
                  value={writeText}
                  onChange={(e) => { setWriteText(e.target.value); setWriteEditing(true); setWriteCorrection(null); }}
                  onBlur={() => {
                    if (writeCorrection && writeCorrection.corrected?.trim() !== writeText.trim()) {
                      setWriteEditing(false);
                    }
                  }}
                />
              )}
              {writeCorrecting && (
                <div className="absolute bottom-2 right-3 pointer-events-none">
                  <CorrectionLoading />
                </div>
              )}
            </div>
          ) : activeTab !== 'practice' ? (
          <div ref={scrollRef} className={`scroll-premium px-4 pt-4 pb-4 ${transcriptHeight} overflow-y-auto`}>
            {hasContent ? (
              <>
                <p className="font-display text-[20px] leading-relaxed text-navy" spellCheck={false}>
                  {utterances.map((utt, idx) => {
                    const isLast = idx === utterances.length - 1;
                    const uttWords = utt.words ?? [];

                    const isWordActive = (i) => {
                      if (playbackTime === null || uttWords.length === 0) return false;
                      const w = uttWords[i];
                      if (!w) return false;
                      const nextStart = uttWords[i + 1]?.start;
                      return playbackTime >= w.start
                        && playbackTime < (nextStart ?? (w.end != null ? w.end + 0.1 : utt.endTime + 0.5));
                    };

                    const uttActive = uttWords.length === 0
                      && utt.endTime > utt.startTime
                      && playbackTime !== null
                      && playbackTime >= utt.startTime
                      && playbackTime <= utt.endTime + 0.5;

                    const seekTo = (time) => {
                      if (!audioRef.current || !audioUrl) return;
                      audioRef.current.currentTime = time;
                      setPlaybackTime(time);
                      if (!isPlaying) {
                        audioRef.current.play();
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
                              ...(isWordActive(i) ? { color: '#8B1E2D', fontWeight: 600 } : undefined),
                            }}
                          >
                            {w.punctuated_word ?? w.word}{' '}
                          </span>
                        ))
                      : <span style={uttActive ? { color: '#8B1E2D', fontWeight: 600 } : undefined}>{utt.text}{' '}</span>;

                    return (
                      <React.Fragment key={utt.id}>
                        {wordSpans}
                        {isLast && settledText && <span className="text-navy/50">{settledText}{' '}</span>}
                        {isLast && partialTranscript && (() => {
                          const ws = partialTranscript.trim().split(/\s+/).filter(Boolean);
                          const stable = ws.slice(0, stableWordCount).join(' ');
                          const live = ws.slice(stableWordCount).join(' ');
                          return (
                            <>
                              {stable && <span className="text-navy/50">{stable}{' '}</span>}
                              {live && <span className="text-navy/30 italic">{live}</span>}
                            </>
                          );
                        })()}
                      </React.Fragment>
                    );
                  })}

                  {utterances.length === 0 && (
                    <>
                      {settledText && <span className="text-navy/50">{settledText}{' '}</span>}
                      {partialTranscript && (() => {
                        const ws = partialTranscript.trim().split(/\s+/).filter(Boolean);
                        const stable = ws.slice(0, stableWordCount).join(' ');
                        const live = ws.slice(stableWordCount).join(' ');
                        return (
                          <>
                            {stable && <span>{stable}{' '}</span>}
                            {live && <span className="text-navy/35 italic">{live}</span>}
                          </>
                        );
                      })()}
                    </>
                  )}
                </p>
              </>
            ) : (!isLive || !hadContentRef.current) && (
              <p className="font-display text-[20px] leading-relaxed text-navy/30">
                {isLive ? 'Start speaking…' : 'Press the mic to speak'}
              </p>
            )}

          </div>
          ) : null}

          {/* Practice tab */}
          {activeTab === 'practice' && (
            <div className="px-4 pt-3 pb-4 border-t border-line/50 space-y-4">
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
                    const allDone = practiceExercises.every((_, i) => completedInBatch.has(i));
                    const anyAt100 = Object.values(skillProgress).some((p) => p >= 100);
                    const goalKey = practiceExercises[0]?.objective || overallWeakness || 'general';
                    const goalPct = skillProgress[goalKey] ?? 0;
                    return (
                      <>
                        <div className="flex items-center justify-between pb-1 border-b border-line/40">
                          <span className="text-[13px] text-navy/60">
                            <span className="text-[10px] tracking-widest uppercase text-navy/35 mr-1.5">Goal</span>
                            {practiceExercises[0]?.objective || overallWeakness}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1 bg-navy/10 rounded-full overflow-hidden">
                              <div className="h-full bg-wine/60 rounded-full transition-all duration-500" style={{ width: `${Math.min(goalPct, 100)}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-navy/40 tabular-nums">{goalPct}%</span>
                          </div>
                        </div>
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
            </div>
          )}

          {/* Speak correction panel */}
          {(fetchingCorrection || speakCorrection) && (
            <div className="border-t border-line/50 px-4 py-3">
              {fetchingCorrection ? <CorrectionLoading /> : speakCorrection?.corrected && speakCorrection.corrected.trim() !== utterances.map((u) => u.text).join(' ').trim() ? (
                <CorrectionBlock
                  original={utterances.map((u) => u.text).join(' ')}
                  corrected={speakCorrection.corrected}
                  className="font-display text-[18px] leading-relaxed text-navy"
                />
              ) : speakCorrection ? (
                <span className="text-[12px] text-navy/35 tracking-wide">✓ Looks good</span>
              ) : null}
            </div>
          )}

          {/* Level assessment panel */}
          {(assessingLevel || overallLevel) && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="border-t border-line/50 px-6 py-5"
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

        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-5 pb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!overallLevel && !assessingLevel && (() => {
            const wordCount = inputMode === 'write'
              ? writeText.trim().split(/\s+/).filter(Boolean).length
              : utterances.reduce((n, u) => n + u.text.trim().split(/\s+/).length, 0);
            const ready = wordCount >= 100;
            const wordsLeft = Math.max(0, 100 - wordCount);
            return (
              <div className="flex items-center gap-2">
                <button type="button" onClick={assessOverallLevel} disabled={!ready}
                  title={!ready ? `${wordsLeft} more words needed` : undefined}
                  className={`text-[10px] tracking-widest uppercase px-3 py-1.5 border transition-all ${
                    ready
                      ? 'border-wine text-navy bg-wine/5 hover:bg-wine/10 cursor-pointer'
                      : 'border-navy/15 text-navy/25 cursor-not-allowed'
                  }`}>
                  {ready ? 'Assess my level' : `Assess my level (${wordsLeft} words required)`}
                </button>
                {!ready && utterances.length > 0 && (
                  <button type="button" onClick={assessOverallLevel}
                    className="text-[9px] tracking-widest uppercase text-navy/25 hover:text-navy/50 transition-colors">
                    bypass
                  </button>
                )}
              </div>
            );
          })()}
          {(inputMode === 'write' ? writeText.trim().length > 0 : hasContent && !isLive) && (
            <button type="button" onClick={resetTranscript}
              className="text-[10px] tracking-widest uppercase text-navy/30 hover:text-navy/60 transition-colors">
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-2">
          {inputMode === 'speak' && audioUrl && !isLive && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] tracking-widest uppercase text-navy/30">play my audio</span>
              <button type="button" onClick={togglePlayback}
                className="relative w-9 h-9 rounded-full border border-navy/20 text-navy/50 hover:border-navy/40 hover:text-navy/80 inline-flex items-center justify-center transition-colors"
                aria-label="Play recording">
                {isPlaying ? (
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="2" y="2" width="4" height="10" rx="1" fill="currentColor" />
                    <rect x="8" y="2" width="4" height="10" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden>
                    <path d="M1 1l8 5-8 5V1z" fill="currentColor" />
                  </svg>
                )}
              </button>
            </div>
          )}
          {inputMode === 'write' && <button type="button" onClick={correctWriting} disabled={writeCorrecting}
            className="relative w-9 h-9 rounded-full bg-wine hover:bg-wine2 disabled:opacity-60 inline-flex items-center justify-center transition-colors"
            aria-label="Correct">
            {writeCorrecting ? (
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="2" y="2" width="4" height="10" rx="1" fill="#F6F1E8" />
                <rect x="8" y="2" width="4" height="10" rx="1" fill="#F6F1E8" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 7.5l3.5 3.5 6.5-7" stroke="#F6F1E8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>}
          {inputMode === 'speak' && <button type="button" onClick={toggleRecording} disabled={status === 'connecting'}
            className="relative w-9 h-9 rounded-full bg-wine hover:bg-wine2 disabled:opacity-60 inline-flex items-center justify-center transition-colors"
            aria-label="Toggle recording">
            {isRecording ? (
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="2" y="2" width="10" height="10" rx="1.5" fill="#F6F1E8" />
              </svg>
            ) : (
              <svg width="11" height="14" viewBox="0 0 16 20" fill="none" aria-hidden>
                <rect x="5" y="1" width="6" height="11" rx="3" fill="#F6F1E8" />
                <path d="M2 9.5a6 6 0 0012 0M8 16v3" stroke="#F6F1E8" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
            {isRecording && <span className="absolute inset-0 rounded-full border border-wine animate-ping opacity-50" />}
          </button>}
          </div>
        </div>
      </div>

      {error && <p className="px-5 pb-2 text-[12px] text-wine">{error}</p>}
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

export default function Hero() {
  const navigate = useNavigate();

  const goToDashboard = (topic) => {
    const url = topic ? `/dashboard?topic=${encodeURIComponent(topic)}` : '/dashboard';
    window.open(url, '_blank');
  };

  return (
    <section className="relative pt-12 pb-12 min-h-screen overflow-hidden flex items-center">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 80% 30%, rgba(217,196,162,0.30), transparent 60%), linear-gradient(180deg, #F6F1E8 0%, #F2EBDA 100%)' }} />
        <img src="/assets/paris-skyline.png" alt=""
          className="absolute right-0 bottom-0 w-[1280px] max-w-[70%] object-contain object-bottom-right select-none"
          style={{ opacity: 0.85, mixBlendMode: 'multiply' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #F2EBDA 0%, #F2EBDA 15%, rgba(242,235,218,0.96) 28%, rgba(242,235,218,0.82) 40%, rgba(242,235,218,0.55) 55%, rgba(242,235,218,0.2) 70%, rgba(242,235,218,0.0) 82%)' }} />
      </div>

      <Container className="relative">
        <div className="grid lg:grid-cols-[1fr_1.5fr] gap-8 items-center h-[calc(100vh-96px)]">
          <div className="relative flex flex-col justify-center">
            <h1 className="font-display text-[48px] leading-[0.95] tracking-[-0.015em] text-navy">
              <Reveal delay={0.08}>Correct your French</Reveal>
              <Reveal delay={0.18} className="text-wine italic">Instantanément.</Reveal>
            </h1>
            <Reveal delay={0.3}>
              <p className="mt-6 max-w-[400px] text-[15px] leading-[1.6] text-navy/70">
                Transcriby listens as you speak and corrects your French in real time —
                helping you express yourself with fluency and confidence.
              </p>
            </Reveal>
            <Reveal delay={0.42}>
              <div className="mt-8 flex items-center gap-3">
                <ButtonPrimary onClick={() => goToDashboard()}>Assess your level for free</ButtonPrimary>
                <ButtonGhost>Watch the demo</ButtonGhost>
              </div>
            </Reveal>
            <Reveal delay={0.5}>
              <div className="mt-8 flex items-center gap-5">
                <div className="flex -space-x-2.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="w-9 h-9 rounded-full ring-2 ring-ivory overflow-hidden"
                      style={{ background: ['linear-gradient(135deg,#C9A0A8,#8B1E2D)','linear-gradient(135deg,#D9D2C2,#1A2340)','linear-gradient(135deg,#EFE8DA,#8B1E2D)','linear-gradient(135deg,#1A2340,#C9A0A8)'][i] }} />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3].map((i) => <Star key={i} filled size={13} />)}
                    <Star filled={false} size={13} />
                  </div>
                  <p className="text-[12px] text-navy/65 mt-0.5">
                    <span className="text-navy font-medium">4.9/5</span> from over 2,000 learners
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="flex items-center justify-end h-full">
            <AudioDemoCard onOpenFullscreen={(topic) => goToDashboard(topic)} />
          </div>
        </div>
      </Container>
    </section>
  );
}
