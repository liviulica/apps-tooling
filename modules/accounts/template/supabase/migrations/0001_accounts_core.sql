-- accounts module: core tables (profiles, user_state, apple_credentials)
-- Vendored by apps-tooling/modules/accounts. Apply with `supabase db push`.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One row per synced namespace per user; payload is opaque jsonb.
create table public.user_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  namespace text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace)
);

alter table public.user_state enable row level security;

create policy "user_state: owner full access"
  on public.user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Apple refresh tokens for deletion-time revocation (TN3194).
-- RLS enabled with NO policies: only the service role (edge functions) can
-- read or write. Never expose this table to clients.
create table public.apple_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_credentials enable row level security;
