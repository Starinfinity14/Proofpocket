-- ProofPocket Plus Vault: encrypted personal document storage.
-- Requires the Plus billing migration to have been applied first.
-- Clients must encrypt file bytes before upload; this bucket accepts ciphertext only.
create table if not exists public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 120),
  document_type text not null check (document_type in ('identity','education','insurance','medical','property','vehicle','tax','other')),
  encrypted_mime_type text not null default 'application/octet-stream',
  encrypted_size_bytes bigint not null check (encrypted_size_bytes > 0 and encrypted_size_bytes <= 10485760),
  encryption_version smallint not null default 1 check (encryption_version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vault_documents_user_created_idx on public.vault_documents(user_id, created_at desc);
alter table public.vault_documents enable row level security;
revoke all on public.vault_documents from anon, authenticated;
grant select, insert, update, delete on public.vault_documents to authenticated;

drop policy if exists "Plus users manage their own encrypted vault metadata" on public.vault_documents;
create policy "Plus users manage their own encrypted vault metadata"
on public.vault_documents for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid()) and s.plus_entitled = true)
)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid()) and s.plus_entitled = true)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofpocket-vault', 'proofpocket-vault', false, 10485760, array['application/octet-stream'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Plus users upload encrypted vault files" on storage.objects;
create policy "Plus users upload encrypted vault files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'proofpocket-vault'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid()) and s.plus_entitled = true)
);
drop policy if exists "Plus users read encrypted vault files" on storage.objects;
create policy "Plus users read encrypted vault files"
on storage.objects for select to authenticated
using (
  bucket_id = 'proofpocket-vault'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid()) and s.plus_entitled = true)
);
drop policy if exists "Plus users delete encrypted vault files" on storage.objects;
create policy "Plus users delete encrypted vault files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'proofpocket-vault'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.subscriptions s where s.user_id = (select auth.uid()) and s.plus_entitled = true)
);
