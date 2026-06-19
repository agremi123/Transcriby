import React from 'react';
import { useLearnerProfile } from '../context/LearnerProfileContext';

const LABEL_COLORS = {
  'listening': '#8b1e2d',
  'correct':   '#1e3a8a',
  'reading':   '#065f46',
  'practice':  '#92400e',
  'speaking':  '#6b21a8',
  'writing':   '#0f766e',
  'word':      '#b45309',
  'translate': '#475569',
};

function labelColor(label) {
  const prefix = label.split('/')[0];
  return LABEL_COLORS[prefix] || '#374151';
}

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function fmtCost(c) {
  if (c < 0.001) return '<$0.001';
  return '$' + c.toFixed(4);
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Chip({ ok, label }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700 line-through'}`}>
      {label}
    </span>
  );
}

function AudioRecorderButton() {
  const [recording, setRecording] = React.useState(false);
  const streamRef = React.useRef(null);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
    window.dispatchEvent(new Event('dev-sysaudio-stop'));
  }, []);

  const start = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1 },
      });
      displayStream.getVideoTracks().forEach(t => t.stop());

      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        alert('No audio captured.\nPick "Entire Screen" and check "Share system audio".');
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      streamRef.current = audioStream;
      audioTracks[0].addEventListener('ended', stop);

      window.dispatchEvent(new CustomEvent('dev-sysaudio-start', { detail: { stream: audioStream } }));
      setRecording(true);
    } catch {
      stop();
    }
  };

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
        recording
          ? 'border-red-400 bg-red-50/95 text-red-600 hover:bg-red-100'
          : 'border-navy/20 bg-ivory/95 text-navy/50 hover:text-wine hover:border-wine/30'
      }`}
      title={recording ? 'Stop system audio transcription' : 'Transcribe system audio into speech box'}
    >
      {recording ? (
        <>
          <span className="w-2 h-2 rounded-sm bg-red-500 animate-pulse shrink-0" />
          <span className="text-[9px] tracking-widest uppercase">stop</span>
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="6" cy="6" r="2" fill="currentColor" />
          </svg>
          <span className="text-[9px] tracking-widest uppercase">rec</span>
        </>
      )}
    </button>
  );
}

function PassTabButton() {
  const [flash, setFlash] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        // Completes ONLY the exercise sub-tab currently open in the demo
        // (Compréhension / Vocabulaire / Grammaire / Conjugaison). Switch tabs
        // and click again to pass the next one.
        window.dispatchEvent(new Event('dev-pass-subtab'));
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      }}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
        flash
          ? 'border-emerald-400 bg-emerald-50/95 text-emerald-600'
          : 'border-navy/20 bg-ivory/95 text-navy/50 hover:text-emerald-700 hover:border-emerald-500/40'
      }`}
      title="Dev: pass the exercise tab you're currently on (Compréhension / Vocabulaire / Grammaire / Conjugaison)"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2.5 6.5L5 9l4.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[9px] tracking-widest uppercase">{flash ? 'passed' : 'pass tab'}</span>
    </button>
  );
}

function ResetGoalsButton() {
  const { devResetGoals } = useLearnerProfile();
  const [flash, setFlash] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        devResetGoals();                                  // empties the level-progress arrow
        window.dispatchEvent(new Event('dev-reset-subtabs')); // restarts the current article's tabs
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      }}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg shadow-lg border backdrop-blur-sm transition-colors ${
        flash
          ? 'border-amber-400 bg-amber-50/95 text-amber-600'
          : 'border-navy/20 bg-ivory/95 text-navy/50 hover:text-amber-700 hover:border-amber-500/40'
      }`}
      title="Dev: reset all goal progress back to 0 (empties the level-progress arrow and restarts the current exercise's tabs)"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M10 6A4 4 0 112 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M2 3v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[9px] tracking-widest uppercase">{flash ? 'reset' : 'reset'}</span>
    </button>
  );
}

export default function DevPanel() {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState('summary'); // 'summary' | 'log' | 'cache'

  const load = React.useCallback(() => {
    setLoading(true);
    fetch('/api/dev-stats')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Auto-refresh every 5s when open
  React.useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [open, load]);

  const byLabel = data?.byLabel || {};
  const entries = Object.entries(byLabel).sort((a, b) => b[1].cost - a[1].cost);
  const log = data?.log || [];
  const cacheLog = data?.cacheLog || [];

  return (
    <div className="fixed bottom-3 right-3 z-[9999] font-mono text-[11px]">
      {/* Toggle button + logout + recorder */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-lg border border-navy/20 bg-ivory/95 text-navy/70 hover:text-navy transition-colors backdrop-blur-sm"
          title="Dev: token usage"
        >
          <span className="text-[9px] tracking-widest uppercase">Dev</span>
          {data && (
            <span className="text-wine font-semibold">{fmtCost(data.totCost)}</span>
          )}
        </button>
        <button
          type="button"
          onClick={async () => {
            localStorage.removeItem('nativa-learner-profile');
            localStorage.removeItem('nativa-learner-gender');
            localStorage.removeItem('nativa-parisian-percent');
            try { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); } catch {}
            window.location.reload();
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg shadow-lg border border-navy/20 bg-ivory/95 text-navy/50 hover:text-wine hover:border-wine/30 transition-colors backdrop-blur-sm"
          title="Dev: clear profile & logout"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M5 2H2a1 1 0 00-1 1v6a1 1 0 001 1h3M8 9l3-3-3-3M11 6H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[9px] tracking-widest uppercase">logout</span>
        </button>
        <PassTabButton />
        <AudioRecorderButton />
      </div>

      {open && (
        <div className="absolute bottom-10 right-0 w-[360px] max-h-[520px] flex flex-col rounded-xl shadow-2xl border border-navy/15 bg-ivory/98 backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-navy/10 shrink-0">
            <span className="text-[10px] tracking-widest uppercase text-navy/60">Token usage</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={load} className="text-navy/40 hover:text-navy transition-colors" title="Refresh">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 6A4 4 0 112 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M10 3v3H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-navy/40 hover:text-navy transition-colors">✕</button>
            </div>
          </div>

          {/* Totals bar */}
          {data && (
            <div className="flex gap-4 px-3 py-2 border-b border-navy/10 shrink-0 bg-navy/[0.03]">
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">All-time cost</span>
                <span className="text-wine font-bold text-[14px]">{fmtCost(data.allTimeCost ?? data.totCost)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">This session</span>
                <span className="text-navy font-semibold">{fmtCost(data.totCost)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">Calls (all)</span>
                <span className="text-navy font-semibold">{data.allTimeCallCount ?? log.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">This session</span>
                <span className="text-navy font-semibold">{log.length}</span>
              </div>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex border-b border-navy/10 shrink-0">
            {['summary', 'cache', 'log'].map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[9px] tracking-widest uppercase transition-colors ${tab === t ? 'border-b-2 border-wine text-wine' : 'text-navy/40 hover:text-navy/70'}`}>
                {t}{t === 'cache' && cacheLog.length > 0 ? ` (${cacheLog.length})` : ''}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && !data && (
              <div className="flex items-center justify-center h-20 text-navy/30">Loading…</div>
            )}

            {tab === 'summary' && data && (
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] text-navy/40 uppercase tracking-wider border-b border-navy/8">
                    <th className="text-left px-3 py-1.5 font-normal">Call</th>
                    <th className="text-right px-2 py-1.5 font-normal">×</th>
                    <th className="text-right px-2 py-1.5 font-normal">In</th>
                    <th className="text-right px-2 py-1.5 font-normal">Out</th>
                    <th className="text-right px-3 py-1.5 font-normal">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-navy/30 text-[10px]">No API calls yet this session</td></tr>
                  )}
                  {entries.map(([label, s]) => (
                    <tr key={label} className="border-b border-navy/5 hover:bg-navy/[0.02]">
                      <td className="px-3 py-1.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] text-ivory" style={{ background: labelColor(label) }}>
                          {label}
                        </span>
                      </td>
                      <td className="text-right px-2 py-1.5 text-navy/60">{s.calls}</td>
                      <td className="text-right px-2 py-1.5 text-navy/60">{fmt(s.inputTokens)}</td>
                      <td className="text-right px-2 py-1.5 text-navy/60">{fmt(s.outputTokens)}</td>
                      <td className="text-right px-3 py-1.5 text-wine font-semibold">{fmtCost(s.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'log' && (
              <div className="divide-y divide-navy/5">
                {log.length === 0 && (
                  <div className="text-center py-6 text-navy/30 text-[10px]">No calls logged yet</div>
                )}
                {[...log].reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-navy/[0.02]">
                    <span className="text-navy/30 shrink-0">{fmtDate(e.ts)} {fmtTime(e.ts)}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] text-ivory shrink-0" style={{ background: labelColor(e.label) }}>
                      {e.label}
                    </span>
                    <span className="text-navy/40 shrink-0">{fmt(e.inputTokens)}→{fmt(e.outputTokens)}</span>
                    <span className="text-wine ml-auto shrink-0">{fmtCost(e.cost)}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'cache' && (
              <div className="divide-y divide-navy/5">
                {cacheLog.length === 0 && (
                  <div className="text-center py-6 text-navy/30 text-[10px]">No cached/generated content yet</div>
                )}
                {[...cacheLog].reverse().map((e, i) => {
                  const isDB = e.source === 'database';
                  const f = e.fields || {};
                  return (
                    <div key={i} className="px-3 py-2 hover:bg-navy/[0.02]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-navy/30 shrink-0">{fmtDate(e.ts)} {fmtTime(e.ts)}</span>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${isDB ? 'bg-emerald-700 text-white' : 'bg-amber-600 text-white'}`}>
                          {isDB ? '● DB' : '⚡ GEN'}
                        </span>
                        <span className="text-navy/50 shrink-0 text-[9px] uppercase tracking-wider">{e.endpoint}</span>
                        <span className="text-navy/30 shrink-0 text-[9px]">lv.{e.level}</span>
                      </div>
                      {e.title && <div className="text-navy/60 text-[10px] truncate mb-1" title={e.title}>{e.title}</div>}
                      <div className="flex flex-wrap gap-1">
                        <Chip ok={f.text} label="text" />
                        <Chip ok={f.audio} label="audio" />
                        <Chip ok={f.questions > 0} label={`${f.questions ?? 0} questions`} />
                        <Chip ok={f.vocab > 0} label={`${f.vocab ?? 0} vocab`} />
                        <Chip ok={f.grammar > 0} label={`${f.grammar ?? 0} grammar`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
