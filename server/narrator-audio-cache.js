import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase.js';

const BUCKET = 'narrator-audio';

/** Single voice per character — always lea or jules in storage paths. */
export function resolveNarrator(input = 'lea') {
  const slug = input === 'jules' || input === 'alex' ? 'jules' : 'lea';
  // Une seule voix pour tout le monde : celle de Rémi (le hash de cache inclut
  // le voiceId, donc l'ancien audio Léa est ignoré et régénéré à la demande).
  const voiceId = 'n1u6R6yj3qEpDLH3liBh';
  return { slug, voiceId };
}

export function narratorStoragePath(slug, voiceId, text) {
  const hash = createHash('sha256').update(`${slug}\0${voiceId}\0${text.trim()}`).digest('hex').slice(0, 20);
  return `${slug}/${hash}.mp3`;
}

export function getNarratorPublicUrl(slug, voiceId, text) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const path = narratorStoragePath(slug, voiceId, text);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function getCachedNarratorAudio(slug, voiceId, text) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const path = narratorStoragePath(slug, voiceId, text);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  const audioUrl = getNarratorPublicUrl(slug, voiceId, text);
  return { buffer, audioUrl };
}

export async function saveNarratorAudio(slug, voiceId, text, buffer) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const path = narratorStoragePath(slug, voiceId, text);
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) {
    console.warn('[narrator-audio] Supabase upload failed:', error.message);
    return null;
  }
  return getNarratorPublicUrl(slug, voiceId, text);
}
