import { getSupabaseAdmin } from './supabase.js';

// "Show example" model answers are stored on the writing_prompts row (column
// `example`), so each generated example is linked to the exact prompt AND the
// conseils (tips) it was generated against — one row holds prompt + tips +
// example. Reused on later requests so we never regenerate the same example.
//
// All functions degrade gracefully: if Supabase isn't configured or the
// `example` column hasn't been added yet (migration 010), they no-op and the
// caller just generates fresh, exactly like before.

export async function getStoredWritingExample(prompt) {
  const sb = getSupabaseAdmin();
  if (!sb || !prompt) return null;
  try {
    const { data, error } = await sb
      .from('writing_prompts')
      .select('example')
      .eq('prompt', prompt)
      .not('example', 'is', null)
      .limit(1);
    if (error) return null;
    const ex = data?.[0]?.example;
    return ex && ex.trim() ? ex.trim() : null;
  } catch {
    return null;
  }
}

export async function saveWritingExample({ prompt, tips = {}, wordTarget = 80, level = 'B1', example }) {
  const sb = getSupabaseAdmin();
  if (!sb || !prompt || !example) return;
  try {
    // Prefer linking onto the existing prompt row; otherwise store a standalone
    // row (served=true so it never enters the unserved challenge stock).
    const { data, error } = await sb.from('writing_prompts').select('id').eq('prompt', prompt).limit(1);
    if (error) return; // column/table issue — skip silently
    if (data && data.length) {
      await sb.from('writing_prompts').update({ example }).eq('id', data[0].id);
    } else {
      await sb.from('writing_prompts').insert([{ topic: '', prompt, word_target: wordTarget, tips, level, example, served: true }]);
    }
  } catch (err) {
    if (!/example/.test(err?.message || '')) console.warn('[writing-example] save failed:', err?.message);
  }
}
