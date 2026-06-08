-- Add word_timings column for Deepgram word-level timestamps
ALTER TABLE listening_episodes ADD COLUMN IF NOT EXISTS word_timings jsonb DEFAULT NULL;
