import React from 'react';
import { motion } from 'framer-motion';
import { fetchNarratorAudio, connectNarratorSource, NARRATORS } from '../lib/narratorAudio';
import { buildWordTimings, playDecodedBuffer } from '../lib/speechHighlight';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';
import { getLevelChallengeScript } from '../lib/narratorLevelAdapt';
import { NarratorHoverText } from '../lib/NarratorHoverText';

export function LevelChallengeIntro({ levelId, levelTitle, onStart, onBack }) {
  const lines = React.useMemo(() => getLevelChallengeScript(levelId), [levelId]);
  const [lineIndex, setLineIndex] = React.useState(-1);
  const [playing, setPlaying] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [speechPlaybackTime, setSpeechPlaybackTime] = React.useState(null);
  const [speechTimings, setSpeechTimings] = React.useState([]);
  const [speechText, setSpeechText] = React.useState(null);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const sessionRef = React.useRef(0);

  const clearSpeechHighlight = React.useCallback(() => {
    setSpeechPlaybackTime(null);
    setSpeechTimings([]);
    setSpeechText(null);
  }, []);

  const stopAudio = React.useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    clearSpeechHighlight();
  }, [clearSpeechHighlight]);

  React.useEffect(() => registerSiteAudioStop(stopAudio), [stopAudio]);

  const invalidateSession = React.useCallback(() => {
    sessionRef.current += 1;
    stopAudio();
  }, [stopAudio]);

  const playDecodedLine = React.useCallback(async (ctx, line, decoded, isActive, siteSession) => {
    if (!isActive() || !isSiteAudioPlaybackCurrent(siteSession)) return;
    setSpeechText(line.text);
    setSpeechTimings(buildWordTimings(line.text, decoded.duration));
    setSpeechPlaybackTime(0);
    await playDecodedBuffer(ctx, {
      buffer: decoded,
      narrator: line.narrator,
      sourceRef,
      connectSource: connectNarratorSource,
      playbackSession: siteSession,
      onTimeUpdate: (t) => {
        if (!isActive()) return;
        setSpeechPlaybackTime(t);
        if (t == null) clearSpeechHighlight();
      },
    });
  }, [clearSpeechHighlight]);

  const runDialogue = React.useCallback(async () => {
    const siteSession = beginSiteAudioPlayback();
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setError(null);
    setFinished(false);
    setLineIndex(-1);
    setPlaying(true);

    const isActive = () => sessionRef.current === session && isSiteAudioPlaybackCurrent(siteSession);

    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (!isActive()) return;

      for (let i = 0; i < lines.length; i++) {
        if (!isActive()) break;
        setLineIndex(i);
        const line = lines[i];
        const buf = await fetchNarratorAudio(line.text, line.narrator);
        if (!isActive()) break;
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        if (!isActive()) break;
        await playDecodedLine(ctx, line, decoded, isActive, siteSession);
      }

      if (isActive()) {
        setFinished(true);
      }
    } catch {
      if (isActive()) setError('Audio unavailable — read the dialogue below.');
      if (isActive()) setFinished(true);
    } finally {
      if (isActive()) {
        clearSpeechHighlight();
        setPlaying(false);
      }
    }
  }, [lines, playDecodedLine, clearSpeechHighlight]);

  React.useEffect(() => {
    runDialogue();
    return invalidateSession;
  }, [runDialogue, invalidateSession]);

  const activeNarrator = lineIndex >= 0 ? lines[lineIndex]?.narrator : null;
  const lastLineByNarrator = React.useMemo(() => {
    const map = { lea: null, jules: null, leaTranslation: null, julesTranslation: null };
    lines.forEach((line, i) => {
      if (i <= lineIndex) {
        map[line.narrator] = line.text;
        map[`${line.narrator}Translation`] = line.translation;
      }
    });
    return map;
  }, [lines, lineIndex]);

  return (
    <section
      id="learning-dashboard"
      className="relative min-h-screen flex flex-col justify-center px-6 py-24 border-t border-line/40 bg-gradient-to-b from-paper to-ivory/40"
    >
      <div className="max-w-[900px] mx-auto w-full text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[11px] tracking-[0.22em] uppercase text-wine font-semibold mb-4"
        >
          Parisian test · {levelId}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="font-display text-[44px] md:text-[52px] leading-[1.05] text-navy mb-3"
        >
          Léa & Jules say <span className="italic text-wine">bonjour</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="text-[16px] text-navy/65 max-w-[520px] mx-auto leading-relaxed"
        >
          You picked <span className="font-medium text-navy">{levelTitle}</span>. They want to see if your French is really that good — speak like people do in Paris.
        </motion.p>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-16">
          {(['lea', 'jules']).map((id) => {
            const n = NARRATORS[id];
            const isActive = playing && activeNarrator === id;
            const bubbleText = lastLineByNarrator[id];
            const bubbleTranslation = lastLineByNarrator[`${id}Translation`];
            const highlightBubble = isActive && speechText && speechText === bubbleText;

            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: id === 'lea' ? 0.2 : 0.28 }}
                className="flex flex-col items-center gap-5"
              >
                <div className="relative">
                  <div
                    className={`w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden transition-all duration-300 ${
                      isActive
                        ? 'ring-[3px] ring-wine shadow-lg scale-105'
                        : finished && bubbleText
                          ? 'ring-2 ring-wine/30'
                          : 'ring-1 ring-line/50 opacity-90'
                    }`}
                  >
                    <img src={n.src} alt={n.name} className="w-full h-full object-cover object-top" />
                  </div>
                  {isActive && (
                    <span className="absolute inset-0 rounded-full border-2 border-wine animate-ping opacity-30" />
                  )}
                </div>
                <span className="font-display text-[18px] text-navy">{n.name}</span>
                <div
                  className={`min-h-[88px] w-full max-w-[320px] rounded-2xl px-5 py-4 text-left transition-all duration-300 ${
                    isActive
                      ? 'bg-white border-2 border-wine/40 shadow-md'
                      : bubbleText
                        ? 'bg-white/80 border border-line/60'
                        : 'bg-ivory/40 border border-line/30'
                  }`}
                >
                  {bubbleText ? (
                    <NarratorHoverText
                      text={bubbleText}
                      translation={bubbleTranslation}
                      quote
                      highlightSpeech={highlightBubble}
                      speechPlaybackTime={speechPlaybackTime}
                      speechTimings={speechTimings}
                      className="font-display text-[15px] leading-snug text-navy italic"
                      wrapperClassName="relative w-full"
                      tooltipClassName="top-[calc(100%+6px)]"
                    />
                  ) : (
                    <p className="text-[13px] text-navy/30 italic">…</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {error && (
          <p className="mt-8 text-[13px] text-wine/80">{error}</p>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: finished ? 1 : 0.4 }}
          transition={{ delay: 0.3 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            type="button"
            onClick={onBack}
            className="text-[13px] tracking-wide text-navy/45 hover:text-navy/70 transition-colors"
          >
            ← Pick another level
          </button>
          <button
            type="button"
            onClick={runDialogue}
            disabled={playing}
            className="px-6 py-2.5 border border-line text-navy/70 rounded-full text-[13px] hover:border-wine/40 hover:text-wine transition-colors disabled:opacity-40"
          >
            {playing ? 'Playing…' : 'Replay intro'}
          </button>
          <button
            type="button"
            onClick={() => {
              invalidateSession();
              onStart();
            }}
            className="px-8 py-3.5 bg-wine text-ivory rounded-full font-display text-[16px] hover:bg-wine2 transition-all shadow-sm hover:shadow-md"
          >
            {playing ? 'Skip — prove it' : "I'm ready — prove it"}
          </button>
        </motion.div>
      </div>
    </section>
  );
}
