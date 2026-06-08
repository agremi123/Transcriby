import React from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import {
  getLevelBadgeSrc,
  isProfileSetupComplete,
  needsWelcomeOnboarding,
} from '../lib/learnerProfile';
import { LEVEL_PICKER, WELCOME_LEVEL_LINES, JULES_LEVEL_PICKER_LINE, getLevelPickMockery } from '../lib/narratorLevelAdapt';
import { fetchNarratorAudio, connectNarratorSource, NARRATORS } from '../lib/narratorAudio';
import { buildWordTimings, playDecodedBuffer } from '../lib/speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';
import { NarratorHoverText } from '../lib/NarratorHoverText';
import { Logo, NAV_CTA_CLASS } from './atoms';

const BADGE_IMG_CLASS =
  'w-[140px] h-[140px] sm:w-[168px] sm:h-[168px] object-contain object-center pointer-events-none';
const SELECTED_BADGE_LAYOUT = 'selected-welcome-badge';

const WELCOME_LINES_BY_NARRATOR = Object.fromEntries(
  WELCOME_LEVEL_LINES.map((line) => [line.narrator, line]),
);

export default function WelcomeOnboarding() {
  const { profile, completeOnboarding } = useLearnerProfile();
  const [pickedLevel, setPickedLevel] = React.useState(profile.claimedLevel);
  const [levelLocked, setLevelLocked] = React.useState(false);
  const [showLevelPicker, setShowLevelPicker] = React.useState(false);
  const [dialogueDone, setDialogueDone] = React.useState(true);
  const [showEmailForm, setShowEmailForm] = React.useState(false);
  const [returningEmailForm, setReturningEmailForm] = React.useState(false);
  const [emailInput, setEmailInput] = React.useState(profile.email || '');
  const [authError, setAuthError] = React.useState(null);
  const [linesByNarrator, setLinesByNarrator] = React.useState(WELCOME_LINES_BY_NARRATOR);
  const [activeSpeakingNarrator, setActiveSpeakingNarrator] = React.useState(null);
  const [playing, setPlaying] = React.useState(false);
  const [audioError, setAudioError] = React.useState(null);
  const [speechPlaybackTime, setSpeechPlaybackTime] = React.useState(null);
  const [speechTimings, setSpeechTimings] = React.useState([]);
  const [speechText, setSpeechText] = React.useState(null);
  const [showTranslationHint] = React.useState(false);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);
  const hasAutoPlayedRef = React.useRef(false);
  const hadCompletedOnboardingRef = React.useRef(false);

  const stopAudio = React.useCallback(() => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setPlaying(false);
    setActiveSpeakingNarrator(null);
    setSpeechPlaybackTime(null);
    setSpeechTimings([]);
    setSpeechText(null);
  }, []);

  React.useEffect(() => registerSiteAudioStop(stopAudio), [stopAudio]);

  const playNarratorLine = React.useCallback(async (line) => {
    const siteSession = beginSiteAudioPlayback();
    sessionRef.current += 1;
    const session = sessionRef.current;
    setAudioError(null);
    setPlaying(true);
    setActiveSpeakingNarrator(line.narrator);
    setSpeechText(line.text);
    setSpeechPlaybackTime(0);

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

      setSpeechTimings(buildWordTimings(line.text, decoded.duration));
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: line.narrator,
        sourceRef,
        connectSource: connectNarratorSource,
        playbackSession: siteSession,
        onTimeUpdate: (t) => {
          if (!isActive()) return;
          setSpeechPlaybackTime(t);
          if (t == null) {
            setSpeechPlaybackTime(null);
            setSpeechTimings([]);
          }
        },
      });
    } catch {
      if (isActive()) setAudioError('Audio unavailable — read the text on screen.');
    } finally {
      if (isActive()) {
        setPlaying(false);
        setActiveSpeakingNarrator(null);
        setSpeechText(null);
        setSpeechPlaybackTime(null);
        setSpeechTimings([]);
      }
    }
  }, [stopAudio]);

  const playWelcomeLines = React.useCallback(async () => {
    setLinesByNarrator(WELCOME_LINES_BY_NARRATOR);
    setDialogueDone(false);
    const siteSession = beginSiteAudioPlayback();
    sessionRef.current += 1;
    const session = sessionRef.current;
    setAudioError(null);
    setPlaying(true);

    const isActive = () => sessionRef.current === session && isSiteAudioPlaybackCurrent(siteSession);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (!isActive()) return;

      for (let i = 0; i < WELCOME_LEVEL_LINES.length; i += 1) {
        if (!isActive()) return;
        const line = WELCOME_LEVEL_LINES[i];
        setActiveSpeakingNarrator(line.narrator);
        setSpeechText(line.text);
        setSpeechPlaybackTime(0);

        const buf = await fetchNarratorAudio(line.text, line.narrator);
        if (!isActive()) return;
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        if (!isActive()) return;

        setSpeechTimings(buildWordTimings(line.text, decoded.duration));
        await playDecodedBuffer(ctx, {
          buffer: decoded,
          narrator: line.narrator,
          sourceRef,
          connectSource: connectNarratorSource,
          playbackSession: siteSession,
          onTimeUpdate: (t) => {
            if (!isActive()) return;
            setSpeechPlaybackTime(t);
            if (t == null) {
              setSpeechPlaybackTime(null);
              setSpeechTimings([]);
            }
          },
        });
      }
    } catch {
      if (isActive()) setAudioError('Audio unavailable — read the text on screen.');
    } finally {
      if (isActive()) {
        setPlaying(false);
        setActiveSpeakingNarrator(null);
        setSpeechText(null);
        setSpeechPlaybackTime(null);
        setSpeechTimings([]);
        setDialogueDone(true);
      }
    }
  }, []);

  React.useEffect(() => {
    const needs = needsWelcomeOnboarding(profile);
    if (!needs && isProfileSetupComplete(profile)) {
      hadCompletedOnboardingRef.current = true;
    }
    if (needs && hadCompletedOnboardingRef.current) {
      hadCompletedOnboardingRef.current = false;
      hasAutoPlayedRef.current = false;
    }
  }, [profile]);

  React.useEffect(() => {
    if (!needsWelcomeOnboarding(profile) || hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    const t = window.setTimeout(() => { playWelcomeLines(); }, 400);
    // Fallback: show the CTA even if audio never plays / is blocked
    const fallback = window.setTimeout(() => { setDialogueDone(true); }, 6000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(fallback);
      stopAudio();
    };
  }, [profile, playWelcomeLines, stopAudio]);

  React.useEffect(() => {
    if (needsWelcomeOnboarding(profile)) {
      setPickedLevel(profile.claimedLevel);
      setLevelLocked(false);
      setShowLevelPicker(false);
      setShowEmailForm(false);
      setEmailInput(profile.email || '');
      setAuthError(null);
    }
  }, [profile.claimedLevel, profile.email, profile.onboardingComplete]);

  React.useEffect(() => () => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
  }, []);

  const finishOnboarding = React.useCallback((authMethod, { email, name } = {}) => {
    if (!pickedLevel) return;
    stopAudio();
    completeOnboarding(pickedLevel, { authMethod, email, name });
  }, [pickedLevel, stopAudio, completeOnboarding]);

  if (!needsWelcomeOnboarding(profile)) return null;

  const handleLevelPick = (levelId) => {
    if (levelLocked) return;
    setAuthError(null);
    setPickedLevel(levelId);
    setLevelLocked(true);
    const reaction = getLevelPickMockery(levelId);
    setLinesByNarrator((prev) => ({
      ...prev,
      [reaction.narrator]: reaction,
    }));
    playNarratorLine(reaction);
  };

  const handleGoogleConnect = async () => {
    setAuthError(null);
    if (pickedLevel) {
      const { saveLearnerProfile, loadLearnerProfile } = await import('../lib/learnerProfile');
      saveLearnerProfile({ ...loadLearnerProfile(), claimedLevel: pickedLevel });
    }
    const { supabase } = await import('../lib/supabaseClient');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  };

  const handleEmailContinue = (e) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError('Enter a valid email address.');
      return;
    }
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const name = (local.split(/\s+/)[0] || 'Ami').replace(/^\w/, (c) => c.toUpperCase());
    finishOnboarding('email', { email, name });
  };

  const handleReturningEmailContinue = (e) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError('Enter a valid email address.');
      return;
    }
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const name = (local.split(/\s+/)[0] || 'Ami').replace(/^\w/, (c) => c.toUpperCase());
    // Use existing level or default — skip level picker entirely
    stopAudio();
    completeOnboarding(profile.claimedLevel || 'B1', { authMethod: 'email', email, name });
  };

  const activeNarrator = activeSpeakingNarrator;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-[820px] max-h-[92vh] rounded-2xl border border-line/80 bg-paper shadow-[0_24px_64px_rgba(26,35,64,0.18)] overflow-y-auto"
        >
          <div className="px-6 sm:px-10 pt-6 pb-7">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <Logo className="shrink-0 pointer-events-none" />
              <a href="https://kruremi.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                <img src="/assets/remi-avatar.png" alt="Kru Rémi" className="w-11 h-11 rounded-full object-cover object-top ring-2 ring-wine/60 group-hover:ring-wine transition-all shrink-0" />
                <span className="font-display text-[14px] italic text-navy/60 leading-none whitespace-nowrap">
                  by <span className="text-navy font-semibold not-italic group-hover:text-wine transition-colors">Kru Rémi</span> · certified French teacher
                </span>
              </a>
            </div>

            {/* Narrator portraits row */}
            {/* Phase 1: only Léa, centered */}
            {!showLevelPicker && !levelLocked && (() => {
              const id = 'lea';
              const n = NARRATORS[id];
              const line = linesByNarrator[id] || WELCOME_LINES_BY_NARRATOR[id];
              const isSpeaking = activeNarrator === id;
              const highlightSpeech = isSpeaking && speechText === line.text && speechPlaybackTime != null;
              return (
                <div className="flex flex-col items-center gap-3 mb-6 max-w-[400px] mx-auto">
                  <div className={`relative w-[120px] h-[120px] sm:w-[150px] sm:h-[150px] rounded-full overflow-hidden shadow-lg transition-all duration-300 ${
                    isSpeaking ? 'ring-4 ring-wine scale-[1.04] shadow-xl' : 'ring-2 ring-line/60'
                  }`}>
                    <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
                    {isSpeaking && <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-25 pointer-events-none" />}
                  </div>
                  <span className={`text-[11px] tracking-[0.18em] uppercase font-semibold transition-colors ${isSpeaking ? 'text-wine' : 'text-navy/60'}`}>
                    {n.name}
                  </span>
                  <div className={`w-full rounded-xl px-4 py-4 border transition-colors duration-300 flex items-start gap-3 ${
                    isSpeaking ? 'bg-wine/5 border-wine/20' : 'bg-ivory border-line/60'
                  }`}>
                    <button
                      type="button"
                      onClick={() => { if (playing && activeSpeakingNarrator === id) stopAudio(); else playNarratorLine(line); }}
                      className="relative mt-[3px] w-7 h-7 rounded-full border border-wine/30 text-wine/60 hover:text-wine hover:border-wine/60 flex items-center justify-center transition-colors shrink-0"
                      aria-label={isSpeaking ? 'Stop' : 'Replay'}
                    >
                      {isSpeaking ? (
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="2" y="2" width="10" height="10" rx="1.5" /></svg>
                      ) : (
                        <svg width="7" height="9" viewBox="0 0 10 12" fill="currentColor" aria-hidden><path d="M0 0 L10 6 L0 12 Z" /></svg>
                      )}
                      {isSpeaking && <span className="absolute inset-0 rounded-full border border-wine animate-ping opacity-40 pointer-events-none" />}
                    </button>
                    <NarratorHoverText
                      text={line.text}
                      translation={line.translation}
                      showTutorialHint={false}
                      enableHoverDemo={false}
                      onFirstHover={undefined}
                      highlightSpeech={highlightSpeech}
                      speechPlaybackTime={speechPlaybackTime}
                      speechTimings={speechTimings}
                      className="font-display text-[16px] sm:text-[18px] leading-[1.5] text-navy/85 italic"
                    />
                  </div>
                </div>
              );
            })()}

            {/* Phase 2: Jules appears with his taunt + badge picker */}
            {(showLevelPicker || levelLocked) && (() => {
              const julesLine = linesByNarrator['jules'] ?? JULES_LEVEL_PICKER_LINE;
              const n = NARRATORS['jules'];
              const isSpeaking = activeNarrator === 'jules';
              const highlightSpeech = isSpeaking && speechText === julesLine.text && speechPlaybackTime != null;
              return (
                <motion.div
                  key="jules-taunt"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="flex flex-col items-center gap-3 mb-5"
                >
                  <div className={`relative w-[110px] h-[110px] sm:w-[130px] sm:h-[130px] rounded-full overflow-hidden shadow-md shrink-0 transition-all duration-300 ${
                    isSpeaking ? 'ring-4 ring-wine scale-[1.04]' : 'ring-2 ring-line/60'
                  }`}>
                    <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
                    {isSpeaking && <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-25 pointer-events-none" />}
                  </div>
                  <div className={`rounded-xl px-4 py-3 border transition-colors duration-300 inline-flex items-start gap-2 ${
                    isSpeaking ? 'bg-wine/5 border-wine/20' : 'bg-ivory border-line/60'
                  }`}>
                    <button
                      type="button"
                      onClick={() => { if (playing && activeSpeakingNarrator === 'jules') stopAudio(); else playNarratorLine(julesLine); }}
                      className="relative mt-[3px] w-7 h-7 rounded-full border border-wine/30 text-wine/60 hover:text-wine hover:border-wine/60 flex items-center justify-center transition-colors shrink-0"
                    >
                      {isSpeaking ? (
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="2" y="2" width="10" height="10" rx="1.5" /></svg>
                      ) : (
                        <svg width="7" height="9" viewBox="0 0 10 12" fill="currentColor" aria-hidden><path d="M0 0 L10 6 L0 12 Z" /></svg>
                      )}
                      {isSpeaking && <span className="absolute inset-0 rounded-full border border-wine animate-ping opacity-40 pointer-events-none" />}
                    </button>
                    <NarratorHoverText
                      text={julesLine.text}
                      translation={julesLine.translation}
                      showTutorialHint={false}
                      enableHoverDemo={false}
                      onFirstHover={undefined}
                      highlightSpeech={highlightSpeech}
                      speechPlaybackTime={speechPlaybackTime}
                      speechTimings={speechTimings}
                      className="font-display text-[16px] sm:text-[17px] leading-[1.5] text-navy/85 italic"
                    />
                  </div>
                </motion.div>
              );
            })()}

            {audioError && (
              <p className="text-[11px] text-wine/70 text-center mb-3">{audioError}</p>
            )}

            {/* Auth CTAs — always visible */}
            {!showLevelPicker && !levelLocked && (
              <div className="flex flex-wrap items-center justify-center gap-4 mt-5 mb-2">

                {/* I'm new */}
                <div className="relative flex flex-col items-center gap-1.5">
                  <p className="text-[11px] tracking-[0.12em] uppercase text-navy/35 font-semibold">I'm new</p>
                  <button
                    type="button"
                    onClick={() => {
  setShowLevelPicker(true);
  setLinesByNarrator((prev) => ({ ...prev, jules: JULES_LEVEL_PICKER_LINE }));
  playNarratorLine(JULES_LEVEL_PICKER_LINE);
}}
                    className={`${NAV_CTA_CLASS} text-[14px] py-2.5 px-6`}
                  >
                    Choose my level
                  </button>
                </div>

                <span className="text-navy/20 text-lg">|</span>

                {/* I'm already Parisian */}
                <div className="relative flex flex-col items-center gap-1.5">
                  <p className="text-[11px] tracking-[0.12em] uppercase text-navy/35 font-semibold">I'm already Parisian</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGoogleConnect}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-line bg-white text-navy text-[13px] font-medium font-display shadow-sm hover:shadow-md hover:border-wine/30 transition-all"
                    >
                      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
                        <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92a8.78 8.78 0 002.68-6.61z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.99 8.99 0 009 18z" fill="#34A853"/>
                        <path d="M3.97 10.71A5.41 5.41 0 013.68 9c0-.59.1-1.16.29-1.71V4.96H.96A8.99 8.99 0 000 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 00.96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      Google
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAuthError(null); setReturningEmailForm(true); }}
                      className="text-[12px] text-navy/40 hover:text-wine transition-colors font-display underline underline-offset-2"
                    >
                      or via email
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* Returning user email form */}
            <AnimatePresence>
              {returningEmailForm && (
                <motion.div
                  key="returning-email"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4 flex flex-col items-center gap-2"
                >
                  <form onSubmit={handleReturningEmailContinue} className="flex flex-col gap-2 w-full max-w-[280px]">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="your@email.com"
                      autoComplete="email"
                      autoFocus
                      className="w-full rounded-full border border-line bg-ivory px-4 py-2.5 text-center font-display text-[14px] text-navy placeholder:text-navy/25 outline-none focus:border-wine/40 focus:ring-2 focus:ring-wine/10"
                    />
                    <button type="submit" className={`${NAV_CTA_CLASS} w-full justify-center`}>
                      Log in
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReturningEmailForm(false); setAuthError(null); }}
                      className="text-[12px] text-navy/40 hover:text-wine transition-colors"
                    >
                      Back
                    </button>
                  </form>
                  {authError && <p className="text-[11px] text-wine/80 text-center">{authError}</p>}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Phase 3: level picker + auth — appears after clicking "Choose my level" */}
            <AnimatePresence>
              {(showLevelPicker || levelLocked) && (
                <motion.div
                  key="level-section"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <LayoutGroup>
                    <div className="relative min-h-[168px] sm:min-h-[200px]">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {!levelLocked ? (
                          <motion.div
                            key="level-grid"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="grid grid-cols-3 gap-3 sm:gap-4"
                          >
                            {LEVEL_PICKER.map(({ id, label, hint }) => (
                              <motion.button
                                key={id}
                                type="button"
                                layoutId={pickedLevel === id ? SELECTED_BADGE_LAYOUT : undefined}
                                onClick={() => handleLevelPick(id)}
                                aria-label={`${label}, ${hint}`}
                                exit={{ opacity: 0, scale: 0.88 }}
                                transition={{ duration: 0.22 }}
                                className="flex items-center justify-center rounded-xl border border-line bg-paper p-1 sm:p-1.5 shadow-sm hover:shadow-md hover:border-wine/35 transition-colors"
                              >
                                <img
                                  src={getLevelBadgeSrc(id)}
                                  alt=""
                                  className={BADGE_IMG_CLASS}
                                />
                              </motion.button>
                            ))}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="level-focus"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25, delay: 0.08 }}
                            className="flex flex-col items-center"
                          >
                            <motion.div
                              layoutId={SELECTED_BADGE_LAYOUT}
                              className="flex items-center justify-center rounded-xl border border-wine ring-2 ring-wine/25 ring-offset-2 ring-offset-paper bg-paper p-1 sm:p-1.5 shadow-md"
                            >
                              <img
                                src={getLevelBadgeSrc(pickedLevel)}
                                alt=""
                                className={BADGE_IMG_CLASS}
                              />
                            </motion.div>

                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.2 }}
                              className="mt-6 w-full max-w-[300px] flex flex-col gap-2.5"
                            >
                              {!showEmailForm ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={handleGoogleConnect}
                                    className={`${NAV_CTA_CLASS} w-full justify-center gap-3`}
                                  >
                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                                      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92a8.78 8.78 0 002.68-6.61z" fill="#4285F4"/>
                                      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.99 8.99 0 009 18z" fill="#34A853"/>
                                      <path d="M3.97 10.71A5.41 5.41 0 013.68 9c0-.59.1-1.16.29-1.71V4.96H.96A8.99 8.99 0 000 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05"/>
                                      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 00.96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
                                    </svg>
                                    Connect with Google
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setAuthError(null); setShowEmailForm(true); }}
                                    className="w-full rounded-full border border-wine/30 bg-paper text-wine px-5 py-3 text-[14px] font-medium font-display hover:bg-wine/5 transition-colors"
                                  >
                                    Continue with email
                                  </button>
                                </>
                              ) : (
                                <form onSubmit={handleEmailContinue} className="flex flex-col gap-2.5">
                                  <input
                                    type="email"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    placeholder="you@email.com"
                                    autoComplete="email"
                                    autoFocus
                                    className="w-full rounded-full border border-line bg-ivory px-4 py-3 text-center font-display text-[15px] text-navy placeholder:text-navy/25 outline-none focus:border-wine/40 focus:ring-2 focus:ring-wine/10"
                                  />
                                  <button type="submit" className={`${NAV_CTA_CLASS} w-full justify-center`}>
                                    Continue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setShowEmailForm(false); setAuthError(null); }}
                                    className="text-[12px] text-navy/45 hover:text-wine transition-colors"
                                  >
                                    Back
                                  </button>
                                </form>
                              )}
                              {authError && (
                                <p className="text-[11px] text-wine/80 text-center">{authError}</p>
                              )}
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </LayoutGroup>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
