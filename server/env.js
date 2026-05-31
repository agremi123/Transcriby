import { readFileSync } from 'fs';
import { resolve } from 'path';

function readEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    return Object.fromEntries(
      content.split('\n')
        .filter((line) => line.includes('=') && !line.startsWith('#'))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

export function getEnv() {
  const fileEnv = readEnvFile();
  return {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || fileEnv.DEEPGRAM_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || fileEnv.ELEVENLABS_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY,
  };
}
