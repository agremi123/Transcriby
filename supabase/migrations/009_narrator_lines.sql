-- Log every line the narrators speak (text + cached audio URL), so all
-- generated speech is permanently saved alongside its ElevenLabs audio.
create table if not exists narrator_lines (
  id bigint generated always as identity primary key,
  narrator text not null,
  text text not null,
  texthash text not null,
  audiourl text,
  created_at timestamptz not null default now(),
  unique (narrator, texthash)
);
