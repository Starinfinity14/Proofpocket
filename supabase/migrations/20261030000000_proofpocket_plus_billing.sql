-- ProofPocket Plus billing schema. Razorpay credentials remain Edge Function secrets.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  razorpay_subscription_id text not null unique,
  razorpay_plan_id text not null,
  plan_interval text not null check (plan_interval in ('monthly','yearly')),
  status text not null default 'created' check (status in ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired')),
  plus_entitled boolean not null default false,
  current_start timestamptz,
  current_end timestamptz,
  cancel_at_cycle_end boolean not null default false,
  last_event_created_at bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists "Users can read their own subscription" on public.subscriptions;
create policy "Users can read their own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  created_at bigint not null default 0,
  processed_at timestamptz not null default now()
);
alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from anon, authenticated;
-- No client policies or grants: only the server-side service role may write webhook events.
