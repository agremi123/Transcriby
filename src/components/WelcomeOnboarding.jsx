import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLearnerProfile } from '../context/LearnerProfileContext';
import { PARISIAN_MASCOTS, needsWelcomeOnboarding } from '../lib/learnerProfile';
import { LEVEL_PICKER, WELCOME_LEVEL_LINES, getLevelPickMockery } from '../lib/narratorLevelAdapt';
import { fetchNarratorAudio, connectNarratorSource, NARRATORS } from '../lib/narratorAudio';
import { buildWordTimings, playDecodedBuffer } from '../lib/speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';
import { NarratorHoverText } from '../lib/NarratorHoverText';
import { Logo } from './atoms';

const WELCOME_LINES_BY_NARRATOR = Object.fromEntries(
  WELCOME_LEVEL_LINES.map((line) => [line.narrator, line]),
);

export default function WelcomeOnboarding() {
  const { profile, completeOnboarding } = useLearnerProfile();
  const [pickedLevel, setPickedLevel] = React.useState(profile.claimedLevel);
  const [pickedGender, setPickedGender] = React.useState(profile.gender);
  const [learnerName, setLearnerName] = React.useState(profile.name || '');
  const [linesByNarrator, setLinesByNarrator] = React.useState(WELCOME_LINES_BY_NARRATOR);
  const [activeSpeakingNarrator, setActiveSpeakingNarrator] = React.useState(null);
  const [playing, setPlaying] = React.useState(false);
  const [audioError, setAudioError] = React.useState(null);
  const [speechPlaybackTime, setSpeechPlaybackTime] = React.useState(null);
  const [speechTimings, setSpeechTimings] = React.useState([]);
  const [speechText, setSpeechText] = React.useState(null);
  const [showTranslationHint, setShowTranslationHint] = React.useState(true);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);
  const hasAutoPlayedRef = React.useRef(false);

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
      }
    }
  }, []);

  React.useEffect(() => {
    if (!needsWelcomeOnboarding(profile) || hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    const t = window.setTimeout(() => { playWelcomeLines(); }, 400);
    return () => {
      window.clearTimeout(t);
      stopAudio();
    };
  }, [profile, playWelcomeLines, stopAudio]);

  React.useEffect(() => {
    if (needsWelcomeOnboarding(profile)) {
      setPickedLevel(profile.claimedLevel);
      setPickedGender(profile.gender);
      setLearnerName(profile.name || '');
    }
  }, [profile.claimedLevel, profile.gender, profile.name, profile.onboardingComplete]);

  React.useEffect(() => () => {
    sessionRef.current += 1;
    try { sourceRef.current?.stop(); } catch {}
  }, []);

  if (!needsWelcomeOnboarding(profile)) return null;

  const tryComplete = () => {
    const name = learnerName.trim();
    if (!pickedLevel || !pickedGender || !name) return;
    stopAudio();
    completeOnboarding(pickedLevel, pickedGender, name);
  };

  const handleLevelPick = (levelId) => {
    setPickedLevel(levelId);
    const reaction = getLevelPickMockery(levelId);
    setLinesByNarrator((prev) => ({
      ...prev,
      [reaction.narrator]: reaction,
    }));
    playNarratorLine(reaction);
  };

  const handleGenderPick = (gender) => {
    setPickedGender(gender);
  };

  const canContinue = pickedLevel && pickedGender && learnerName.trim().length > 0;

  const dismissTranslationHint = () => {
    setShowTranslationHint(false);
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
          className="w-full max-w-[600px] rounded-2xl border border-line/80 bg-paper shadow-[0_24px_64px_rgba(26,35,64,0.18)] overflow-visible"
        >
          <div className="h-1 bg-gradient-to-r from-transparent via-wine/70 to-transparent" />

          <div className="px-6 sm:px-8 pt-6 pb-7">
            <div className="flex items-center justify-between gap-3 mb-5">
              <Logo className="shrink-0 pointer-events-none" />
              <button
                type="button"
                onClick={playing ? stopAudio : playWelcomeLines}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-wine/30 text-wine text-[11px] font-medium hover:bg-wine/5 transition-colors"
              >
                {playing ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                      <rect x="2" y="2" width="10" height="10" rx="1.5" />
                    </svg>
                    Stop
                  </>
                ) : (
                  <>
                    <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
                      <path d="M0 0 L10 6 L0 12 Z" />
                    </svg>
                    Listen
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-6">
              {(['lea', 'jules']).map((id) => {
                const n = NARRATORS[id];
                const line = linesByNarrator[id] || WELCOME_LINES_BY_NARRATOR[id];
                const isSpeaking = activeNarrator === id;
                const highlightSpeech = isSpeaking
                  && speechText === line.text
                  && speechPlaybackTime != null;

                return (
                  <div key={id} className="flex flex-col items-center gap-2 min-w-0">
                    <div className={`relative w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-full overflow-hidden shadow-md transition-all duration-300 ${
                      isSpeaking
                        ? 'ring-[3px] ring-wine scale-[1.03] shadow-lg'
                        : 'ring-2 ring-line/60'
                    }`}>
                      <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
                      {isSpeaking && (
                        <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-25 pointer-events-none" />
                      )}
                    </div>
                    <span className={`text-[11px] tracking-[0.16em] uppercase font-semibold transition-colors ${
                      isSpeaking ? 'text-wine' : 'text-navy/75'
                    }`}>
                      {n.name}
                    </span>
                    <NarratorHoverText
                      text={line.text}
                      translation={line.translation}
                      showTutorialHint={id === 'lea' && showTranslationHint}
                      enableHoverDemo={id === 'lea' && showTranslationHint}
                      onFirstHover={id === 'lea' ? dismissTranslationHint : undefined}
                      highlightSpeech={highlightSpeech}
                      speechPlaybackTime={speechPlaybackTime}
                      speechTimings={speechTimings}
                      className="font-display text-[16px] sm:text-[17px] leading-[1.4] text-navy/80 italic break-words text-center min-w-0"
                    />
                  </div>
                );
              })}
            </div>

            {audioError && (
              <p className="text-[11px] text-wine/70 text-center mb-4">{audioError}</p>
            )}

            <p className="font-display text-[14px] sm:text-[15px] text-navy/75 text-center mb-3 italic">
              Let Léa and Jules decide
            </p>

            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {LEVEL_PICKER.map(({ id, label, hint }) => {
                const isPicked = pickedLevel === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleLevelPick(id)}
                    className={`rounded-xl border px-2 py-3 sm:py-3.5 transition-all duration-200 shadow-sm hover:shadow-md bg-ivory border-line text-navy hover:border-wine/35 hover:bg-paper ${
                      isPicked ? 'border-wine ring-2 ring-wine/25 ring-offset-2 ring-offset-paper' : ''
                    }`}
                  >
                    <span className="block font-display text-[22px] sm:text-[24px] leading-none font-semibold text-wine">
                      {label}
                    </span>
                    <span className="block mt-1 text-[12px] sm:text-[13px] tracking-wide font-medium text-navy/45 leading-snug">
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-5 border-t border-line/60">
              <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-navy/75 text-center mb-3">
                Choose your picture
              </p>
              <div className="flex items-stretch justify-center gap-3 sm:gap-4 max-w-[280px] mx-auto">
                {[
                  { id: 'woman', label: 'Her' },
                  { id: 'man', label: 'Him' },
                ].map(({ id, label }) => {
                  const isPicked = pickedGender === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleGenderPick(id)}
                      className={`flex-1 rounded-xl border px-2 py-2.5 transition-all duration-200 bg-ivory hover:border-wine/35 hover:bg-paper ${
                        isPicked
                          ? 'border-wine ring-2 ring-wine/25 ring-offset-2 ring-offset-paper'
                          : 'border-line'
                      }`}
                      aria-label={`Choose ${label}`}
                    >
                      <div className="w-full aspect-[3/4] rounded-full overflow-hidden border border-line/50 mb-2 mx-auto max-w-[72px]">
                        <img
                          src={PARISIAN_MASCOTS[id]}
                          alt=""
                          className="w-full h-full object-cover object-top"
                        />
                      </div>
                      <span className={`block text-[10px] tracking-wide uppercase font-semibold transition-colors ${
                        isPicked ? 'text-wine' : 'text-navy/55'
                      }`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {pickedGender && (
                <div className="mt-4 max-w-[260px] mx-auto">
                  <label htmlFor="learner-name" className="block text-[10px] tracking-[0.14em] uppercase text-navy/40 text-center mb-2">
                    Your name
                  </label>
                  <input
                    id="learner-name"
                    type="text"
                    value={learnerName}
                    onChange={(e) => setLearnerName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) tryComplete(); }}
                    placeholder="Prénom"
                    autoComplete="given-name"
                    autoFocus
                    className="w-full rounded-xl border border-line bg-ivory px-3 py-2.5 text-center font-display text-[16px] text-navy placeholder:text-navy/25 outline-none focus:border-wine/40 focus:ring-2 focus:ring-wine/10 transition-colors"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={tryComplete}
                disabled={!canContinue}
                className="mt-4 w-full max-w-[260px] mx-auto block rounded-full border border-wine bg-wine text-ivory py-2.5 font-display text-[14px] hover:bg-wine2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>

              {!pickedLevel && pickedGender && (
                <p className="mt-3 text-[10px] text-navy/40 text-center italic">
                  Pick your level above to continue
                </p>
              )}
              {pickedLevel && pickedGender && !learnerName.trim() && (
                <p className="mt-3 text-[10px] text-navy/40 text-center italic">
                  Enter your name to continue
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
