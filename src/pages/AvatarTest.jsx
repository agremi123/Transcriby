// Isolated spike to evaluate a local, API-free 3D talking head.
// Not linked from anywhere in the app — reach it at /avatar-test.
// Now driven by Rémi's REAL ElevenLabs voice through the shared narrator audio
// pipeline + lip-sync engine, so this is a true preview of the final feature:
// jaw opens with her actual volume, mouth shapes follow her words.

import React from 'react';
import { Link } from 'react-router-dom';
import TalkingAvatar3D from '../components/TalkingAvatar3D';
import { fetchNarratorAudio, connectNarratorSource } from '../lib/narratorAudio';
import { playDecodedBuffer } from '../lib/speechHighlight';
import { startLine, setPlaybackTime, stopLine } from '../lib/lipSync';

// Look-test options (all eval-only / non-commercial samples). Swap a shippable
// licensed avatar in later. Bigger file = heavier on mobile — noted per option.
const AVATARS = [
  { id: 'sample', label: 'Stylized · 4.5 MB', src: '/avatars/sample.glb' },
  { id: 'avaturn', label: 'Realistic · 13 MB', src: '/avatars/avaturn.glb' },
  { id: 'avatarsdk', label: 'Realistic · 12 MB', src: '/avatars/avatarsdk.glb' },
];

// Rich in bilabials (m/b/p → lips close), rounded vowels (o/u) and open (a)
// so the articulation is easy to judge.
const LEA_LINE =
  "Bonjour ! Moi, c'est Rémi. On va parler français ensemble, d'accord ? Bienvenue à Paris !";

export default function AvatarTest() {
  const [talking, setTalking] = React.useState(false);
  const [avatar, setAvatar] = React.useState(AVATARS[0]);
  const ctxRef = React.useRef(null);
  const sourceRef = React.useRef(null);

  // Fetch Rémi's real voice, play it, and drive the mouth from the live audio.
  const speak = async () => {
    if (talking) return;
    setTalking(true);
    try {
      const buf = await fetchNarratorAudio(LEA_LINE, 'lea');
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctxRef.current = new AC();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      startLine(LEA_LINE, decoded.duration);
      await playDecodedBuffer(ctx, {
        buffer: decoded,
        narrator: 'lea',
        sourceRef,
        connectSource: connectNarratorSource, // taps the lip-sync analyser
        onTimeUpdate: (t) => setPlaybackTime(t),
      });
    } catch (e) {
      console.warn('[AvatarTest] Rémi audio failed:', e?.message || e);
    } finally {
      stopLine();
      setTalking(false);
    }
  };

  React.useEffect(() => () => {
    try { sourceRef.current?.stop(); } catch { /* noop */ }
    stopLine();
    try { ctxRef.current?.close(); } catch { /* noop */ }
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-paper">
      <header className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[20px] text-navy">
            Avatar <span className="text-wine italic">spike</span>
          </h1>
          <p className="text-[12px] text-navy/50">Idle: blink + sway · Tap “Parler” to hear Rémi + lip-sync</p>
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
        <TalkingAvatar3D key={avatar.id} src={avatar.src} />
      </div>

      <footer className="shrink-0 px-4 pb-6 pt-3 flex justify-center">
        <button
          type="button"
          onClick={speak}
          disabled={talking}
          className="bg-wine text-ivory rounded-full font-display italic px-10 py-3 text-[16px] hover:bg-wine2 transition-colors disabled:opacity-50"
        >
          {talking ? 'Rémi parle…' : 'Parler (Rémi)'}
        </button>
      </footer>
    </div>
  );
}
