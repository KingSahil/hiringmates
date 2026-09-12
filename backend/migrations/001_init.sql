-- Initial schema for the hiringmates RAG backend.
--
-- Apply with: psql "$SUPABASE_URL" -f migrations/001_init.sql
-- (or paste into the Supabase SQL editor)
--
-- IMPORTANT: the backend connects with the SERVICE ROLE key, which bypasses
-- RLS. The policies below are defence in depth for any anon/authenticated
-- access; they are NOT the only thing protecting tenant isolation. The service
-- layer must enforce it too.

-- ---------------------------------------------------------------------------
-- Extraction cache
-- Keyed by the identity pair (github_email|google_email). Only gates
-- RE-EXTRACTION; candidate profiles persist independently of this.
-- Deliberately has NO user-facing policy: it contains a full detector report
-- and is service-role only.
-- ---------------------------------------------------------------------------
create table if not exists extractions (
  cache_key       text primary key,
  handle          text        not null,
  detector_output jsonb       not null,
  -- 'detector' = freshly extracted, 'cache' = reused from a previous run.
  -- Must exist: the Extraction model carries this field, so writes fail with
  -- PGRST204 if the column is missing.
  source          text        not null default 'detector',
  created_at      timestamptz not null default now()
);

create index if not exists extractions_created_at_idx on extractions (created_at);

-- ---------------------------------------------------------------------------
-- Sessions: one onboarding run, polling-friendly.
-- `payload` is the whole Session model as jsonb so the state machine can evolve
-- without a migration per field change.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  id         text primary key,
  user_id    text        not null,
  scenario   text        not null,
  status     text        not null,
  payload    jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_status_idx  on sessions (status);

-- ---------------------------------------------------------------------------
-- Candidate profiles: the durable, expensive artifact. Outlives the extraction
-- cache TTL, so never give this one a retention window tied to EXTRACTION_TTL_DAYS.
-- ---------------------------------------------------------------------------
create table if not exists candidate_profiles (
  user_id    text primary key,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Served questions: anti-repeat. Question reuse is what enables cheating, so we
-- remember what each candidate has already been asked and pass recent prompts
-- back to the model. Becomes a pgvector similarity lookup later.
-- ---------------------------------------------------------------------------
create table if not exists served_questions (
  id         bigserial primary key,
  user_id    text        not null,
  prompt     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists served_questions_user_created_idx
  on served_questions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table sessions          enable row level security;
alter table candidate_profiles enable row level security;
alter table served_questions  enable row level security;
alter table extractions       enable row level security;

drop policy if exists sessions_owner on sessions;
create policy sessions_owner on sessions
  for select using (auth.uid()::text = user_id);

drop policy if exists candidate_profiles_owner on candidate_profiles;
create policy candidate_profiles_owner on candidate_profiles
  for select using (auth.uid()::text = user_id);

drop policy if exists served_questions_owner on served_questions;
create policy served_questions_owner on served_questions
  for select using (auth.uid()::text = user_id);

-- No policy on extractions => anon/authenticated get nothing. Service role
-- bypasses RLS, so the backend can still read and write it.
