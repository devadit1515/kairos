-- Kairos — Postgres schema
--
-- Run once against a fresh Supabase project (SQL Editor → New query → paste → run).
--
-- Design notes:
--   * Every table is keyed on auth.uid() and protected by row-level security.
--     RLS is the whole security model here — the browser talks to Postgres
--     directly with the anon key, so a missing policy is a data leak, not an
--     inconvenience. Nothing is readable without a matching policy.
--   * Ids are text rather than uuid because the client generates them offline
--     (local-first), and we want the same id to survive a later sync rather
--     than being reassigned by the database.
--   * Timestamps are timestamptz. Storing local time in a scheduling product
--     is how you end up an hour wrong twice a year.

-- ---------------------------------------------------------------- extensions
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------- tracks
create table if not exists public.tracks (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  code        text not null default '' check (char_length(code) <= 12),
  color       smallint not null default 0 check (color between 0 and 32),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------- tasks
create table if not exists public.tasks (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  track_id     text references public.tracks (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 400),
  due          timestamptz not null,
  estimate_min integer not null default 60 check (estimate_min >= 0 and estimate_min <= 100000),
  done_min     integer not null default 0 check (done_min >= 0),
  type         text not null default 'task'
               check (type in ('task','writing','project','research','milestone','admin')),
  weight       smallint not null default 2 check (weight between 1 and 3),
  completed    boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------- blocks
create table if not exists public.blocks (
  id        text primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  track_id  text references public.tracks (id) on delete set null,
  task_id   text references public.tasks (id) on delete cascade,
  title     text not null check (char_length(title) between 1 and 400),
  kind      text not null default 'fixed'
            check (kind in ('fixed','focus','prep','milestone','personal')),
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  auto      boolean not null default false,
  pinned    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A zero-length or inverted block would break every layout calculation
  -- downstream; reject it at the source rather than defending everywhere.
  constraint blocks_time_order check (ends_at > starts_at)
);

-- -------------------------------------------------------------- preferences
create table if not exists public.preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  day_start_min   integer not null default 480  check (day_start_min between 0 and 1439),
  day_end_min     integer not null default 1320 check (day_end_min between 1 and 1440),
  min_session_min integer not null default 30,
  max_session_min integer not null default 120,
  buffer_min      integer not null default 10,
  work_days       smallint[] not null default '{0,1,2,3,4,5,6}',
  horizon_days    integer not null default 14,
  updated_at      timestamptz not null default now(),
  constraint prefs_window check (day_end_min > day_start_min),
  constraint prefs_sessions check (max_session_min >= min_session_min)
);

-- ------------------------------------------------------------------ indexes
-- Every read is "my rows, in a date window" — these two cover the app's
-- entire query surface.
create index if not exists tasks_user_due_idx   on public.tasks  (user_id, due);
create index if not exists blocks_user_start_idx on public.blocks (user_id, starts_at);
create index if not exists blocks_task_idx       on public.blocks (task_id);
create index if not exists tracks_user_idx       on public.tracks (user_id);

-- --------------------------------------------------------- updated_at touch
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tracks','tasks','blocks','preferences'] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------ row-level security
alter table public.tracks      enable row level security;
alter table public.tasks       enable row level security;
alter table public.blocks      enable row level security;
alter table public.preferences enable row level security;

-- One policy per table covering all four verbs. `with check` matters as much
-- as `using`: without it a user could update a row to belong to someone else.
do $$
declare t text;
begin
  foreach t in array array['tracks','tasks','blocks'] loop
    execute format('drop policy if exists "%1$s_owner" on public.%1$s;', t);
    execute format($f$
      create policy "%1$s_owner" on public.%1$s
        for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end;
$$;

drop policy if exists "preferences_owner" on public.preferences;
create policy "preferences_owner" on public.preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------- default preferences
-- Give every new account a preferences row so the client never has to branch
-- on "row might not exist yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
