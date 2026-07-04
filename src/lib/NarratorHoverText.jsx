import React from 'react';
import { motion, useAnimation } from 'framer-motion';
import { HighlightedSpeech } from './HighlightedSpeech';

function TutorialMouseCursor() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="drop-shadow-[0_2px_6px_rgba(26,35,64,0.35)]">
      <path
        d="M6 3.5 19 11.5l-5.5 1.2-2.4 6.8-1.8-1.2 2.4-6.8L6 3.5Z"
        fill="#FBF8F2"
        stroke="#1A2340"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Finger/tap indicator shown on touch devices instead of a mouse cursor. */
function TutorialTapIndicator() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="drop-shadow-[0_2px_6px_rgba(26,35,64,0.35)]">
      {/* ripple */}
      <circle cx="9" cy="9" r="6" stroke="#8B1E2D" strokeWidth="1.2" opacity="0.5" />
      {/* pointing hand */}
      <path
        d="M11 10.5V6.2a1.3 1.3 0 0 1 2.6 0v5.6l1.7-.5a1.5 1.5 0 0 1 1.9 1.1l.5 2.4a3.4 3.4 0 0 1-2.6 4l-.9.2a3.6 3.6 0 0 1-3.8-1.6l-2-3a1.3 1.3 0 0 1 1.9-1.7l.7.6Z"
        fill="#FBF8F2"
        stroke="#1A2340"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** True on devices that can actually hover (desktop mouse), false on touch. */
export function useCanHover() {
  const [canHover, setCanHover] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return canHover;
}

function sleep(ms) {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

/** French narrator line with English translation on hover. */
export function NarratorHoverText({
  text,
  translation,
  children,
  className = '',
  quote = false,
  highlightSpeech = false,
  speechPlaybackTime = null,
  speechTimings = [],
  showTutorialHint = false,
  enableHoverDemo = false,
  onFirstHover,
  tooltipClassName = '',
  wrapperClassName = 'relative w-full max-w-[min(100%,240px)]',
  scrollable = false,
  scrollClassName = 'max-h-16 overflow-y-auto scroll-premium overscroll-contain pr-0.5',
  tooltipPosition = 'below',
}) {
  const cursorControls = useAnimation();
  const canHover = useCanHover();
  const [showDemoTranslation, setShowDemoTranslation] = React.useState(false);
  const demoRunRef = React.useRef(0);

  React.useEffect(() => {
    if (!enableHoverDemo || !showTutorialHint) {
      setShowDemoTranslation(false);
      cursorControls.stop();
      return undefined;
    }

    const runId = demoRunRef.current + 1;
    demoRunRef.current = runId;
    let cancelled = false;

    async function runDemoLoop() {
      await sleep(900);
      while (!cancelled && demoRunRef.current === runId) {
        setShowDemoTranslation(false);
        await cursorControls.start({
          x: 64,
          y: -6,
          opacity: 0,
          transition: { duration: 0 },
        });
        await cursorControls.start({
          x: 64,
          y: -6,
          opacity: 1,
          transition: { duration: 0.35, ease: 'easeOut' },
        });
        if (cancelled || demoRunRef.current !== runId) break;

        await cursorControls.start({
          x: 16,
          y: 18,
          opacity: 1,
          transition: { duration: 1.05, ease: [0.33, 0, 0.2, 1] },
        });
        if (cancelled || demoRunRef.current !== runId) break;

        setShowDemoTranslation(true);
        await sleep(2400);
        if (cancelled || demoRunRef.current !== runId) break;

        setShowDemoTranslation(false);
        await sleep(350);
        await cursorControls.start({
          x: 64,
          y: -6,
          opacity: 0,
          transition: { duration: 0.45, ease: 'easeIn' },
        });
        if (cancelled || demoRunRef.current !== runId) break;
        await sleep(1400);
      }
    }

    runDemoLoop();

    return () => {
      cancelled = true;
      demoRunRef.current += 1;
      setShowDemoTranslation(false);
      cursorControls.stop();
    };
  }, [enableHoverDemo, showTutorialHint, cursorControls]);

  if (!text && (children == null || children === false)) return null;

  const translationVisibleClass = showDemoTranslation
    ? 'opacity-100 visible'
    : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible';

  const hintClass = showTutorialHint
    ? 'rounded-lg px-2.5 py-2 bg-wine/[0.08] ring-1 ring-wine/20'
    : '';

  const hasCustomContent = children != null && children !== false;
  const content = hasCustomContent ? children : (
    <HighlightedSpeech
      text={text}
      playbackTime={highlightSpeech ? speechPlaybackTime : null}
      timings={speechTimings}
      quote={quote}
      className={`${className} ${hintClass}`.trim()}
    />
  );

  const tooltipPositionClass = tooltipPosition === 'above'
    ? 'bottom-[calc(100%+8px)] top-auto'
    : 'top-[calc(100%+8px)]';

  const body = scrollable
    ? <div className={scrollClassName}>{content}</div>
    : content;

  return (
    <div className={wrapperClassName}>
      <div
        className="group relative w-full"
        onMouseEnter={onFirstHover}
        onTouchStart={onFirstHover}
      >
        {enableHoverDemo && showTutorialHint && (
          <motion.div
            className="absolute left-1/2 top-4 z-40 pointer-events-none"
            initial={{ x: 64, y: -6, opacity: 0 }}
            animate={cursorControls}
            aria-hidden
          >
            {canHover ? <TutorialMouseCursor /> : <TutorialTapIndicator />}
          </motion.div>
        )}

        {body}

        {showTutorialHint && (
          <p className="mt-1.5 text-[10px] tracking-wide text-wine/60 text-center animate-pulse">
            👆 {canHover ? 'Hover the text to see the English' : 'Tap the text to see the English'}
          </p>
        )}

        {translation && (
          <p
            role="tooltip"
            className={`absolute left-1/2 ${tooltipPositionClass} z-50 w-max max-w-[min(280px,calc(100vw-3rem))] -translate-x-1/2 rounded-lg border border-navy/10 bg-ivory2 px-2.5 py-2 text-[12px] sm:text-[13px] leading-snug text-navy/75 shadow-[0_6px_20px_rgba(26,35,64,0.14)] transition-opacity duration-200 pointer-events-none text-center ${translationVisibleClass} ${tooltipClassName}`.trim()}
          >
            {translation}
          </p>
        )}
      </div>
    </div>
  );
}
