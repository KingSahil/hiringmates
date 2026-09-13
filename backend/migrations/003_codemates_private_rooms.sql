-- CodeMates: private, unlisted lobbies joined by exact code.
--
-- Apply in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: everything is guarded and existing policies are dropped first.
--
-- WHY THIS IS NEEDED
-- The tables already exist, but RLS on `rooms` is wide open: any authenticated
-- user can read every room and therefore every join code. Lobbies are only
-- private once RLS scopes them to host + members, and joining happens through a
-- security-definer function (a client cannot SELECT a room it is not a member
-- of, so a code lookup has to bypass RLS deliberately).
--
-- WHAT IT CHANGES
--   * rooms         -> visible only to the host or a member. No browse list.
--   * room_members  -> visible only to members; you may only add yourself.
--   * messages      -> readable/writable only by room members.
--   * profiles      -> readable by signed-in users; you may only edit your own.
--   * RPCs          -> create_room, join_room_by_code, leave_room.
--   * trigger       -> auto-creates a profile row on signup so display names
--                      and the messages -> profiles join always resolve.

-- ---------------------------------------------------------------------------
-- 0. Start from a clean slate: drop every existing policy on these tables.
--    (Dropping only policies we know the names of would leave older permissive
--    ones in place, and the rooms would still be enumerable.)
-- ---------------------------------------------------------------------------
do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array['rooms', 'room_members', 'messages', 'profiles']
  loop
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.messages     enable row level security;
alter table public.profiles     enable row level security;

-- Codes must be unique for join-by-code to be unambiguous.
create unique index if not exists rooms_code_key on public.rooms (code);

-- ---------------------------------------------------------------------------
-- 1. Membership helper
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. rooms: host or member only
-- ---------------------------------------------------------------------------
create policy rooms_select_scope on public.rooms
  for select
  using (host_id = auth.uid() or public.is_room_member(id));

create policy rooms_insert_own on public.rooms
  for insert
  with check (host_id = auth.uid());

create policy rooms_update_host on public.rooms
  for update
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy rooms_delete_host on public.rooms
  for delete
  using (host_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. room_members
--    Direct inserts are limited to the host adding themselves, so knowing a
--    room UUID is not enough to sneak in. Joining runs through the RPC below.
-- ---------------------------------------------------------------------------
create policy room_members_select on public.room_members
  for select
  using (public.is_room_member(room_id));

create policy room_members_insert_self on public.room_members
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
  );

create policy room_members_delete_self on public.room_members
  for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. messages: members only
-- ---------------------------------------------------------------------------
create policy messages_select_member on public.messages
  for select
  using (public.is_room_member(room_id));

create policy messages_insert_member on public.messages
  for insert
  with check (public.is_room_member(room_id) and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_authenticated on public.profiles
  for select
  using (auth.role() = 'authenticated');

create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Auto-create a profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any signed-in users that predate the trigger.
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Room RPCs (security definer: they bypass RLS on purpose, and each one
--    still checks auth.uid() itself)
-- ---------------------------------------------------------------------------
create or replace function public.create_room(p_title text, p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.rooms (code, title, status, host_id)
  values (
    upper(trim(p_code)),
    coalesce(nullif(trim(p_title), ''), 'Multiplayer Challenge'),
    'waiting',
    auth.uid()
  )
  returning * into v_room;

  insert into public.room_members (room_id, user_id)
  values (v_room.id, auth.uid())
  on conflict do nothing;

  return v_room;
end;
$$;

create or replace function public.join_room_by_code(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  limit 1;

  if v_room.id is null then
    raise exception 'room_not_found';
  end if;

  -- Idempotent: re-joining or refreshing after a join is harmless.
  insert into public.room_members (room_id, user_id)
  values (v_room.id, auth.uid())
  on conflict do nothing;

  return v_room;
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.room_members
  where room_id = p_room_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.create_room(text, text)      to authenticated;
grant execute on function public.join_room_by_code(text)      to authenticated;
grant execute on function public.leave_room(uuid)             to authenticated;
grant execute on function public.is_room_member(uuid)         to authenticated;
