-- Reading articles are now graded to the learner's CEFR level (beginners get a
-- simplified / Fabulang story, advanced learners get native press). Add a level
-- column so handleReading can serve level-matched articles, mirroring
-- listening_episodes.level. Existing rows default to B1 (native-press level).
ALTER TABLE reading_articles ADD COLUMN IF NOT EXISTS level text DEFAULT 'B1';

-- Serve fast: filter by level + served, ordered by age.
CREATE INDEX IF NOT EXISTS reading_articles_level_served_idx
  ON reading_articles (level, served, created_at);
