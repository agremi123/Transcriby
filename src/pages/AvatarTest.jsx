// Isolated spike to evaluate a local, API-free 3D talking head.
// Not linked from anywhere in the app — reach it at /avatar-test.
// Goal: judge (1) does it render, (2) does it look good / not uncanny,
// (3) does it run smoothly on a real phone — before committing to the feature.

import React from 'react';
import { Link } from 'react-router-dom';
import TalkingAvatar3D from '../components/TalkingAvatar3D';

// Look-test options (all eval-only / non-commercial samples). Swap a shippable
// licensed avatar in later. Bigger file = heavier on mobile — noted per option.
const AVATARS = [
  { id: 'sample', label: 'Stylized · 4.5 MB', src: '/avatars/sample.glb' },
  { id: 'avaturn', label: 'Realistic · 13 MB', src: '/avatars/avaturn.glb' },
  { id: 'avatarsdk', label: 'Realistic · 12 MB', src: '/avatars/avatarsdk.glb' },
];

export default function AvatarTest() {
  const amplitudeRef = React.useRef(0);
  const [talking, setTalking] = React.useState(false);
  const [avatar, setAvatar] = React.useState(AVATARS[0]);
  const rafRef = React.useRef(0);

  // For the spike we drive the mouth with a speech-like amplitude envelope
  // (overlapping waves + a little noise). When wired to a real narrator later,
  // this is replaced by reading the playing audio's volume (Web Audio analyser).
  const speak = () => {
    if (talking) return;
    setTalking(true);
    try {
      const u = new SpeechSynthesisUtterance(
        "Bonjour ! Je suis ton avatar parisien. On va parler français ensemble, d'accord ?",
      );
      u.lang = 'fr-FR';
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(u);
    } catch { /* speech synthesis optional */ }

    const start = performance.now();
    const DURATION = 4500;
    const loop = (now) => {
      const elapsed = now - start;
      if (elapsed > DURATION) {
        amplitudeRef.current = 0;
        setTalking(false);
        return;
      }
      const t = elapsed / 1000;
      const base = (Math.sin(t * 10.5) * 0.5 + 0.5) * (Math.sin(t * 4.1) * 0.5 + 0.5);
      const noise = Math.random() * 0.35;
      amplitudeRef.current = Math.min(1, base * 0.8 + noise * 0.35);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  React.useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-paper">
      <header className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[20px] text-navy">
            Avatar <span className="text-wine italic">spike</span>
          </h1>
          <p className="text-[12px] text-navy/50">Idle: blink + sway · Tap “Parler” to test the mouth</p>
        </div>
        <Link to="/" className="text-[11px] font-mono uppercase tracking-widest text-navy/40 hover:text-wine">
          Back
        </Link>
      </header>

      <div className="shrink-0 px-4 pb-2 flex gap-2 flex-wrap">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAvatar(a)}
            className={`rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wide border transition-colors ${
              avatar.id === a.id
                ? 'bg-navy text-ivory border-navy'
                : 'bg-transparent text-navy/60 border-line hover:border-navy'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <TalkingAvatar3D key={avatar.id} src={avatar.src} amplitudeRef={amplitudeRef} />
      </div>

      <footer className="shrink-0 px-4 pb-6 pt-3 flex justify-center">
        <button
          type="button"
          onClick={speak}
          disabled={talking}
          className="bg-wine text-ivory rounded-full font-display italic px-10 py-3 text-[16px] hover:bg-wine2 transition-colors disabled:opacity-50"
        >
          {talking ? 'Parle…' : 'Parler (test)'}
        </button>
      </footer>
    </div>
  );
}
