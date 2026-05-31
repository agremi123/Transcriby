import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase.js';

const BUCKET = 'narrator-audio';

export function narratorStoragePath(narrator, voiceId, text) {
  const hash = createHash('sha256').update(`${narrator}\0${voiceId}\0${text}`).digest('hex').slice(0, 20);
  return `${narrator}/${hash}.mp3`;
}

export function getNarratorPublicUrl(narrator, voiceId, text) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const path = narratorStoragePath(narrator, voiceId, text);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function getCachedNarratorAudioUrl(narrator, voiceId, text) {
  const publicUrl = getNarratorPublicUrl(narrator, voiceId, text);
  if (!publicUrl) return null;
  try {
    const res = await fetch(publicUrl, { method: 'HEAD' });
    if (res.ok) return publicUrl;
  } catch {}
  return null;
}

export async function saveNarratorAudio(narrator, voiceId, text, buffer) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const path = narratorStoragePath(narrator, voiceId, text);
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) {
    console.warn('[narrator-audio] Supabase upload failed:', error.message);
    return null;
  }
  return getNarratorPublicUrl(narrator, voiceId, text);
}
