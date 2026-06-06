-- Reading articles with pre-generated exercises
CREATE TABLE IF NOT EXISTS reading_articles (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL,
  passage     text NOT NULL,
  source      text,
  author      text,
  date        text,
  link        text,
  questions   jsonb DEFAULT '[]',
  vocab       jsonb DEFAULT '[]',
  grammar     jsonb DEFAULT '[]',
  conjugation jsonb DEFAULT '[]',
  served      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reading_articles_served_idx ON reading_articles (served, created_at);

-- Extend listening_episodes with conjugation column
ALTER TABLE listening_episodes ADD COLUMN IF NOT EXISTS conjugation jsonb DEFAULT '[]';

-- Writing prompts pre-generated stock
CREATE TABLE IF NOT EXISTS writing_prompts (
  id          bigserial PRIMARY KEY,
  topic       text NOT NULL DEFAULT '',
  prompt      text NOT NULL,
  word_target integer NOT NULL DEFAULT 80,
  tips        jsonb NOT NULL DEFAULT '{}',
  level       text NOT NULL DEFAULT 'B1',
  served      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS writing_prompts_served_idx ON writing_prompts (served, level, created_at);

-- Speaking prompts pre-generated stock
CREATE TABLE IF NOT EXISTS speaking_prompts (
  id                       bigserial PRIMARY KEY,
  topic                    text NOT NULL DEFAULT '',
  narrator_id              text NOT NULL DEFAULT 'lea',
  opening_line             text NOT NULL,
  opening_line_translation text NOT NULL DEFAULT '',
  topic_label              text NOT NULL DEFAULT '',
  served                   boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS speaking_prompts_served_idx ON speaking_prompts (served, created_at);
