-- In-app feedback (the review ask's unhappy path, and the Settings
-- "Share feedback" door). Insert-only from the app via the app-feedback edge
-- function; nothing in the client can read it back.
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 2000),
  app_version text not null default '' check (char_length(app_version) <= 32),
  platform text not null default '' check (platform in ('ios', 'android', '')),
  -- Nullable ON PURPOSE: feedback works signed out. When a session exists the
  -- edge function stamps the user id so we can answer a reader who asked for
  -- something, and account deletion must erase their notes (5.1.1(v)).
  user_id uuid references auth.users (id) on delete cascade
);

alter table public.app_feedback enable row level security;

-- No policies at all: anon and authenticated can neither select nor insert
-- directly. The app-feedback edge function writes with the service role after
-- validating, which is the entire write path.

-- Reading feedback is dashboard-only (service role).
comment on table public.app_feedback is
  'In-app feedback notes. Written only by the app-feedback edge function; read only from the dashboard.';
