-- Canonical purchases schema required by receipt and household migrations.
-- Reconstructed from the existing production table definition; this migration
-- only creates the table when absent and does not alter existing rows.

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  store text not null default '',
  category text not null default 'Other',
  purchase_date date not null,
  amount numeric,
  return_date date,
  warranty_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

revoke all on public.purchases from anon;
grant select, insert, update, delete on public.purchases to authenticated;

drop policy if exists "Users add their own purchases" on public.purchases;
create policy "Users add their own purchases"
  on public.purchases for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own purchases" on public.purchases;
create policy "Users delete their own purchases"
  on public.purchases for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own purchases" on public.purchases;
create policy "Users read their own purchases"
  on public.purchases for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users update their own purchases" on public.purchases;
create policy "Users update their own purchases"
  on public.purchases for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
