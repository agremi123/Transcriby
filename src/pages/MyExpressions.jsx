import React from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav';
import { Container } from '../components/atoms';
import { deleteCorrection, loadCorrections, loadExpressionAudio } from '../lib/correctionsNotebook';
import { beginSiteAudioPlayback, isSiteAudioPlaybackCurrent, registerSiteAudioStop } from '../lib/siteAudio';

function PlayIcon({ paused }) {
  if (paused) {
    return (
      <svg width="6" height="8" viewBox="0 0 10 12" fill="none" aria-hidden>
        <path d="M1 1l8 5-8 5V1z" fill="white" />
      </svg>
    );
  }
  return (
    <svg width="6" height="8" viewBox="0 0 10 12" fill="none" aria-hidden>
      <rect x="1" y="1" width="3" height="10" rx="1" fill="white" />
      <rect x="6" y="1" width="3" height="10" rx="1" fill="white" />
    </svg>
  );
}

function ExpressionAudioButton({ label, disabled, playing, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
        disabled
          ? 'border-navy/10 text-navy/25 cursor-not-allowed'
          : playing
            ? 'border-wine bg-wine/10 text-wine'
            : 'border-navy/15 text-navy/55 hover:border-wine/30 hover:text-wine'
      }`}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
    >
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
        disabled ? 'bg-navy/10' : playing ? 'bg-wine' : 'bg-navy/20'
      }`}>
        <PlayIcon paused={!playing} />
      </span>
      <span className="font-display text-[12px] italic leading-none">{label}</span>
    </button>
  );
}

function ExpressionCard({ entry, onDelete }) {
  const audioRef = React.useRef(null);
  const urlRef = React.useRef({ original: null, corrected: null });
  const sessionRef = React.useRef(null);
  const [playingKind, setPlayingKind] = React.useState(null);
  const [loadingKind, setLoadingKind] = React.useState(null);

  const stopPlayback = React.useCallback(() => {
    sessionRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingKind(null);
    setLoadingKind(null);
  }, []);

  React.useEffect(() => registerSiteAudioStop(stopPlayback), [stopPlayback]);

  React.useEffect(() => () => {
    stopPlayback();
    if (urlRef.current.original) URL.revokeObjectURL(urlRef.current.original);
    if (urlRef.current.corrected) URL.revokeObjectURL(urlRef.current.corrected);
  }, [stopPlayback]);

  const togglePlay = async (kind) => {
    if (loadingKind) return;
    if (playingKind === kind) {
      stopPlayback();
      return;
    }

    const hasAudio = kind === 'original' ? entry.hasOriginalAudio : entry.hasCorrectedAudio;
    if (!hasAudio) return;

    stopPlayback();
    setLoadingKind(kind);

    try {
      if (!urlRef.current[kind]) {
        urlRef.current[kind] = await loadExpressionAudio(entry.id, kind);
      }
      const url = urlRef.current[kind];
      if (!url) return;

      const session = beginSiteAudioPlayback();
      sessionRef.current = session;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (sessionRef.current === session) stopPlayback();
      };

      if (!isSiteAudioPlaybackCurrent(session)) return;

      setPlayingKind(kind);
      await audio.play();
      if (!isSiteAudioPlaybackCurrent(session)) {
        audio.pause();
        stopPlayback();
      }
    } catch {
      stopPlayback();
    } finally {
      setLoadingKind(null);
    }
  };

  return (
    <li className="border border-line/70 bg-ivory/50 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2">
            <p className="font-display text-[15px] text-navy/45 line-through decoration-wine/25">
              {entry.original}
            </p>
            <p className="font-display text-[17px] text-navy leading-snug italic">
              {entry.corrected}
            </p>
            {entry.translation && (
              <p className="text-[13px] text-navy/50 leading-snug">{entry.translation}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ExpressionAudioButton
              label="You"
              disabled={!entry.hasOriginalAudio}
              playing={playingKind === 'original'}
              onClick={() => togglePlay('original')}
            />
            <ExpressionAudioButton
              label="Parisien"
              disabled={!entry.hasCorrectedAudio}
              playing={playingKind === 'corrected'}
              onClick={() => togglePlay('corrected')}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="shrink-0 text-[12px] tracking-wide uppercase text-navy/30 hover:text-wine transition-colors"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function MyExpressions() {
  const [entries, setEntries] = React.useState(() => loadCorrections());

  const refresh = React.useCallback(() => {
    setEntries(loadCorrections());
  }, []);

  React.useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const handleDelete = async (id) => {
    await deleteCorrection(id);
    refresh();
  };

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="pt-[96px] pb-16">
        <Container className="max-w-[720px]">
          <div className="mb-8">
            <Link to="/" className="text-[13px] text-navy/45 hover:text-wine transition-colors">
              ← Back
            </Link>
            <h1 className="mt-4 font-display text-[40px] leading-tight text-navy">
              My <span className="text-wine italic">expressions</span>
            </h1>
            <p className="mt-2 text-[15px] text-navy/60 leading-relaxed">
              Parisian corrections you saved — replay your recording and the corrected version.
            </p>
          </div>

          {entries.length === 0 ? (
            <div className="border border-line/70 bg-ivory/50 px-6 py-10 text-center">
              <p className="font-display text-[18px] text-navy/70">No expressions saved yet.</p>
              <p className="mt-2 text-[14px] text-navy/45">
                Record yourself, tap <span className="italic text-wine">Make it Parisien !</span>, then press{' '}
                <span className="italic text-wine">Save</span> to keep your line and both audios here.
              </p>
              <Link
                to="/"
                className="inline-block mt-6 text-[14px] text-wine hover:text-wine2 transition-colors"
              >
                Start practicing →
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {entries.map((entry) => (
                <ExpressionCard key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </Container>
      </main>
    </div>
  );
}
