-- ProofPocket family sharing: one-time email-bound invitations and explicit purchase sharing.
-- Apply after 20261031000000_household_features_foundation.sql. Not applied automatically.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_email text not null check (char_length(invited_email) between 3 and 254),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists household_invitations_household_idx on public.household_invitations(household_id);
alter table public.household_invitations enable row level security;
revoke all on public.household_invitations from anon, authenticated;

create table if not exists public.household_purchases (
  household_id uuid not null references public.households(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (household_id, purchase_id)
);
create index if not exists household_purchases_purchase_idx on public.household_purchases(purchase_id);
alter table public.household_purchases enable row level security;
revoke all on public.household_purchases from anon, authenticated;
grant select on public.household_purchases to authenticated;
drop policy if exists "Household members can read their household" on public.households;
create policy "Household members can read their household" on public.households
  for select to authenticated using (exists (
    select 1 from public.household_members hm
    where hm.household_id = households.id and hm.user_id = (select auth.uid())
  ));

create policy "Household members read shared purchase links" on public.household_purchases
  for select to authenticated using (exists (
    select 1 from public.household_members m
    where m.household_id = household_purchases.household_id and m.user_id = (select auth.uid())
  ));

-- RLS helper functions avoid recursive policy evaluation between households and members.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $family$
  select auth.uid() is not null and exists (select 1 from public.household_members hm where hm.household_id=p_household_id and hm.user_id=auth.uid());
$family$;
create or replace function public.is_household_owner(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $family$
  select auth.uid() is not null and exists (select 1 from public.households h where h.id=p_household_id and h.owner_id=auth.uid());
$family$;
revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.is_household_owner(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
drop policy if exists "Members can read their memberships" on public.household_members;
create policy "Members can read their memberships" on public.household_members for select to authenticated using ((select auth.uid())=user_id or public.is_household_owner(household_id));
drop policy if exists "Household members can read their household" on public.households;
create policy "Household members can read their household" on public.households for select to authenticated using (public.is_household_member(id));
create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $family$$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;
  insert into public.households(owner_id,name) values(auth.uid(),left(coalesce(nullif(trim(p_name),''),'My household'),80)) returning id into v_id;
  insert into public.household_members(household_id,user_id,role) values(v_id,auth.uid(),'owner');
  return v_id;
end; $family$;

create or replace function public.create_household_invitation(p_household_id uuid,p_invited_email text,p_token text)
returns timestamptz language plpgsql security definer set search_path = public, extensions, pg_temp as $family$$
declare v_expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if length(p_token) < 32 or length(p_token) > 100 then raise exception 'Invalid invitation token'; end if;
  if not exists(select 1 from public.households where id=p_household_id and owner_id=auth.uid()) then raise exception 'Only the household owner can invite members'; end if;
  if (select count(*) from public.household_members where household_id=p_household_id) >= 6 then raise exception 'Household member limit reached'; end if;
  if lower(trim(p_invited_email)) = lower(coalesce(auth.jwt()->>'email','')) then raise exception 'You cannot invite your own email'; end if;
  v_expiry := now() + interval '7 days';
  insert into public.household_invitations(household_id,invited_email,token_hash,invited_by,expires_at)
  values(p_household_id,lower(trim(p_invited_email)),encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex'),auth.uid(),v_expiry);
  return v_expiry;
end; $family$;

create or replace function public.accept_household_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $family$$
declare v_inv public.household_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if length(p_token) < 32 or length(p_token) > 100 then raise exception 'Invalid invitation code'; end if;
  select * into v_inv from public.household_invitations
  where token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and redeemed_at is null and expires_at > now()
  for update;
  if not found then raise exception 'Invitation is invalid, expired, or already used'; end if;
  if lower(coalesce(auth.jwt()->>'email','')) <> lower(v_inv.invited_email) then raise exception 'Sign in with the email address this invitation was sent to'; end if;
  if exists(select 1 from public.household_members where user_id=auth.uid()) then raise exception 'You already belong to a household'; end if;
  if (select count(*) from public.household_members where household_id=v_inv.household_id) >= 6 then raise exception 'Household member limit reached'; end if;
  insert into public.household_members(household_id,user_id,role) values(v_inv.household_id,auth.uid(),'member');
  update public.household_invitations set redeemed_at=now() where id=v_inv.id;
  return v_inv.household_id;
end; $family$;

create or replace function public.share_household_purchase(p_household_id uuid,p_purchase_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $family$$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household_id and user_id=auth.uid()) then raise exception 'Household membership required'; end if;
  if not exists(select 1 from public.purchases where id=p_purchase_id and user_id=auth.uid()) then raise exception 'You can share only your own synced purchases'; end if;
  insert into public.household_purchases(household_id,purchase_id,shared_by) values(p_household_id,p_purchase_id,auth.uid()) on conflict do nothing;
end; $family$;

create or replace function public.unshare_household_purchase(p_household_id uuid,p_purchase_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $family$$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.household_purchases where household_id=p_household_id and purchase_id=p_purchase_id and shared_by=auth.uid();
end; $family$;

create or replace function public.leave_household(p_household_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $family$$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if exists(select 1 from public.households where id=p_household_id and owner_id=auth.uid()) then raise exception 'The owner must delete the household or transfer ownership first'; end if;
  delete from public.household_purchases where household_id=p_household_id and shared_by=auth.uid();
  delete from public.household_members where household_id=p_household_id and user_id=auth.uid();
end; $family$;

create or replace function public.remove_household_member(p_household_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $family$$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.households where id=p_household_id and owner_id=auth.uid()) then raise exception 'Only the owner can remove members'; end if;
  if p_user_id=auth.uid() then raise exception 'Owner cannot remove themselves'; end if;
  delete from public.household_purchases where household_id=p_household_id and shared_by=p_user_id;
  delete from public.household_members where household_id=p_household_id and user_id=p_user_id;
end; $family$;

create or replace function public.get_household_shared_purchases(p_household_id uuid)
returns table(purchase_id uuid,name text,store text,category text,purchase_date date,amount numeric,return_date date,warranty_date date,notes text,shared_by uuid,shared_at timestamptz)
language sql security definer set search_path = public, pg_temp as $family$$
  select p.id,p.name,p.store,p.category,p.purchase_date,p.amount,p.return_date,p.warranty_date,p.notes,hp.shared_by,hp.shared_at
  from public.household_purchases hp join public.purchases p on p.id=hp.purchase_id
  where hp.household_id=p_household_id and exists(select 1 from public.household_members m where m.household_id=p_household_id and m.user_id=auth.uid())
  order by hp.shared_at desc;
$family$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.create_household_invitation(uuid,text,text) from public, anon;
revoke all on function public.accept_household_invitation(text) from public, anon;
revoke all on function public.share_household_purchase(uuid,uuid) from public, anon;
revoke all on function public.unshare_household_purchase(uuid,uuid) from public, anon;
revoke all on function public.leave_household(uuid) from public, anon;
revoke all on function public.remove_household_member(uuid,uuid) from public, anon;
revoke all on function public.get_household_shared_purchases(uuid) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invitation(uuid,text,text) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.share_household_purchase(uuid,uuid) to authenticated;
grant execute on function public.unshare_household_purchase(uuid,uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid,uuid) to authenticated;
grant execute on function public.get_household_shared_purchases(uuid) to authenticated;

-- Extend purchase SELECT only for explicitly shared records; existing owner policies remain intact.
drop policy if exists "Household members read explicitly shared purchases" on public.purchases;
create policy "Household members read explicitly shared purchases" on public.purchases
  for select to authenticated using (exists (
    select 1 from public.household_purchases hp
    join public.household_members hm on hm.household_id=hp.household_id
    where hp.purchase_id=purchases.id and hm.user_id=(select auth.uid())
  ));
