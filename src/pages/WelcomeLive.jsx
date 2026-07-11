// Parisly "live" welcome landing — /welcome
//
// The student is greeted by the MOVING avatar (3D head, blinking + lip-synced
// to Rémi's real ElevenLabs voice) in a cinematic box, with the exact same
// chatbox engine as the classic landing page directly underneath.
//
// Nothing here replaces the classic landing at "/" — this is an additional
// page, built as the main visual for the GPT live. The exercise wiring
// (reading / listening / speaking / writing fetches + tab triggers) is
// mirrored 1:1 from Hero.jsx so every chatbox tab behaves identically; when a
// challenge is active its panel takes the avatar box's spot (same swap the
// landing does with its headline).
//
// Lip-sync is free: every narrator line the chatbox plays goes through
// connectNarratorSource → tapSource, which feeds the shared analyser the 3D
// head reads each frame. So whenever Rémi talks in the chat, the avatar's
// mouth moves — zero changes to the chat engine.

import React from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  AudioDemoCard,
  ReadingArticlePanel,
  ListeningPanel,
  SpeakingChallengePanel,
  WritingChallengePanel,
  nextLevel,
  allTipsFulfilled,
  THEME_ARTICLE_TOTAL,
  THEME_CHALLENGE_TOTAL,
  DEFI_COMPLETE_XP,
} from '../components/Hero';
import { Logo } from '../components/atoms';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { getEffectiveLevel } from '../lib/learnerProfile';
import { fetchNarratorAudio, connectNarratorSource } from '../lib/narratorAudio';
import { buildWordTimings, playDecodedBuffer } from '../lib/speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';
import { startLine, setPlaybackTime as setLipSyncTime, stopLine } from '../lib/lipSync';
import { NarratorHoverText } from '../lib/NarratorHoverText';

// Lazy so Three.js loads only on this page, never weighing down the main bundle.
const TalkingAvatar3D = React.lazy(() => import('../components/TalkingAvatar3D'));
const AVATAR_SRC = '/avatars/avaturn.glb';

const WELCOME_LINE = {
  narrator: 'lea',
  text: "Bienvenue sur Parisly ! Moi, c'est Léa. Parle-moi ou écris-moi en français juste en dessous — je t'écoute !",
  translation: "Welcome to Parisly! I'm Léa. Speak or write to me in French just below — I'm listening!",
};

export default function WelcomeLive() {
  const { effectiveLevel, profile, spendExperience, gainExperience, dailyParisianPoints } = useLearnerProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [heroActiveTab, setHeroActiveTab] = React.useState('transcript');
  // Rémi's latest spoken line from the chatbox — shown in the avatar's bubble.
  const [leaSpeech, setLeaSpeech] = React.useState(null); // { text, narratorId } | null
  const learnMode = searchParams.get('learn');
  const learnLevel = searchParams.get('level');
  const practiceTopic = searchParams.get('practice');
  const practiceType = searchParams.get('ptype');

  const [exerciseSubTab, setExerciseSubTab] = React.useState('comprehension');

  // ── Welcome voice + avatar speaking state ──────────────────────────────────
  const [avatarSpeaking, setAvatarSpeaking] = React.useState(false);
  const [speechPlaybackTime, setSpeechPlaybackTime] = React.useState(null);
  const [speechTimings, setSpeechTimings] = React.useState([]);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);
  const hasWelcomedRef = React.useRef(false);

  const stopWelcomeAudio = React.useCallback(() => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    stopLine(); // reset the avatar mouth
    setAvatarSpeaking(false);
    setSpeechPlaybackTime(null);
    setSpeechTimings([]);
  }, []);

  // Chatbox playback stops the welcome line (and vice-versa) — no overlap.
  React.useEffect(() => registerSiteAudioStop(stopWelcomeAudio), [stopWelcomeAudio]);

  const playWelcomeLine = React.useCallback(async () => {
    const siteSession = beginSiteAudioPlayback();
    sessionRef.current += 1;
    const session = sessionRef.current;
    const isActive = () => sessionRef.current === session && isSiteAudioPlaybackCurrent(siteSession);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') {
        // Autoplay may be blocked before the first tap — resume() then hangs.
        // Race a short timeout and bail (silently) if the context never runs;
        // the once-per-page pointerdown fallback retries inside a real gesture.
        await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 350))]);
      }
      if (ctx.state !== 'running') { hasWelcomedRef.current = false; return; }
      if (!isActive()) return;

      setAvatarSpeaking(true);
      setLeaSpeech({ text: WELCOME_LINE.text, narratorId: 'lea', translation: WELCOME_LINE.translation });
      setSpeechPlaybackTime(0);

      const buf = await fetchNarratorAudio(WELCOME_LINE.text, WELCOME_LINE.narrator);
      if (!isActive()) return;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      if (!isActive()) return;

      setSpeechTimings(buildWordTimings(WELCOME_LINE.text, decoded.duration));
      startLine(WELCOME_LINE.text, decoded.duration); // drive the mouth shapes
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: WELCOME_LINE.narrator,
        sourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (!isActive()) return;
          setSpeechPlaybackTime(t);
          setLipSyncTime(t);
          if (t == null) {
            setSpeechPlaybackTime(null);
            setSpeechTimings([]);
          }
        },
      });
    } catch {
      // Audio unavailable — the text stays readable in the bubble.
    } finally {
      if (sessionRef.current === session) {
        stopLine();
        setAvatarSpeaking(false);
        setSpeechPlaybackTime(null);
        setSpeechTimings([]);
      }
    }
  }, []);

  // Auto-welcome: try right away (works when the browser allows audio), and
  // fall back to the student's first tap/click anywhere on the page.
  React.useEffect(() => {
    const tryWelcome = () => {
      if (hasWelcomedRef.current) return;
      hasWelcomedRef.current = true;
      playWelcomeLine();
    };
    const t = window.setTimeout(tryWelcome, 600);
    window.addEventListener('pointerdown', tryWelcome);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', tryWelcome);
      stopWelcomeAudio();
    };
  }, [playWelcomeLine, stopWelcomeAudio]);

  // ── Exercise wiring — mirrored from Hero.jsx so every tab works the same ──
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
  const [articleIndex, setArticleIndex] = React.useState(1);
  const [exerciseTabsDone, setExerciseTabsDone] = React.useState(0);

  const loadedReadingTopicRef = React.useRef(null);
  const loadedListeningTopicRef = React.useRef(null);
  const loadedSpeakingTopicRef = React.useRef(null);
  const loadedWritingTopicRef = React.useRef(null);
  const discoverWordRef = React.useRef(null);

  React.useEffect(() => {
    if (practiceType === 'reading' && practiceTopic && loadedReadingTopicRef.current !== practiceTopic) {
      loadedReadingTopicRef.current = practiceTopic;
      setReadingActive(true);
      setReadingTopic(practiceTopic);
      setReadingLoading(true);
      setArticleIndex(1);
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

  const [listeningActive, setListeningActive] = React.useState(false);
  const [listeningLoading, setListeningLoading] = React.useState(false);
  const [listeningTopic, setListeningTopic] = React.useState('');
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
      setListeningTopic(practiceTopic);
      setArticleIndex(1);
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

  const loadNextReadingArticle = React.useCallback(() => {
    setReadingLoading(true);
    setArticleIndex((n) => Math.min(THEME_ARTICLE_TOTAL, n + 1));
    fetch('/api/reading', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: readingTopic || practiceTopic || 'la vie parisienne' }),
    })
      .then((r) => r.json())
      .then((data) => {
        setReadingPassage(data.passage || '');
        setReadingTitle(data.title || '');
        setReadingSource(data.source || null);
        setReadingAuthor(data.author || null);
        setReadingDate(data.date || null);
        setExerciseSubTab('comprehension');
        setReadingQuestions(data.questions || []);
        setReadingVocab(data.vocab || []);
        setReadingGrammar(data.grammar || []);
        setReadingConjugation(data.conjugation || []);
        setReadingLoading(false);
      })
      .catch(() => setReadingLoading(false));
  }, [readingTopic, practiceTopic]);

  const loadNextListeningEpisode = React.useCallback(() => {
    setListeningLoading(true);
    setArticleIndex((n) => Math.min(THEME_ARTICLE_TOTAL, n + 1));
    fetch('/api/listening', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: practiceTopic || 'la vie parisienne', learnerLevel: effectiveLevel || 'B1' }),
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
        setExerciseSubTab('comprehension');
        setListeningQuestions(data.questions || []);
        setListeningVocab(data.vocab || []);
        setListeningGrammar(data.grammar || []);
        setListeningConjugation(data.conjugation || []);
        setListeningLoading(false);
      })
      .catch(() => setListeningLoading(false));
  }, [practiceTopic, effectiveLevel]);

  const [speakingActive, setSpeakingActive] = React.useState(false);
  const [speakingLoading, setSpeakingLoading] = React.useState(false);
  const [speakingNarrator, setSpeakingNarrator] = React.useState('lea');
  const [speakingOpeningLine, setSpeakingOpeningLine] = React.useState('');
  const [speakingOpeningTranslation, setSpeakingOpeningTranslation] = React.useState('');
  const [speakingTopicLabel, setSpeakingTopicLabel] = React.useState('');
  const [speakingTargetGrammar, setSpeakingTargetGrammar] = React.useState(null);
  const [speakingTargetVocab, setSpeakingTargetVocab] = React.useState(null);
  const [speakingUsedVocab, setSpeakingUsedVocab] = React.useState([]);
  const [speakingUsedGrammar, setSpeakingUsedGrammar] = React.useState(false);
  const [speakingChallengeIndex, setSpeakingChallengeIndex] = React.useState(1);

  React.useEffect(() => {
    if (practiceType === 'speaking' && practiceTopic && loadedSpeakingTopicRef.current !== practiceTopic) {
      loadedSpeakingTopicRef.current = practiceTopic;
      setSpeakingActive(true);
      setSpeakingLoading(true);
      setSpeakingChallengeIndex(1);
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

  const loadNewSpeakingChallenge = React.useCallback(() => {
    setSpeakingLoading(true);
    setSpeakingUsedVocab([]);
    setSpeakingUsedGrammar(false);
    setSpeakingChallengeIndex((n) => Math.min(THEME_CHALLENGE_TOTAL, n + 1));
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

  const [writingActive, setWritingActive] = React.useState(false);
  const [writingLoading, setWritingLoading] = React.useState(false);
  const [writingPrompt, setWritingPrompt] = React.useState('');
  const [writingTips, setWritingTips] = React.useState({ vocab: [], expressions: [], grammar: [], conjugation: [], connecteurs: [] });
  const [writingWordTarget, setWritingWordTarget] = React.useState(80);
  const [writingNarrator, setWritingNarrator] = React.useState('lea');
  const [writingUsedTips, setWritingUsedTips] = React.useState({});
  const [writingBadge, setWritingBadge] = React.useState(null);
  const writingAwardedRef = React.useRef(false);
  const [writingChallengeIndex, setWritingChallengeIndex] = React.useState(1);

  const handleWritingProgress = React.useCallback((usedTips) => {
    setWritingUsedTips(usedTips || {});
    if (!writingAwardedRef.current && allTipsFulfilled(writingTips, usedTips)) {
      writingAwardedRef.current = true;
      const before = effectiveLevel;
      const updated = gainExperience(DEFI_COMPLETE_XP);
      const after = getEffectiveLevel(updated);
      setWritingBadge({ level: after, leveledUp: after !== before });
    }
  }, [writingTips, effectiveLevel, gainExperience]);

  const resetWritingProgress = React.useCallback(() => {
    setWritingUsedTips({});
    setWritingBadge(null);
    writingAwardedRef.current = false;
  }, []);

  React.useEffect(() => {
    if (practiceType === 'writing' && practiceTopic && loadedWritingTopicRef.current !== practiceTopic) {
      loadedWritingTopicRef.current = practiceTopic;
      setWritingActive(true);
      setWritingLoading(true);
      resetWritingProgress();
      setWritingChallengeIndex(1);
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
    resetWritingProgress();
    setWritingChallengeIndex((n) => Math.min(THEME_CHALLENGE_TOTAL, n + 1));
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

  const goToDashboard = (topic) => {
    const url = topic ? `/dashboard?topic=${encodeURIComponent(topic)}` : '/dashboard';
    navigate(url);
  };

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

  // Auto-switch to the correct tab when arriving with ?ptype=…
  React.useEffect(() => {
    if (!practiceType) return;
    const tabMap = { listening: 'listening', reading: 'reading', writing: 'writing', speaking: 'speaking' };
    const tab = tabMap[practiceType];
    if (tab) setHeroActiveTab(tab);
  }, [practiceType]);

  // Trigger exercise generation when the student clicks an exercise tab directly.
  const tabTriggeredRef = React.useRef(new Set());
  const EXERCISE_TOPIC_POOLS = {
    reading: ['La vie parisienne', 'La gastronomie française', "L'actualité culturelle", 'Le sport en France', "L'environnement", 'La technologie au quotidien', 'Le cinéma français'],
    listening: ['La culture française', "L'histoire de France", 'La société française', 'La musique francophone', 'Le cinéma français', 'Les sciences au quotidien'],
    speaking: ['Mon quotidien à Paris', 'Les voyages', 'La cuisine et les restos', 'Le travail et les études', 'Les loisirs et le sport', "La famille et l'amitié", 'Les week-ends parfaits'],
    writing: ['Paris et ses secrets', 'Un souvenir de voyage', 'La vie de quartier', 'Les réseaux sociaux', 'Un dîner mémorable', 'Le métro parisien', 'Les saisons à Paris', 'Mon café préféré', 'Une rencontre inattendue'],
  };
  const defaultExerciseTopicsRef = React.useRef(null);
  if (!defaultExerciseTopicsRef.current) {
    defaultExerciseTopicsRef.current = Object.fromEntries(
      Object.entries(EXERCISE_TOPIC_POOLS).map(([k, pool]) => [k, pool[Math.floor(Math.random() * pool.length)]])
    );
  }
  const DEFAULT_EXERCISE_TOPICS = defaultExerciseTopicsRef.current;
  React.useEffect(() => {
    const type = heroActiveTab;
    if (!['reading', 'listening', 'speaking', 'writing'].includes(type)) return;
    if (tabTriggeredRef.current.has(type)) return;
    tabTriggeredRef.current.add(type);
    if (practiceType === type && practiceTopic) return;
    const topic = DEFAULT_EXERCISE_TOPICS[type];
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('practice', topic);
      next.set('ptype', type);
      return next;
    }, { replace: true });
  }, [heroActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to Chat: keep exercise state, clean the URL (same behavior as Hero).
  const prevHeroTabRef = React.useRef(heroActiveTab);
  React.useEffect(() => {
    const prev = prevHeroTabRef.current;
    prevHeroTabRef.current = heroActiveTab;
    const wasExercise = ['reading', 'listening', 'speaking', 'writing'].includes(prev);
    if (heroActiveTab !== 'transcript' || !wasExercise) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('practice');
      next.delete('ptype');
      return next;
    }, { replace: true });
  }, [heroActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const exercisePanelActive =
    (heroActiveTab === 'reading' && readingActive) ||
    (heroActiveTab === 'listening' && listeningActive) ||
    (heroActiveTab === 'speaking' && speakingActive) ||
    (heroActiveTab === 'writing' && writingActive);

  // What the avatar's bubble shows: her latest chat line, else the welcome line.
  const bubble = leaSpeech?.text
    ? leaSpeech
    : { text: WELCOME_LINE.text, translation: WELCOME_LINE.translation };
  const highlightWelcome = avatarSpeaking && bubble.text === WELCOME_LINE.text && speechPlaybackTime != null;

  return (
    // Une seule page, jamais de scroll : hauteur d'écran fixe, colonne flex.
    // L'avatar et sa bulle prennent le strict minimum, la carte de chat récupère
    // tout le reste (c'est là qu'on écrit) — surtout sur mobile.
    <section className="relative h-[100dvh] flex flex-col overflow-hidden">
      {/* Same Parisian paper backdrop as the classic landing */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 80% 30%, rgba(217,196,162,0.30), transparent 60%), linear-gradient(180deg, #F6F1E8 0%, #F2EBDA 100%)' }} />
        <img src="/assets/paris-skyline.jpg" alt=""
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

      <div className="relative flex flex-col flex-1 min-h-0 w-full max-w-[880px] mx-auto px-4">
        <header className="shrink-0 flex items-center justify-between pt-3 pb-2 sm:pt-5 sm:pb-3">
          <Logo />
          <Link to="/classic" className="text-[11px] font-mono uppercase tracking-widest text-navy/40 hover:text-wine transition-colors">
            Classic page →
          </Link>
        </header>

        <div className="flex flex-col items-center flex-1 min-h-0 gap-2 sm:gap-3 pb-3 sm:pb-4">
          {/* Challenge panel takes the avatar's spot while an exercise is active
              (same swap the classic landing does with its headline). */}
          {exercisePanelActive ? (
            <div className="w-full">
              {heroActiveTab === 'reading' && readingActive && (
                <ReadingArticlePanel
                  loading={readingLoading}
                  title={readingTitle}
                  theme={readingTopic || practiceTopic || ''}
                  passage={readingPassage}
                  source={readingSource}
                  author={readingAuthor}
                  date={readingDate}
                  vocab={readingVocab}
                  parisianPercent={profile?.parisianPercent ?? 0}
                  dailyParisianPoints={dailyParisianPoints}
                  onSpendExperience={spendExperience}
                  doneTabs={exerciseTabsDone}
                  articleIndex={articleIndex}
                  onNextArticle={loadNextReadingArticle}
                  targetLevel={nextLevel(effectiveLevel) || effectiveLevel}
                />
              )}
              {heroActiveTab === 'listening' && listeningActive && (
                <ListeningPanel
                  loading={listeningLoading}
                  title={listeningTitle}
                  theme={listeningTopic || practiceTopic || ''}
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
                  doneTabs={exerciseTabsDone}
                  articleIndex={articleIndex}
                  onNextArticle={loadNextListeningEpisode}
                  targetLevel={nextLevel(effectiveLevel) || effectiveLevel}
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
                  challengeIndex={speakingChallengeIndex}
                  onNextChallenge={loadNewSpeakingChallenge}
                />
              )}
              {heroActiveTab === 'writing' && writingActive && (
                <WritingChallengePanel
                  loading={writingLoading}
                  prompt={writingPrompt}
                  theme={practiceTopic || ''}
                  tips={writingTips}
                  wordTarget={writingWordTarget}
                  narratorId={writingNarrator}
                  usedTips={writingUsedTips}
                  badge={writingBadge}
                  onNewChallenge={loadNewWritingChallenge}
                  challengeIndex={writingChallengeIndex}
                />
              )}
            </div>
          ) : (
            <div className="w-full max-w-[680px] shrink-0">
              {/* The moving avatar. Deliberately small — the speech box below is
                  where the student actually works, so the portrait gets the
                  leftovers, not the other way round. Tiny on mobile by design. */}
              <div className={`relative w-full h-[17vh] max-h-[150px] min-h-[104px] sm:h-[24vh] sm:max-h-[240px] sm:min-h-[160px] rounded-2xl sm:rounded-[28px] overflow-hidden bg-ivory2 border transition-all duration-300 ${
                avatarSpeaking
                  ? 'border-wine/40 ring-[3px] ring-wine/70 shadow-[0_28px_72px_-18px_rgba(139,30,45,0.38)]'
                  : 'border-line/70 ring-1 ring-line/40 shadow-[0_24px_64px_-24px_rgba(26,35,64,0.32)]'
              }`}>
                {/* Paris behind her. Deliberately STYLIZED and defocused, never a
                    photo: a sharp photograph behind a CGI face is what makes these
                    heads look pasted-on. Softened + pushed back, it reads as depth.
                    Layers, back to front: warm sky → skyline → key light from the
                    upper right (same side as the 3D directional light, so her lit
                    cheek matches the brightest part of the room) → vignette. */}
                <div className="absolute inset-0" aria-hidden>
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #F7E9D6 0%, #EFD8C3 45%, #E0C0AC 100%)' }} />
                  <img
                    src="/assets/paris-skyline.jpg"
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover object-bottom select-none"
                    style={{
                      transform: 'scale(1.45) translateX(-13%)',
                      transformOrigin: '50% 100%',
                      filter: 'saturate(0.95) contrast(1.32) brightness(0.94)',
                      mixBlendMode: 'multiply',
                      opacity: 1,
                    }}
                  />
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(66% 62% at 76% 16%, rgba(255,232,197,0.62), rgba(255,232,197,0) 62%)' }} />
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(78% 74% at 50% 46%, rgba(60,42,36,0) 38%, rgba(60,42,36,0.30) 100%)' }} />
                </div>

                <div className="absolute inset-0">
                  <React.Suspense fallback={
                    <img src="/assets/lea.jpg" alt="Léa" className="w-full h-full object-cover object-top" />
                  }>
                    <TalkingAvatar3D src={AVATAR_SRC} controls={false} />
                  </React.Suspense>
                </div>

                {/* Name pill */}
                <div className="absolute z-10 bottom-3.5 left-4 rounded-full bg-navy/70 backdrop-blur-sm px-3 py-1.5">
                  <span className="font-display text-[12.5px] text-ivory">
                    Léa <span className="text-ivory/60">· ta prof de français à Paris</span>
                  </span>
                </div>

                {/* Replay the welcome */}
                <button
                  type="button"
                  onClick={() => { if (avatarSpeaking) stopWelcomeAudio(); else playWelcomeLine(); }}
                  className="absolute z-10 bottom-3 right-3.5 w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm border border-wine/25 text-wine hover:text-wine2 hover:border-wine/50 flex items-center justify-center shadow-sm transition-colors"
                  aria-label={avatarSpeaking ? 'Stop' : 'Replay the welcome'}
                  aria-pressed={avatarSpeaking}
                >
                  {avatarSpeaking ? (
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="2" y="2" width="10" height="10" rx="1.5" /></svg>
                  ) : (
                    <svg width="9" height="11" viewBox="0 0 10 12" fill="currentColor" aria-hidden><path d="M0 0 L10 6 L0 12 Z" /></svg>
                  )}
                </button>
              </div>

              {/* Her speech bubble — the welcome line, then whatever she says in chat */}
              <div className={`relative mt-3 rounded-2xl border px-4 py-3 transition-colors duration-300 ${
                avatarSpeaking ? 'bg-wine/5 border-wine/20' : 'bg-white/90 border-line/60'
              } shadow-sm`}>
                <span className={`absolute -top-1 left-10 w-2.5 h-2.5 rotate-45 border-l border-t ${
                  avatarSpeaking ? 'bg-[#FBF6F0] border-wine/20' : 'bg-white/90 border-line/60'
                }`} aria-hidden />
                {bubble.text === WELCOME_LINE.text ? (
                  <NarratorHoverText
                    text={WELCOME_LINE.text}
                    translation={WELCOME_LINE.translation}
                    highlightSpeech={highlightWelcome}
                    speechPlaybackTime={speechPlaybackTime}
                    speechTimings={speechTimings}
                    className="font-display text-[15.5px] sm:text-[17px] italic leading-snug text-navy/85"
                    wrapperClassName="relative w-full"
                  />
                ) : (
                  <p className="font-display text-[15.5px] sm:text-[17px] italic leading-snug text-navy/85">{bubble.text}</p>
                )}
              </div>
            </div>
          )}

          {/* The chatbox — the exact same engine as the classic landing */}
          <div className={`relative w-full max-w-[680px] ${exercisePanelActive ? 'h-[calc(100dvh-205px)]' : 'h-[440px] sm:h-[500px]'}`}>
            <AudioDemoCard
              tall={exercisePanelActive}
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
              onNextArticle={heroActiveTab === 'listening' ? loadNextListeningEpisode : loadNextReadingArticle}
              onExercisesProgress={setExerciseTabsDone}
              articleIndex={articleIndex}
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
              onWritingProgress={handleWritingProgress}
              onNewWritingChallenge={loadNewWritingChallenge}
              discoverWordRef={discoverWordRef}
              onLeaSpeak={setLeaSpeech}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
