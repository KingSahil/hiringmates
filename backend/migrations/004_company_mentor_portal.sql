-- Company & mentor portal.
--
-- Apply in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run.
--
-- WHAT THIS ADDS
--   portal_members      seeded allowlist: 1 company + 4 mentors (single source
--                       of truth for RLS; keep in sync with lib/portal.ts).
--   positions           a company's job card / badge (role, description, tags,
--                       pass threshold, auto vs manual questions).
--   position_questions  the manual question pool written by the company.
--   position_attempts   a student's round-1 attempt and whether they passed.
--   mentorship_slots    a mentor-booked time slot + private meeting id.
--
-- SECURITY NOTES
--   * Students may browse positions (they are job postings) but never read
--     position_questions: that table holds correct answers, and questions are
--     served by the backend with the answers stripped.
--   * Attempts are visible to the student who made them, to the company that
--     owns the position, and to any mentor on the allowlist.
--   * Everything is gated on portal_members / ownership, never on a client
--     claim about who it is.

create table if not exists public.portal_members (
  email text primary key,
  role  text not null check (role in ('company', 'mentor')),
  created_at timestamptz not null default now()
);

-- REPLACE these five addresses with the real ones, and update lib/portal.ts.
insert into public.portal_members (email, role) values
  ('company@hiringmates.app', 'company'),
  ('mentor1@hiringmates.app', 'mentor'),
  ('mentor2@hiringmates.app', 'mentor'),
  ('mentor3@hiringmates.app', 'mentor'),
  ('mentor4@hiringmates.app', 'mentor')
on conflict (email) do update set role = excluded.role;

create table if not exists public.positions (
  id              uuid primary key default gen_random_uuid(),
  owner_email     text not null,
  role            text not null,
  description     text not null default '',
  tags            text[] not null default '{}',
  -- Percent required to pass round 1 and reach a mentor.
  pass_threshold  int not null default 60 check (pass_threshold between 0 and 100),
  question_mode   text not null default 'auto' check (question_mode in ('auto', 'manual')),
  created_at      timestamptz not null default now()
);

create table if not exists public.position_questions (
  id            uuid primary key default gen_random_uuid(),
  position_id   uuid not null references public.positions(id) on delete cascade,
  prompt        text not null,
  kind          text not null default 'mcq' check (kind in ('mcq', 'theory')),
  options       jsonb not null default '[]'::jsonb,
  correct_index int,
  created_at    timestamptz not null default now()
);

create table if not exists public.position_attempts (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  user_id     uuid not null,
  score       numeric,
  passed      boolean,
  answers     jsonb not null default '[]'::jsonb,
  questions   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.mentorship_slots (
  id           uuid primary key default gen_random_uuid(),
  position_id  uuid references public.positions(id) on delete cascade,
  mentor_email text not null,
  student_id   uuid not null,
  scheduled_at timestamptz not null,
  meeting_id   text not null,
  status       text not null default 'scheduled'
                 check (status in ('scheduled', 'completed', 'cancelled')),
  created_at   timestamptz not null default now()
);

create index if not exists positions_owner_idx
  on public.positions (owner_email);
create index if not exists position_questions_position_idx
  on public.position_questions (position_id);
create index if not exists position_attempts_position_idx
  on public.position_attempts (position_id, created_at desc);
create index if not exists position_attempts_user_idx
  on public.position_attempts (user_id, created_at desc);
create index if not exists mentorship_slots_student_idx
  on public.mentorship_slots (student_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select lower(coalesce((select email from auth.users where id = auth.uid()), ''));
$$;

create or replace function public.portal_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.portal_members
  where email = public.current_email();
$$;

-- ---------------------------------------------------------------------------
-- RLS — start clean so re-runs can't leave stale permissive policies.
-- ---------------------------------------------------------------------------
do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array[
    'portal_members', 'positions', 'position_questions',
    'position_attempts', 'mentorship_slots'
  ]
  loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

alter table public.portal_members     enable row level security;
alter table public.positions          enable row level security;
alter table public.position_questions enable row level security;
alter table public.position_attempts  enable row level security;
alter table public.mentorship_slots   enable row level security;

-- portal_members: you may see your own row only.
create policy portal_members_self on public.portal_members
  for select using (email = public.current_email());

-- positions: readable by signed-in users (they are postings); only the owning
-- company may create or change them.
create policy positions_select_authenticated on public.positions
  for select using (auth.role() = 'authenticated');

create policy positions_insert_owner on public.positions
  for insert with check (
    public.portal_role() = 'company'
    and owner_email = public.current_email()
  );

create policy positions_update_owner on public.positions
  for update
  using (owner_email = public.current_email())
  with check (owner_email = public.current_email());

create policy positions_delete_owner on public.positions
  for delete using (owner_email = public.current_email());

-- position_questions: company-only. This table holds correct answers and must
-- never reach a student's browser — the backend serves questions with
-- correct_index stripped.
create policy position_questions_company on public.position_questions
  for all
  using (
    exists (
      select 1 from public.positions p
      where p.id = position_id and p.owner_email = public.current_email()
    )
  )
  with check (
    exists (
      select 1 from public.positions p
      where p.id = position_id and p.owner_email = public.current_email()
    )
  );

-- position_attempts: a student may only read their own attempt ONCE IT IS
-- GRADED (`passed is not null`). While it is in flight the row holds the
-- generated questions with their correct answers, and letting the owner read
-- it would hand them the answer key mid-attempt. The API writes and grades
-- attempts through the service role, which bypasses RLS, so this restriction
-- costs nothing.
create policy position_attempts_select on public.position_attempts
  for select using (
    (user_id = auth.uid() and passed is not null)
    or exists (
      select 1 from public.positions p
      where p.id = position_id and p.owner_email = public.current_email()
    )
    or public.portal_role() = 'mentor'
  );

create policy position_attempts_insert_own on public.position_attempts
  for insert with check (user_id = auth.uid());

-- mentorship_slots: the student sees their own; mentors manage their own.
create policy mentorship_slots_select on public.mentorship_slots
  for select using (
    student_id = auth.uid() or mentor_email = public.current_email()
  );

create policy mentorship_slots_mentor_insert on public.mentorship_slots
  for insert with check (
    public.portal_role() = 'mentor'
    and mentor_email = public.current_email()
  );

create policy mentorship_slots_mentor_update on public.mentorship_slots
  for update
  using (mentor_email = public.current_email())
  with check (mentor_email = public.current_email());
