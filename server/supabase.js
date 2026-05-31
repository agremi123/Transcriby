import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

const BUCKET = 'narrator-audio';

let supabaseAdmin = null;

export function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const {
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  } = getEnv();
  if (!NEXT_PUBLIC_SUPABASE_URL) return null;
  const key = SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) return null;
  supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, key);
  return supabaseAdmin;
}

export function isNarratorAudioCacheEnabled() {
  return !!getSupabaseAdmin();
}
