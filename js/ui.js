/**
 * ui.js — DOM rendering for the whiteboard-style transcript and session history.
 */

const UI = (() => {

  // ── Whiteboard helpers ─────────────────────────────────────────────────────

  function getWhiteboard() {
    return document.getElementById('transcript-area');
  }

  /** Ensure the flow container exists (removes placeholder on first use). */
  function getFlow() {
    const wb = getWhiteboard();
    let flow = wb.querySelector('.wb-flow');
    if (!flow) {
      const placeholder = document.getElementById('transcript-placeholder');
      if (placeholder) placeholder.remove();
      flow = document.createElement('span');
      flow.className = 'wb-flow';
      wb.appendChild(flow);
    }
    return flow;
  }

  /** Returns (or creates) the live partial-text span at the end of the flow. */
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

  // ── Public: partial text (live, in-flight) ─────────────────────────────────

  function setPartial(text) {
    const span = getPartialSpan();
    span.textContent = text ? text + ' ' : '';
    getWhiteboard().scrollTop = getWhiteboard().scrollHeight;
  }

  function clearPartial() {
    const flow = getFlow();
    const span = flow.querySelector('.wb-partial');
    if (span) span.textContent = '';
  }

  /**
   * Converts the current partial span into permanent correctable words.
   * Call this when a sentence is finalised. Returns a sentence ID.
   */
  function commitPartial(sentence) {
    const flow    = getFlow();
    const partial = flow.querySelector('.wb-partial');
    const id      = `s${++_sentenceCounter}`;

    // Replace partial span with a permanent wrapper
    const wrapper = document.createElement('span');
    wrapper.dataset.sid = id;
    _buildSentenceNodes(wrapper, sentence, []);

    if (partial) {
      flow.replaceChild(wrapper, partial);
    } else {
      const hasContent = flow.childNodes.length > 0;
      if (hasContent) flow.appendChild(document.createTextNode(' '));
      flow.appendChild(wrapper);
    }

    getWhiteboard().scrollTop = getWhiteboard().scrollHeight;
    updateStats();
    return id;
  }

  // ── Public: append a finalised sentence ───────────────────────────────────

  /**
   * Inserts corrected words into the flow, just before the partial span.
   * @param {string} sentence
   * @param {Array}  corrections  [{word, error, fix}]
   */
  let _sentenceCounter = 0;

  /** Renders a sentence into the flow. Returns a unique sentence ID for later update. */
  function appendSentence(sentence, corrections = []) {
    const flow    = getFlow();
    const partial = flow.querySelector('.wb-partial') ?? null;
    const id      = `s${++_sentenceCounter}`;

    // Wrapper span so we can replace it later
    const wrapper = document.createElement('span');
    wrapper.dataset.sid = id;

    _buildSentenceNodes(wrapper, sentence, corrections);

    // Space before sentence if flow already has content
    const hasContent = flow.childNodes.length > (partial ? 1 : 0);
    if (hasContent) flow.insertBefore(document.createTextNode(' '), partial);
    flow.insertBefore(wrapper, partial);

    getWhiteboard().scrollTop = getWhiteboard().scrollHeight;
    updateStats();
    return id;
  }

  /** Replaces an existing sentence in-place with corrected version (fade-in). */
  function updateSentence(id, sentence, corrections) {
    const flow    = document.querySelector(`[data-sid="${id}"]`);
    if (!flow) return;
    flow.innerHTML = '';
    flow.style.animation = 'none';
    _buildSentenceNodes(flow, sentence, corrections);
    // Trigger fade-in on corrected words
    flow.querySelectorAll('.wb-word-block').forEach(b => {
      b.style.animation = 'none';
      requestAnimationFrame(() => { b.style.animation = ''; });
    });
    updateStats();
  }

  function _buildSentenceNodes(container, sentence, corrections) {
    const fixMap = new Map();
    for (const c of corrections) {
      fixMap.set(c.word.toLowerCase().replace(/[.,!?;:]+$/, ''), c);
    }

    const tokens = sentence.match(/\S+/g) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const key   = token.toLowerCase().replace(/[.,!?;:]+$/, '');
      const corr  = fixMap.get(key);

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
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  function updateStats() {
    const wb    = getWhiteboard();
    const stats = document.getElementById('transcript-stats');
    if (!stats) return;
    const errors = wb.querySelectorAll('.wb-error').length;
    const words  = wb.querySelectorAll('.wb-word').length;
    stats.textContent = words > 0
      ? `${words} mot${words !== 1 ? 's' : ''} · ${errors} erreur${errors !== 1 ? 's' : ''}`
      : '';
  }

  // ── Session history ────────────────────────────────────────────────────────

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

      const errCount = Array.isArray(s.corrections) ? s.corrections.length : 0;
      const badge = document.createElement('span');
      badge.className = `history-item-badge${errCount === 0 ? ' clean' : ''}`;
      badge.textContent = errCount === 0 ? '✓ Correct' : `${errCount} erreur${errCount !== 1 ? 's' : ''}`;

      item.appendChild(time);
      item.appendChild(sentence);
      item.appendChild(badge);

      item.addEventListener('click', () => appendSentence(s.sentence, s.corrections));
      list.appendChild(item);
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  let toastTimer = null;

  function toast(message, type = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = message;
    el.className = `toast show${type ? ` toast-${type}` : ''}`;
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  function clearTranscript() {
    const wb = getWhiteboard();
    wb.innerHTML = '';
    const p = document.createElement('span');
    p.className = 'wb-placeholder';
    p.id = 'transcript-placeholder';
      p.innerHTML = 'Appuyez sur <strong>Démarrer</strong> et commencez à parler…';
    wb.appendChild(p);
    updateStats();
  }

  return { appendSentence, updateSentence, commitPartial, setPartial, clearPartial, renderHistory, toast, clearTranscript, updateStats };
})();

window.UI = UI;
