-- Parisian words cache was missing columns the generator writes, so every
-- insert silently failed (PGRST204) and no words were ever cached.
ALTER TABLE parisian_words ADD COLUMN IF NOT EXISTS "exampleTranslation" text;
ALTER TABLE parisian_words ADD COLUMN IF NOT EXISTS "voiceId" text;
ALTER TABLE parisian_words ADD COLUMN IF NOT EXISTS "audioUrl" text;
ALTER TABLE parisian_words ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
