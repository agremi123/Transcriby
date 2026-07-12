-- ─────────────────────────────────────────────────────────────────────────────
-- COST TRACKER TABLE — run this ONCE in Supabase → SQL Editor → New query.
-- After that, every AI call (Claude, ElevenLabs voice, Deepgram transcription)
-- logs one row here with the user's email, the site action, and the cost.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_email text,
  action text,                 -- ex. 'writing-review:feedback', 'elevenlabs-tts', 'reading'
  provider text not null,      -- 'anthropic' | 'elevenlabs' | 'deepgram' | 'openai-tts'
  model text,
  input_tokens integer,
  output_tokens integer,
  characters integer,          -- TTS characters
  seconds real,                -- transcribed audio seconds
  cost_usd numeric(12,6) not null default 0
);

-- Lock the table down: only the server (service role key) can write/read it.
alter table usage_events enable row level security;

-- Speed up the two queries below.
create index if not exists usage_events_user_idx on usage_events (user_email, created_at);
create index if not exists usage_events_action_idx on usage_events (action, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- READY-MADE QUERIES — paste each one in the SQL editor when you want a report.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Cost per user (who costs the most, all time)
-- select user_email,
--        count(*)                as calls,
--        sum(input_tokens)       as tokens_in,
--        sum(output_tokens)      as tokens_out,
--        round(sum(cost_usd), 4) as total_usd
-- from usage_events
-- group by user_email
-- order by total_usd desc;

-- 2) Cost per action (which feature costs the most, last 30 days)
-- select action, provider,
--        count(*)                as calls,
--        round(sum(cost_usd), 4) as total_usd
-- from usage_events
-- where created_at > now() - interval '30 days'
-- group by action, provider
-- order by total_usd desc;

-- 3) One user in detail (replace the email)
-- select created_at::date as day, action, provider,
--        input_tokens, output_tokens, characters, seconds, cost_usd
-- from usage_events
-- where user_email = 'someone@example.com'
-- order by created_at desc
-- limit 200;

-- 4) Daily spend, last 14 days
-- select created_at::date as day, round(sum(cost_usd), 4) as total_usd
-- from usage_events
-- where created_at > now() - interval '14 days'
-- group by 1 order by 1 desc;
