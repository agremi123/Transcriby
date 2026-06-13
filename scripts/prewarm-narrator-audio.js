#!/usr/bin/env node
/**
 * Pre-warm the narrator audio cache with common Parisian phrases.
 *
 * Léa and Jules reuse a lot of short reactions ("Bravo !", "Presque !",
 * "Vas-y, refais-moi une phrase !", …). This script generates each one with
 * ElevenLabs *once* and saves it to the Supabase cache + narrator_lines log.
 * After that, whenever a narrator says one of these lines it's served from
 * cache for free — ElevenLabs is never charged again.
 *
 * Usage:
 *   node scripts/prewarm-narrator-audio.js            # Léa (default)
 *   node scripts/prewarm-narrator-audio.js --narrator=jules
 *   node scripts/prewarm-narrator-audio.js --both     # Léa + Jules
 *   node scripts/prewarm-narrator-audio.js --dry-run  # list phrases, no API calls
 *
 * Safe to re-run any time: already-cached phrases are skipped (no cost).
 */

import { handleElevenLabsTts } from '../server/handlers.js';

// Curated set of natural Parisian micro-phrases that recur across the app
// (chat reactions, encouragements, retry prompts, greetings). Several are
// lifted straight from the app's own prompt examples, so they genuinely repeat.
const PHRASES = [
  // — Praise (correct answer) —
  'Bravo, c\'est exactement ça !',
  'Parfait, tu gères !',
  'Super, c\'est tout à fait juste !',
  'Nickel, rien à redire !',
  'Excellent, continue comme ça !',
  'Voilà, t\'as tout compris !',
  'Top, c\'est parfait !',
  'Bien vu !',
  // — Near-miss / retry —
  'Presque !',
  'Pas tout à fait, mais t\'y es presque !',
  'Allez, tente une autre !',
  'Vas-y, refais-moi une phrase !',
  'Encore une, pour voir ?',
  'Une dernière pour la route !',
  'Réessaie, tu vas y arriver !',
  'C\'est pas loin, recommence !',
  // — Conversational reactions —
  'Ah ouais ? Raconte-moi !',
  'Intéressant, dis-m\'en plus !',
  'Ah, je vois !',
  'Carrément !',
  'Ah, c\'est marrant ça !',
  'Attends, j\'ai pas bien compris.',
  'Tu peux répéter, s\'il te plaît ?',
  'Haha, j\'adore !',
  'Trop bien !',
  'Oh là là !',
  'Sérieux ?',
  'Et alors, qu\'est-ce qui s\'est passé ?',
  'Vas-y, je t\'écoute !',
  // — Greetings / starts —
  'Salut ! Comment ça va aujourd\'hui ?',
  'Coucou ! Prêt à pratiquer ton français ?',
  'Alors, on parle de quoi aujourd\'hui ?',
  'Bienvenue ! On commence quand tu veux.',
  // — Closings —
  'Allez, à très vite !',
  'C\'était top, continue comme ça !',
  'On se refait ça bientôt !',
  // — Word practice —
  'Essaie maintenant de l\'utiliser dans une phrase !',
  'À toi de jouer !',
  'Fais-moi une phrase avec ce mot.',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const both = args.includes('--both');
const narratorArg = (args.find((a) => a.startsWith('--narrator=')) || '').split('=')[1];
const narrators = both ? ['lea', 'jules'] : [narratorArg || 'lea'];

async function run() {
  console.log(`\nPre-warming ${PHRASES.length} phrases for: ${narrators.join(', ')}${dryRun ? '  (dry run)' : ''}\n`);

  let hits = 0;
  let misses = 0;
  let errors = 0;

  for (const narrator of narrators) {
    console.log(`\n=== ${narrator.toUpperCase()} ===`);
    for (const text of PHRASES) {
      if (dryRun) {
        console.log(`  · ${text}`);
        continue;
      }
      try {
        const res = await handleElevenLabsTts({ text, narrator });
        if (res.statusCode !== 200) {
          errors++;
          console.log(`  ✗ [${res.statusCode}] ${text}  — ${JSON.stringify(res.body).slice(0, 80)}`);
          continue;
        }
        if (res.body?.cached) {
          hits++;
          console.log(`  ↩ cached   ${text}`);
        } else {
          misses++;
          console.log(`  ✓ generated ${text}`);
        }
      } catch (err) {
        errors++;
        console.log(`  ✗ error    ${text}  — ${err.message}`);
      }
    }
  }

  if (!dryRun) {
    console.log(`\nDone. Already-cached: ${hits} | Newly generated (billed once): ${misses} | Errors: ${errors}\n`);
  }
}

run().catch((err) => {
  console.error('Pre-warm failed:', err);
  process.exit(1);
});
