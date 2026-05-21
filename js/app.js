/**
 * app.js — Main orchestrator for app.html.
 *
 * Responsibilities:
 *  - Auth guard: redirect to index.html if not logged in.
 *  - Subscription check: show gate overlay if no active subscription.
 *  - Wire up the mic button to Transcribe.start / Transcribe.stop.
 *  - For each final sentence, call /api/correct and render via UI.
 *  - Load + display session history.
 *  - Timer display while recording.
 *  - Stripe Checkout redirect.
 */

// Forward uncaught browser errors to the server terminal
window.onerror = (msg, src, line, col, err) => {
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `${msg} (${src}:${line}:${col})`, stack: err?.stack }) });
};
window.onunhandledrejection = (e) => {
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(e.reason), stack: e.reason?.stack }) });
};

(async () => {
  // ── Auth guard ─────────────────────────────────────────────────────────────

  const session = await Auth.getSession();
  if (!session) {
    window.location.href = '/';
    return;
  }

  const user  = session.user;
  const token = session.access_token;

  document.getElementById('nav-email').textContent = user.email;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await Auth.signOut();
    window.location.href = '/';
  });

  // ── Supabase config injection (needed by auth.js when called from app.html) ─
  // auth.js reads window.SUPABASE_CONFIG — the server injects it via /api/config.
  // If it isn't set yet, fetch it now so the client is initialised.
  if (!window.SUPABASE_CONFIG) {
    try {
      const r = await fetch('/api/config');
      window.SUPABASE_CONFIG = await r.json();
    } catch { /* already initialised */ }
  }

  // ── Checkout query-string feedback ─────────────────────────────────────────

  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    UI.toast('Abonnement activé ! Vous êtes prêt.', 'success');
    window.history.replaceState({}, '', '/app.html');
  } else if (params.get('checkout') === 'cancelled') {
    UI.toast('Paiement annulé.', '');
    window.history.replaceState({}, '', '/app.html');
  }

  // ── Subscription check ─────────────────────────────────────────────────────

  async function checkSubscription() {
    const res = await fetch('/api/subscription-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.active === true;
  }

  const isSubscribed = await checkSubscription();

  if (!isSubscribed) {
    document.getElementById('subscription-gate').classList.remove('hidden');
  }

  document.getElementById('btn-subscribe').addEventListener('click', async () => {
    const btn = document.getElementById('btn-subscribe');
    btn.disabled = true;
      btn.textContent = 'Redirection…';
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      UI.toast(`Checkout error: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Subscribe for $9/month →';
    }
  });

  // ── Session history ────────────────────────────────────────────────────────

  async function loadHistory() {
    try {
      const res = await fetch('/api/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { sessions } = await res.json();
      UI.renderHistory(sessions);
    } catch {
      // Non-fatal
    }
  }

  loadHistory();

  document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);

  // ── Recording state ────────────────────────────────────────────────────────

  let recStartTime = null;
  let timerInterval = null;

  function setRecordingUI(active) {
    const micBtn    = document.getElementById('mic-btn');
    const micLabel  = document.getElementById('mic-label');
    const indicator = document.getElementById('recording-indicator');

    micBtn.classList.toggle('recording', active);
    micLabel.textContent = active ? 'Arrêter' : 'Démarrer';
    indicator.classList.toggle('hidden', !active);

    if (active) {
      recStartTime = Date.now();
      timerInterval = setInterval(() => {
        const secs  = Math.floor((Date.now() - recStartTime) / 1000);
        const m     = Math.floor(secs / 60);
        const s     = String(secs % 60).padStart(2, '0');
        document.getElementById('rec-timer').textContent = `${m}:${s}`;
      }, 500);
    } else {
      clearInterval(timerInterval);
      document.getElementById('rec-timer').textContent = '0:00';
    }
  }

  // ── Transcription + correction loop ───────────────────────────────────────

  async function fetchCorrections(sentence) {
    try {
      const res = await fetch('/api/correct', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sentence }),
      });
      if (!res.ok) {
        console.warn('[correct] non-ok', res.status);
        return [];
      }
      const { corrections } = await res.json();
      return Array.isArray(corrections) ? corrections : [];
    } catch (err) {
      console.error('[correct]', err);
      return [];
    }
  }

  // ── Mic button ─────────────────────────────────────────────────────────────

  const micBtn = document.getElementById('mic-btn');

  micBtn.addEventListener('click', async () => {
    if (Transcribe.recording()) {
      Transcribe.stop();
      setRecordingUI(false);
      return;
    }

    const lang = document.getElementById('lang-select').value;
    document.getElementById('lang-select').disabled = true;
    micBtn.disabled = true;
    document.getElementById('mic-label').textContent = 'Connexion…';

    try {
      await Transcribe.start({ lang,
        onStart() {
          micBtn.disabled = false;
          setRecordingUI(true);
          UI.clearPartial();
        },

        onPartial() {},

        onChunk(text) {
          UI.appendChunk(text);
        },

        onSentence() {},

        onStop() {
          setRecordingUI(false);
          micBtn.disabled = false;
          document.getElementById('lang-select').disabled = false;
        },

        onError(msg) {
          setRecordingUI(false);
          micBtn.disabled = false;
          document.getElementById('lang-select').disabled = false;

          // Report to server terminal so we can diagnose without DevTools
          fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `onError: ${msg}` }) });

          if (msg === 'NO_SUBSCRIPTION') {
            document.getElementById('subscription-gate').classList.remove('hidden');
            return;
          }
          UI.toast(`Error: ${msg}`, 'error');
        },
      });
    } catch (err) {
      micBtn.disabled = false;
      document.getElementById('mic-label').textContent = 'Démarrer';
      fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `catch: ${err.message}`, stack: err.stack }) });
      if (err.message !== 'NO_SUBSCRIPTION') {
        UI.toast(`Could not start recording: ${err.message}`, 'error');
      }
    }
  });

})();
