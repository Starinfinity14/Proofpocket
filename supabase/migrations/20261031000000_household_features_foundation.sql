-- ProofPocket household features foundation: private receipt storage, household membership, and reminder preferences.
-- Existing purchase records and Plus billing remain unchanged.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My household' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists households_owner_id_idx on public.households(owner_id);
alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;
grant select, insert, update, delete on public.households to authenticated;
drop policy if exists "Household owners manage households" on public.households;
create policy "Household owners manage households" on public.households
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_id_idx on public.household_members(user_id);
alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;
grant select, insert, delete on public.household_members to authenticated;
drop policy if exists "Members can read their memberships" on public.household_members;
create policy "Members can read their memberships" on public.household_members
  for select to authenticated
  using ((select auth.uid()) = user_id or exists (
    select 1 from public.households h
    where h.id = household_id and h.owner_id = (select auth.uid())
  ));
drop policy if exists "Owners can add household members" on public.household_members;
create policy "Owners can add household members" on public.household_members
  for insert to authenticated
  with check (exists (
    select 1 from public.households h
    where h.id = household_id and h.owner_id = (select auth.uid())
  ) and role = 'member' and user_id <> (select auth.uid()));
drop policy if exists "Owners can remove household members" on public.household_members;
create policy "Owners can remove household members" on public.household_members
  for delete to authenticated
  using (exists (
    select 1 from public.households h
    where h.id = household_id and h.owner_id = (select auth.uid())
  ));

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);
create index if not exists purchase_receipts_purchase_id_idx on public.purchase_receipts(purchase_id);
create index if not exists purchase_receipts_user_id_idx on public.purchase_receipts(user_id);
alter table public.purchase_receipts enable row level security;
revoke all on public.purchase_receipts from anon, authenticated;
grant select, insert, delete on public.purchase_receipts to authenticated;
drop policy if exists "Users manage their own receipt metadata" on public.purchase_receipts;
create policy "Users manage their own receipt metadata" on public.purchase_receipts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.purchases p
    where p.id = purchase_id and p.user_id = (select auth.uid())
  ));

create table if not exists public.reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  reminder_days integer[] not null default array[30,7,1],
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now(),
  constraint reminder_days_valid check (
    cardinality(reminder_days) between 1 and 5
    and reminder_days <@ array[1,3,7,14,30]::integer[]
  )
);
alter table public.reminder_preferences enable row level security;
revoke all on public.reminder_preferences from anon, authenticated;
grant select, insert, update on public.reminder_preferences to authenticated;
drop policy if exists "Users manage their reminder preferences" on public.reminder_preferences;
create policy "Users manage their reminder preferences" on public.reminder_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofpocket-receipts', 'proofpocket-receipts', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their own ProofPocket receipts" on storage.objects;
create policy "Users upload their own ProofPocket receipts"
on storage.objects for insert to authenticated
with check (bucket_id = 'proofpocket-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read their own ProofPocket receipts" on storage.objects;
create policy "Users read their own ProofPocket receipts"
on storage.objects for select to authenticated
using (bucket_id = 'proofpocket-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete their own ProofPocket receipts" on storage.objects;
create policy "Users delete their own ProofPocket receipts"
on storage.objects for delete to authenticated
using (bucket_id = 'proofpocket-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
