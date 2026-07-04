import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initAnalytics } from './lib/analytics';

// Clarity + PostHog — only run when their keys are set (see src/lib/analytics.js)
initAnalytics();

// Cost attribution: tag every same-origin /api/ call with the learner's email
// (X-User-Email) so the server can log AI usage per user + per action.
// One central patch — individual fetch call sites stay untouched.
{
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url.startsWith('/api/')) {
        let email = null;
        try { email = JSON.parse(localStorage.getItem('nativa-learner-profile') || 'null')?.email || null; } catch {}
        if (email) {
          init = { ...(init || {}) };
          init.headers = { ...(init.headers || {}), 'X-User-Email': email };
        }
      }
    } catch { /* never break a request over attribution */ }
    return origFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA service worker — production only, so dev/HMR is never affected
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
