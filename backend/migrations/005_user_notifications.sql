-- User Notifications: authenticated, recipient-scoped notifications.
--
-- Apply in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: tables, indexes, and policies are created with if not exists or dropped first.
--
-- WHY THIS IS NEEDED
-- Previously, alerts were broadcast over a public realtime channel with no recipient
-- scoping or authentication headers. This table and its RLS policies ensure:
--   1. Only the intended recipient can read, update, or delete their notifications.
--   2. Authenticated users (mentors, recruiters, platform) can insert notifications for target recipients.
--   3. Notifications survive page reloads and cross-session visits.

create table if not exists public.user_notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null,
  recipient_role  text not null check (recipient_role in ('candidate', 'mentor')),
  sender_id       uuid,
  sender_name     text not null default '',
  sender_role     text not null default '',
  type            text not null default 'round2_mentorship',
  title           text not null,
  subtitle        text not null default '',
  details         text default '',
  meeting_id      text default '',
  candidate_name  text default '',
  mentor_name     text default '',
  is_live         boolean not null default false,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists user_notifications_recipient_idx
  on public.user_notifications (recipient_id, created_at desc);

create index if not exists user_notifications_read_idx
  on public.user_notifications (recipient_id, read);

alter table public.user_notifications enable row level security;

-- Drop any previous policies to remain idempotent on re-run
drop policy if exists user_notifications_select_own on public.user_notifications;
drop policy if exists user_notifications_insert on public.user_notifications;
drop policy if exists user_notifications_update_own on public.user_notifications;
drop policy if exists user_notifications_delete_own on public.user_notifications;

-- 1. SELECT: Users can only see notifications where they are the recipient
create policy user_notifications_select_own on public.user_notifications
  for select
  using (recipient_id = auth.uid());

-- 2. INSERT: Any authenticated user (or service role) can create a notification
create policy user_notifications_insert on public.user_notifications
  for insert
  with check (auth.uid() is not null);

-- 3. UPDATE: Recipients can update their own notifications (e.g. mark as read)
create policy user_notifications_update_own on public.user_notifications
  for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- 4. DELETE: Recipients can delete their own notifications
create policy user_notifications_delete_own on public.user_notifications
  for delete
  using (recipient_id = auth.uid());
