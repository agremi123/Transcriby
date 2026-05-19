/**
 * auth.js — Supabase auth helpers shared by index.html and app.html.
 *
 * Expects window.supabase (loaded via CDN) and window.SUPABASE_CONFIG
 * which is injected inline by each HTML page.
 * Falls back to fetching /api/config if not present.
 */

const Auth = (() => {
  let _client = null;

  async function getClient() {
    if (_client) return _client;

    // Config is written into a <script> tag by the server, or fetched here
    let config = window.SUPABASE_CONFIG;
    if (!config) {
      try {
        const res = await fetch('/api/config');
        config = await res.json();
      } catch {
        console.error('[auth] Could not load Supabase config');
        return null;
      }
    }

    const { createClient } = window.supabase;
    _client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    return _client;
  }

  async function signUp(email, password) {
    const client = await getClient();
    return client.auth.signUp({ email, password });
  }

  async function signIn(email, password) {
    const client = await getClient();
    return client.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    const client = await getClient();
    return client.auth.signOut();
  }

  async function getSession() {
    const client = await getClient();
    const { data } = await client.auth.getSession();
    return data?.session ?? null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user ?? null;
  }

  async function getToken() {
    const session = await getSession();
    return session?.access_token ?? null;
  }

  return { signUp, signIn, signOut, getSession, getUser, getToken };
})();

window.Auth = Auth;
