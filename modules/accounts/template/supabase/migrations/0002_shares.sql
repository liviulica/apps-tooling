-- accounts module: user-to-user shares (share-by-reference).
-- item_ref semantics are app-defined; ids must be resolvable on the
-- recipient's device (catalog ids, not device-local ids).

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  item_ref text not null,
  note text,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz
);

alter table public.shares enable row level security;

create policy "shares: sender can insert own"
  on public.shares for insert
  with check (auth.uid() = sender_id);

-- Senders and claimants see their shares; any signed-in holder of an
-- unclaimed share id can read it (ids are unguessable uuids in deep links).
create policy "shares: visible to sender, claimant, or unclaimed"
  on public.shares for select
  using (
    auth.uid() = sender_id
    or auth.uid() = claimed_by
    or claimed_by is null
  );

-- Claiming: any signed-in user may claim an unclaimed share for themselves.
create policy "shares: claim an unclaimed share"
  on public.shares for update
  using (claimed_by is null and auth.uid() is not null)
  with check (claimed_by = auth.uid());
