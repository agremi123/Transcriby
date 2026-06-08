-- Add clip_start column so player can seek to the best segment of an episode
ALTER TABLE listening_episodes ADD COLUMN IF NOT EXISTS clip_start integer DEFAULT 0;
