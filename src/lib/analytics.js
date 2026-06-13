// Analytics for the tester phase — Microsoft Clarity (session recordings +
// heatmaps) and PostHog (recordings + autocaptured events + funnels).
//
// Both are OFF unless their keys are present in the environment, so nothing
// runs in dev or before you've added the keys. Add these in Vercel (Project →
// Settings → Environment Variables) and in your local .env:
//   VITE_PUBLIC_CLARITY_ID    = your Clarity project id (e.g. "abcd1234ef")
//   VITE_PUBLIC_POSTHOG_KEY   = your PostHog project API key (starts with "phc_")
//   VITE_PUBLIC_POSTHOG_HOST  = https://us.i.posthog.com  (or https://eu.i.posthog.com)
//
// Input text is masked by default so testers' typed/sensitive content isn't captured.

import posthog from 'posthog-js';

let started = false;

export function initAnalytics() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const clarityId = import.meta.env.VITE_PUBLIC_CLARITY_ID;
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  // ── Microsoft Clarity — official snippet, only when an id is configured ──
  if (clarityId) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', clarityId);
  }

  // ── PostHog — recordings + autocapture; masks all input text ──
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: true,
      autocapture: true,
      session_recording: { maskAllInputs: true },
    });
  }
}

// Fire a named event (PostHog only). Safe no-op if PostHog isn't configured.
export function track(event, props = {}) {
  try {
    if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) posthog.capture(event, props);
  } catch { /* never let analytics break the app */ }
}
