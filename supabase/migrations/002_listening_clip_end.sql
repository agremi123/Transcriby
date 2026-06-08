-- Add clip_end column to listening_episodes (seconds to stop playback, default 3 min)
ALTER TABLE listening_episodes ADD COLUMN IF NOT EXISTS clip_end integer DEFAULT 180;
