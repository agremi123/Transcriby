/**
 * ui.js — Whiteboard-style inline transcript rendering.
 */

const UI = (() => {
  let _sid = 0;

  // ── Internal helpers ───────────────────────────────────────────────────────

  function wb() { return document.getElementById('transcript-area'); }

  function getFlow() {
    const board = wb();
    let flow = board.querySelector('.wb-flow');
    if (!flow) {
      const ph = document.getElementById('transcript-placeholder');
      if (ph) ph.remove();
      flow = document.createElement('span');
      flow.className = 'wb-flow';
      board.appendChild(flow);
    }
    return flow;
  }

  function getPartialSpan() {
    const flow = getFlow();
    let span = flow.querySelector('.wb-partial');
    if (!span) {
      span = document.createElement('span');
      span.className = 'wb-partial';
      flow.appendChild(span);
    }
    return span;
  }

  function buildWords(container, sentence, corrections) {
    const fixMap = new Map();
    for (const c of corrections) {
      fixMap.set(c.word.toLowerCase().replace(/[.,!?;:]+$/, ''), c);
    }

    const tokens = sentence.match(/\S+/g) ?? [];
    tokens.forEach((token, i) => {
      const key  = token.toLowerCase().replace(/[.,!?;:]+$/, '');
      const corr = fixMap.get(key);

      if (corr) {
        const block = document.createElement('span');
        block.className = 'wb-word-block';

        const w = document.createElement('span');
        w.className = 'wb-word wb-error';
        w.textContent = token;
        w.title = corr.error;

        const f = document.createElement('span');
        f.className = 'wb-fix';
        f.textContent = corr.fix;

        block.appendChild(w);
        block.appendChild(f);
        container.appendChild(block);
      } else {
        const w = document.createElement('span');
        w.className = 'wb-word';
        w.textContent = token;
        container.appendChild(w);
      }

      if (i < tokens.length - 1) container.appendChild(document.createTextNode(' '));
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Appends a confirmed transcript chunk immediately — no animation, no sentence wrapping.
   * This is the main display path for pure transcription mode.
   */
  function appendChunk(text) {
    if (!text?.trim()) return;
    const flow = getFlow();
    const partial = flow.querySelector('.wb-partial') ?? null;
    // Space before chunk if there's already content
    const hasContent = [...flow.childNodes].some(n => n !== partial &&
      (n.nodeType === Node.TEXT_NODE ? n.textContent.trim() : true));
    if (hasContent) flow.insertBefore(document.createTextNode(' '), partial);
    const span = document.createElement('span');
    span.textContent = text;
    flow.insertBefore(span, partial);
    wb().scrollTop = wb().scrollHeight;
  }

  /** Updates the live partial text at the end of the flow. */
  function setPartial(text) {
    getPartialSpan().textContent = text ? text + ' ' : '';
    wb().scrollTop = wb().scrollHeight;
  }

  function clearPartial() {
    const span = getFlow().querySelector('.wb-partial');
    if (span) span.textContent = '';
  }

  /**
   * Appends a finalised sentence (with optional corrections) before the partial.
   * Returns a sentence ID for in-place updates.
   */
  function appendSentence(sentence, corrections = []) {
    const flow    = getFlow();
    const partial = flow.querySelector('.wb-partial') ?? null;
    const id      = `s${++_sid}`;

    const wrapper = document.createElement('span');
    wrapper.dataset.sid = id;
    buildWords(wrapper, sentence, corrections);

    // Space separator before new sentence
    const hasContent = [...flow.childNodes].some(n =>
      n !== partial && (n.nodeType === 3 ? n.textContent.trim() : true)
    );
    if (hasContent) flow.insertBefore(document.createTextNode(' '), partial);
    flow.insertBefore(wrapper, partial);

    wb().scrollTop = wb().scrollHeight;
    updateStats();
    return id;
  }

  /** Replaces a sentence in-place with corrected version. */
  function updateSentence(id, sentence, corrections) {
    const wrapper = document.querySelector(`[data-sid="${id}"]`);
    if (!wrapper) return;
    wrapper.innerHTML = '';
    buildWords(wrapper, sentence, corrections);
    updateStats();
  }

  function updateStats() {
    const board = wb();
    const stats = document.getElementById('transcript-stats');
    if (!stats) return;
    const words  = board.querySelectorAll('.wb-word').length;
    const errors = board.querySelectorAll('.wb-error').length;
    stats.textContent = words > 0
      ? `${words} mot${words !== 1 ? 's' : ''} · ${errors} erreur${errors !== 1 ? 's' : ''}`
      : '';
  }

  // ── History sidebar ────────────────────────────────────────────────────────

  function renderHistory(sessions) {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';

    if (!sessions?.length) {
      list.innerHTML = '<p class="history-empty">Aucune séance pour l\'instant.</p>';
      return;
    }

    for (const s of sessions) {
      const item = document.createElement('div');
      item.className = 'history-item';

      const time = document.createElement('div');
      time.className = 'history-item-time';
      time.textContent = new Date(s.created_at).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      const sentence = document.createElement('div');
      sentence.className = 'history-item-sentence';
      sentence.textContent = s.sentence;

      const n = Array.isArray(s.corrections) ? s.corrections.length : 0;
      const badge = document.createElement('span');
      badge.className = `history-item-badge${n === 0 ? ' clean' : ''}`;
      badge.textContent = n === 0 ? '✓ Correct' : `${n} erreur${n !== 1 ? 's' : ''}`;

      item.appendChild(time);
      item.appendChild(sentence);
      item.appendChild(badge);
      item.addEventListener('click', () => appendSentence(s.sentence, s.corrections));
      list.appendChild(item);
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  let _toastTimer;
  function toast(message, type = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(_toastTimer);
    el.textContent = message;
    el.className = `toast show${type ? ` toast-${type}` : ''}`;
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function clearTranscript() {
    const board = wb();
    board.innerHTML = '';
    const p = document.createElement('span');
    p.className = 'wb-placeholder';
    p.id = 'transcript-placeholder';
    p.innerHTML = 'Appuyez sur <strong>Démarrer</strong> et commencez à parler…';
    board.appendChild(p);
    updateStats();
  }

  return { appendChunk, appendSentence, updateSentence, setPartial, clearPartial, renderHistory, toast, clearTranscript, updateStats };
})();

window.UI = UI;
