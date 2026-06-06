import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ParisianProfileSquare } from './ParisianCornerBadge';

function ParisianBadgeInline() {
  return (
    <div style={{ marginTop: 48 }}>
      <ParisianProfileSquare compact className="pointer-events-none" />
    </div>
  );
}

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`}>
      <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden>
        {[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31].map((x, i) => {
          const h = [6, 10, 16, 12, 20, 14, 8, 18, 14, 20, 10, 16, 8, 12, 18, 10][i];
          return (
            <rect key={i} x={x} y={(22 - h) / 2} width="1.4" height={h} rx="0.7" fill="#8B1E2D" />
          );
        })}
      </svg>
      <span className="font-display text-[26px] leading-none text-navy">Nativa</span>
      <span className="hidden sm:block text-[11px] font-mono tracking-[0.08em] text-navy/70 leading-none border-l border-navy/20 pl-3 ml-1 self-end mb-[5px]">all the French you need</span>
    </Link>
  );
}

export const NAV_CTA_CLASS =
  'inline-flex items-center gap-2.5 rounded-full bg-wine hover:bg-wine2 text-ivory px-5 py-2.5 text-[15px] font-medium font-display transition-colors duration-200 whitespace-nowrap';

export function ButtonPrimary({ children, className = '', to, showArrow = true, ...rest }) {
  const cls = `group ${NAV_CTA_CLASS} ${className}`;
  const inner = (
    <>
      <span>{children}</span>
      {showArrow ? (
        <svg
          className="transition-transform duration-300 group-hover:translate-x-0.5"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
        >
          <path
            d="M1 7h12m0 0L8 2m5 5l-5 5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      {...rest}
      className={cls}
    >
      {inner}
    </button>
  );
}

/** Animated hint pointing at a CTA (e.g. How to reach B2). */
export function ParisianExperienceHint({ className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 4 }}
      animate={{ opacity: 1, x: [0, 1.5, 0] }}
      transition={{
        delay: 0.6,
        duration: 0.5,
        x: { repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 1.1 },
      }}
      className={`absolute right-full mr-2.5 inset-y-0 flex items-center gap-2 pointer-events-none ${className}`.trim()}
      aria-hidden
    >
      <ParisianBadgeInline />
      <span className="font-display text-[11px] sm:text-[12px] italic text-wine leading-[1.25] text-right w-[132px]">
        Click here to gain
        <br />
        Parisian experience
      </span>
      <svg width="7" height="9" viewBox="0 0 10 8" fill="none" className="shrink-0 rotate-[-90deg]">
        <path d="M5 8L0.669873 0.5L9.33013 0.5L5 8Z" fill="#8B1E2D" opacity="0.6" />
      </svg>
    </motion.div>
  );
}

export function ButtonGhost({ children, className = '', ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={`group inline-flex items-center gap-2.5 border border-navy/20 hover:border-navy/40 text-navy bg-transparent px-5 py-3 text-[14px] font-medium transition-colors duration-200 ${className}`}
    >
      <span>{children}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M3 2l5 4-5 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function Eyebrow({ children, color = 'wine', className = '' }) {
  const isWine = color === 'wine';
  return (
    <span className={`inline-flex items-center gap-2 eyebrow ${className}`}>
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${isWine ? 'bg-wine' : 'bg-ivory/70'}`}
      />
      <span className={isWine ? 'text-navy' : 'text-ivory/80'}>{children}</span>
    </span>
  );
}

export function Star({ filled = true, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.2l2.06 4.45 4.86.55-3.62 3.3.99 4.8L8 11.96 3.71 14.3l.99-4.8-3.62-3.3 4.86-.55L8 1.2z"
        fill={filled ? '#8B1E2D' : 'none'}
        stroke="#8B1E2D"
        strokeWidth="1"
      />
    </svg>
  );
}

export function SectionLabel({ children, color = 'navy' }) {
  const cls = color === 'navy' ? 'text-navy/55' : 'text-ivory/55';
  return <div className={`eyebrow ${cls} mb-5`}>{children}</div>;
}

export function Container({ children, className = '' }) {
  return <div className={`max-w-[1200px] mx-auto px-6 md:px-10 ${className}`}>{children}</div>;
}

export function Waveform({ bars = 56, color = '#1A2340', active = true, height = 36 }) {
  const heights = React.useMemo(() => {
    return Array.from({ length: bars }).map((_, i) => {
      const v = (Math.sin(i * 0.45) + Math.sin(i * 0.21) + 2) / 4;
      return Math.max(0.12, v * (0.5 + (i % 5) * 0.1));
    });
  }, [bars]);

  return (
    <div className="flex items-center gap-[3px]" style={{ height }}>
      {heights.map((h, i) => (
        <motion.span
          key={i}
          initial={{ scaleY: 0.3 }}
          animate={
            active
              ? { scaleY: [h * 0.5, h, h * 0.7, h * 0.9, h * 0.5] }
              : { scaleY: h * 0.5 }
          }
          transition={{
            duration: 1.6 + (i % 4) * 0.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: (i % 7) * 0.05,
          }}
          style={{
            height: '100%',
            width: 2,
            background: color,
            borderRadius: 2,
            transformOrigin: 'center',
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  );
}

export function Reveal({ children, delay = 0, y = 24, className = '' }) {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.05 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
