import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://sgnvxlnmbvhgscyuents.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_JX4bB9aFm5LtPGGqfoCZaQ_tiDjNWY0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
