-- Store the narrator's spoken explanation with each Parisian word,
-- plus which narrator (lea/jules) it belongs to, so the intro audio
-- can be pre-generated and served with zero loading time.
alter table parisian_words add column if not exists explanation text;
alter table parisian_words add column if not exists narratorid text;
