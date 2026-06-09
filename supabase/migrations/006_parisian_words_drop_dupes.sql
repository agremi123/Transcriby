-- Migration 005 mistakenly added camelCase columns to parisian_words, but the
-- table already had the real lowercase columns (exampletranslation, voiceid,
-- audiourl, createdat). The code now writes the lowercase columns, so drop the
-- redundant camelCase duplicates. (Optional cleanup — app works without it.)
ALTER TABLE parisian_words DROP COLUMN IF EXISTS "exampleTranslation";
ALTER TABLE parisian_words DROP COLUMN IF EXISTS "voiceId";
ALTER TABLE parisian_words DROP COLUMN IF EXISTS "audioUrl";
ALTER TABLE parisian_words DROP COLUMN IF EXISTS "createdAt";
