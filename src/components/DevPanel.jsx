import React from 'react';

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

export default function DevPanel() {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState('summary'); // 'summary' | 'log'

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

  return (
    <div className="fixed bottom-3 left-3 z-[9999] font-mono text-[11px]">
      {/* Toggle button */}
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

      {open && (
        <div className="absolute bottom-10 left-0 w-[360px] max-h-[520px] flex flex-col rounded-xl shadow-2xl border border-navy/15 bg-ivory/98 backdrop-blur-sm overflow-hidden">
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
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">Total cost</span>
                <span className="text-wine font-bold text-[14px]">{fmtCost(data.totCost)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">Input tkns</span>
                <span className="text-navy font-semibold">{fmt(data.totIn)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">Output tkns</span>
                <span className="text-navy font-semibold">{fmt(data.totOut)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-navy/40 uppercase tracking-wider">API calls</span>
                <span className="text-navy font-semibold">{log.length}</span>
              </div>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex border-b border-navy/10 shrink-0">
            {['summary', 'log'].map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[9px] tracking-widest uppercase transition-colors ${tab === t ? 'border-b-2 border-wine text-wine' : 'text-navy/40 hover:text-navy/70'}`}>
                {t}
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
                    <span className="text-navy/30 shrink-0">{fmtTime(e.ts)}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] text-ivory shrink-0" style={{ background: labelColor(e.label) }}>
                      {e.label}
                    </span>
                    <span className="text-navy/40 shrink-0">{fmt(e.inputTokens)}→{fmt(e.outputTokens)}</span>
                    <span className="text-wine ml-auto shrink-0">{fmtCost(e.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
