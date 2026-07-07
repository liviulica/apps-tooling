-- accounts module: harden shares access (review findings).
--
-- 0002 shipped two holes:
--   1. SELECT exposed every UNCLAIMED share to any signed-in user (RLS filters
--      rows; it does not require knowing an id), leaking sender_id + note.
--   2. The claim UPDATE policy had no column guards, so a "claimer" could
--      rewrite item_ref/note/sender_id while claiming.
-- Fix: shares are visible only to their sender and claimant; link resolution
-- goes through get_share(id); claiming goes through claim_share(id), which can
-- only set claimed_by/claimed_at. Senders can revoke (delete) their shares.

drop policy "shares: visible to sender, claimant, or unclaimed" on public.shares;
create policy "shares: visible to sender or claimant"
  on public.shares for select
  using (auth.uid() = sender_id or auth.uid() = claimed_by);

-- Claiming happens only through claim_share(); with no UPDATE policy, RLS
-- denies direct updates by default.
drop policy "shares: claim an unclaimed share" on public.shares;

create policy "shares: sender can revoke"
  on public.shares for delete
  using (auth.uid() = sender_id);

-- Resolve a share link without exposing the table. Returns only what the
-- claim screen needs; holding the unguessable id is the capability.
create or replace function public.get_share(share_id uuid)
returns table (id uuid, item_ref text, note text, created_at timestamptz, claimed boolean)
language sql
security definer set search_path = ''
stable
as $$
  select s.id, s.item_ref, s.note, s.created_at, (s.claimed_by is not null) as claimed
  from public.shares s
  where s.id = share_id;
$$;

-- Claim atomically: only flips claimed_by/claimed_at, only while unclaimed.
create or replace function public.claim_share(share_id uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare updated integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.shares
    set claimed_by = auth.uid(), claimed_at = now()
    where id = share_id and claimed_by is null;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.get_share(uuid) from public;
grant execute on function public.get_share(uuid) to authenticated;
revoke all on function public.claim_share(uuid) from public;
grant execute on function public.claim_share(uuid) to authenticated;
