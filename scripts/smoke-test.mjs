import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const auth = readFileSync('auth.js', 'utf8');
const receipts = readFileSync('receipts.js', 'utf8');
const reminders = readFileSync('reminders.js', 'utf8');
const family = readFileSync('family.js', 'utf8');
const reports = readFileSync('reports.js', 'utf8');
const vault = readFileSync('vault.js', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const config = readFileSync('supabase-config.js', 'utf8');

for (const id of [
  'purchase-form', 'purchase-modal', 'item-name', 'purchase-date',
  'records-list', 'deadlines-list', 'search', 'category-filter',
  'export-btn', 'clear-btn', 'cloud-auth-form', 'cloud-status'
]) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing HTML element: ' + id);
}
for (const asset of ['app.js', 'auth.js', 'receipts.js', 'reminders.js', 'family.js', 'reports.js', 'styles.css', 'supabase-config.js']) {
  assert.ok(existsSync(asset), 'Missing runtime asset: ' + asset);
}
for (const behavior of [
  'proofpocket:records-changed', 'data-action="add"', 'data-edit',
  'data-delete', 'renderRecords', 'renderDeadlines', 'localStorage'
]) assert.ok(app.includes(behavior), 'Missing app behavior marker: ' + behavior);
assert.ok(auth.includes("from('purchases')"), 'Cloud purchases table integration missing');
assert.ok(auth.includes('signInWithPassword'), 'Sign-in handler missing');
assert.ok(css.includes('.modal-backdrop[hidden]'), 'Hidden modal style missing');
assert.match(html, /role="dialog" aria-modal="true"[^>]*tabindex="-1"/, 'Purchase dialog needs a programmatic focus fallback');
assert.ok(app.includes("if(e.key!=='Tab')return;"), 'Purchase dialog must manage keyboard Tab navigation');
assert.ok(app.includes("last.focus()") && app.includes("first.focus()"), 'Purchase dialog must keep keyboard focus inside the dialog');
assert.ok(app.includes("if(e.key==='Escape'){e.preventDefault();closeModal();return}"), 'Escape must close the purchase dialog');

assert.ok(config.includes('publishableKey'), 'Supabase publishable key config missing');
assert.ok(app.includes('const previous=records;if(existing)records=records.map(r=>r.id===editId?item:r);else records.push(item);if(!persist()){records=previous;render();return}'), 'Failed add/edit saves must roll back in-memory records');
assert.ok(app.includes('if(!persist({deletedIds:[deletedId]})){records=previous;render();return}'), 'Failed single-record deletes must roll back');
assert.ok(app.includes('if(!persist({deletedIds})){records=previous;render();return}'), 'Failed clear-all operations must roll back');
assert.ok(!/(?:service_role|sb_secret_)\s*[:=]\s*['\"][^'\"]+/i.test(config), 'A Supabase secret/service-role key must never be shipped to browsers');
console.log('ProofPocket release smoke tests passed.');

const migration = readFileSync('supabase/migrations/20261030000000_proofpocket_plus_billing.sql', 'utf8');
const checkout = readFileSync('supabase/functions/create-plus-subscription/index.ts', 'utf8');
const webhook = readFileSync('supabase/functions/razorpay-webhook/index.ts', 'utf8');
const billing = readFileSync('billing.js', 'utf8');
assert.ok(html.includes('id="plus-monthly"') && html.includes('id="plus-yearly"'), 'Monthly and yearly Plus controls must exist');
assert.ok(html.includes('billing.js') && html.includes('checkout.razorpay.com'), 'Razorpay checkout and billing client must be loaded');
assert.ok(migration.includes('enable row level security') && migration.includes('Users can read their own subscription'), 'Subscription table must use owner-scoped RLS');
assert.ok(migration.includes('razorpay_webhook_events') && migration.includes('revoke all'), 'Webhook event table must not be client-accessible');
assert.ok(checkout.includes('RAZORPAY_MODE') && checkout.includes('!== "test"'), 'Checkout must refuse non-test mode');
assert.ok(checkout.includes('auth.getUser(token)') && checkout.includes('RAZORPAY_KEY_SECRET'), 'Checkout must authenticate users and keep Razorpay secret server-side');
assert.ok(webhook.includes('x-razorpay-signature') && webhook.includes('crypto.subtle') && webhook.includes('x-razorpay-event-id'), 'Webhook must verify signature and deduplicate events');
assert.ok(webhook.includes('Webhook idempotency lookup failed') && webhook.includes('Subscription lookup failed'), 'Webhook lookup failures must return retryable errors without consuming the event ID');
assert.ok(webhook.includes('if (seenEvent) return json({ received: true, duplicate: true })'), 'Previously processed event IDs must be acknowledged as duplicates before changing entitlement');
assert.ok(webhook.includes('update.lte("last_event_created_at", createdAt)'), 'Webhook updates must be guarded against older events racing newer subscription state');
assert.ok(webhook.includes('Could not record processed event') && webhook.includes('return json({ error: "Could not record processed event" }, 500)'), 'Event persistence failures after state update must request provider retry');
const webhookUpdateIndex = webhook.indexOf('const { data: updatedRows, error: updateError } = await update.select("id")');
const webhookInsertIndex = webhook.indexOf('from("razorpay_webhook_events").insert({');
assert.ok(webhookUpdateIndex >= 0 && webhookInsertIndex > webhookUpdateIndex, 'Webhook event IDs must be persisted only after the subscription state update succeeds');
assert.ok(webhook.includes('Number.isFinite(parsedCreatedAt)'), 'Malformed event timestamps must be normalized safely');
assert.ok(webhook.includes('"subscription.activated"') && webhook.includes('"subscription.charged"') && webhook.includes('plus_entitled'), 'Entitlement must be updated from subscription webhooks');
const duplicateGuard = webhook.indexOf('if (eventError.code === "23505")');
assert.ok(duplicateGuard >= 0 && webhook.slice(duplicateGuard, duplicateGuard + 180).includes('duplicate: true'), 'Repeated Razorpay event IDs must return a duplicate acknowledgement without reapplying entitlement');

for (const [eventName, status, entitled] of [
  ['subscription.activated', 'active', true],
  ['subscription.charged', 'active', true],
  ['subscription.resumed', 'active', true],
  ['subscription.pending', 'pending', false],
  ['subscription.halted', 'halted', false],
  ['subscription.paused', 'paused', false],
  ['subscription.cancelled', 'cancelled', false],
  ['subscription.completed', 'completed', false],
]) {
  const mappingText = '"' + eventName + '": { status: "' + status + '", entitled: ' + entitled + ' }';
  assert.ok(webhook.includes(mappingText), 'Incorrect Plus entitlement mapping for ' + eventName);
}
assert.ok(webhook.includes('plus_entitled: mapped.entitled'), 'Persisted Plus entitlement must follow the verified subscription event mapping');
assert.ok(billing.includes('create-plus-subscription') && /waiting for the signed Razorpay webhook/i.test(billing), 'Browser callback must not directly grant Plus');
assert.ok(!html.includes('RAZORPAY_KEY_SECRET') && !billing.includes('RAZORPAY_KEY_SECRET'), 'Razorpay secret must not appear in browser code');
console.log('ProofPocket Plus source checks passed.');

assert.ok(html.includes('receipts.js'), 'Receipt attachment module must be loaded');
assert.ok(app.includes('data-purchase-id'), 'Purchase cards must expose their record IDs');
assert.ok(receipts.includes("from('purchase_receipts')") && receipts.includes("from(bucket).upload"), 'Receipt upload and metadata integration missing');
assert.ok(receipts.includes('createSignedUrl') && receipts.includes("from(bucket).remove"), 'Receipt download and deletion flows missing');
assert.ok(receipts.includes('5 * 1024 * 1024') && receipts.includes('application/pdf'), 'Receipt file limits and MIME allowlist missing');
console.log('ProofPocket receipt source checks passed.');

assert.ok(html.includes('reminders.js'), 'Reminder module must be loaded');
assert.ok(html.includes('reminder-enabled') && html.includes('reminder-days'), 'Reminder preferences UI missing');
assert.ok(reminders.includes('new Notification') && reminders.includes('checkDue'), 'Browser notification delivery logic missing');
assert.ok(reminders.includes('browser_notifications_enabled') && reminders.includes('reminder_days'), 'Cloud reminder preference sync missing');
console.log('ProofPocket reminder source checks passed.');

assert.ok(html.includes('data-view="family"') && html.includes('id="view-family"'), 'Family sharing navigation and view must exist');
assert.ok(html.includes('family.js'), 'Family sharing module must be loaded');
assert.ok(app.includes("'family'"), 'Family sharing route must be registered');
assert.ok(family.includes('create_household_invitation') && family.includes('accept_household_invitation'), 'Secure invitation workflow must be wired');
assert.ok(family.includes('share_household_purchase') && family.includes('get_household_shared_purchases'), 'Explicit purchase sharing workflow must be wired');
assert.ok(family.includes('getRandomValues'), 'Invitation tokens must use cryptographically secure browser randomness');
const familyMigration = readFileSync('supabase/migrations/20261031010000_family_sharing.sql', 'utf8');
assert.ok(familyMigration.includes('token_hash') && familyMigration.includes('redeemed_at') && familyMigration.includes('expires_at'), 'Invitations must be hashed, single-use and expiring');
assert.ok(familyMigration.includes("lower(coalesce(auth.jwt()->>'email', '')) <> lower(v_inv.invited_email)"), 'Invitation redemption must enforce the invited email');
assert.ok(familyMigration.includes('from public.purchases where id = p_purchase_id and user_id = auth.uid()'), 'Only purchase owners may share their purchases');
assert.ok(familyMigration.includes('Household members read explicitly shared purchases'), 'Purchase visibility must be explicitly shared');
console.log('ProofPocket family sharing source checks passed.');

assert.ok(html.includes('data-view="reports"') && html.includes('id="view-reports"'), 'Reports navigation and view must exist');
assert.ok(html.includes('reports.js'), 'Reports module must be loaded');
assert.ok(app.includes("'reports'"), 'Reports route must be registered');
assert.ok(reports.includes('get_household_shared_purchases') && reports.includes('report-household'), 'Optional household reporting must use explicitly shared purchases');
assert.ok(reports.includes('report-categories') && reports.includes('report-monthly') && reports.includes('report-coverage'), 'Category, monthly and coverage reports must be rendered');
assert.ok(reports.includes('text/csv') && reports.includes('proofpocket-report-'), 'CSV report export must be available');
console.log('ProofPocket reports source checks passed.');


// Patch #12: authentication and checkout-origin security regressions.
const checkoutCors = checkout;
assert.ok(checkoutCors.includes('ALLOWED_ORIGINS'), 'Checkout must require an explicit origin allowlist');
assert.ok(checkoutCors.includes('Access-Control-Allow-Origin') && checkoutCors.includes('Vary'), 'Checkout CORS must be origin-aware and cache-safe');
assert.ok(checkoutCors.includes('req.headers.get("origin")'), 'Checkout must inspect the request Origin');
assert.ok(checkoutCors.includes('OPTIONS') && checkoutCors.includes('403'), 'Checkout must reject disallowed CORS preflight requests');
assert.ok(!checkoutCors.includes('"Access-Control-Allow-Origin": "*"'), 'Checkout must not allow every origin');
assert.ok(auth.includes('resetPasswordForEmail'), 'Password reset flow must be present');
assert.ok(auth.includes("client.auth.resend({ type: 'signup'"), 'Email confirmation resend flow must be present');
assert.ok(auth.includes('signUp') && auth.includes('signInWithPassword') && auth.includes('onAuthStateChange'), 'Sign-up, sign-in and session-change handling must be present');
assert.ok(auth.includes('sessionGeneration') && auth.includes('userId !== ownerId'), 'Cloud sync must guard against account switching');
console.log('ProofPocket Patch #12 security source checks passed.');


// Patch #14: data-isolation, receipt-storage and recovery-boundary audit.
assert.ok(auth.includes('storageKey = scope ?') && auth.includes('.account.'), 'Signed-in browser caches must be separated by account');
assert.ok(auth.includes("client.from('purchases').delete().eq('user_id', ownerId)"), 'Cloud-record deletion must remain owner-scoped');
assert.ok(auth.includes('Your sign-in account itself will not be deleted'), 'The UI must disclose that purchase-data deletion is not account deletion');
assert.ok(receipts.includes("client.storage.from(bucket).remove([item.storage_path])"), 'Receipt deletion must remove the private Storage object');
assert.ok(receipts.indexOf('client.storage.from(bucket).remove([item.storage_path])') < receipts.indexOf("client.from('purchase_receipts').delete()"), 'Receipt deletion must remove the object before deleting its metadata');
assert.ok(vault.includes("name:'AES-GCM'") && vault.includes("name:'PBKDF2'") && vault.includes('crypto.getRandomValues'), 'Vault encryption must use authenticated encryption and fresh random parameters');
assert.ok(vault.includes("const path=userId+'/'+id+'.ppvault'"), 'Vault objects must be placed under the authenticated user folder');
assert.ok(vault.includes(".eq('user_id',userId)"), 'Vault metadata listing must be owner-filtered');
assert.ok(readFileSync('README.md', 'utf8').includes('automated backup service'), 'Release documentation must disclose that JSON export is not an automated cloud backup');
assert.ok(readFileSync('README.md', 'utf8').includes('does not delete the Supabase sign-in account'), 'Release documentation must distinguish data deletion from account deletion');
console.log('ProofPocket Patch #14 data-isolation and recovery-boundary checks passed.');


// Patch #15: account deletion must be server-authorized and storage-first.
const accountDeletionPath = 'supabase/functions/delete-account/index.ts';
assert.ok(existsSync(accountDeletionPath), 'Server-side account deletion function must exist');
const accountDeletion = readFileSync(accountDeletionPath, 'utf8');
for (const marker of [
  'auth.getUser(token)', 'SUPABASE_SERVICE_ROLE_KEY', 'proofpocket-receipts',
  'proofpocket-vault', 'storage.from(bucket).list', 'storage.from(bucket).remove',
  'auth.admin.deleteUser', 'household_members', 'owner_id', 'return json'
]) assert.ok(accountDeletion.includes(marker), 'Account deletion safety marker missing: ' + marker);
assert.ok(accountDeletion.indexOf('storage.from(bucket).remove') < accountDeletion.indexOf('auth.admin.deleteUser'), 'Storage cleanup must occur before auth account deletion');
assert.ok(accountDeletion.includes('if (ownedHouseholds?.length)'), 'Household owners must be blocked until ownership is resolved');
assert.ok(accountDeletion.includes('if (memberships?.length)'), 'Household members must explicitly leave before account deletion');
assert.ok(!accountDeletion.includes('user_id: body.user_id'), 'Account deletion must derive identity from the verified JWT, never the request body');
console.log('ProofPocket Patch #15 account-deletion safety checks passed.');


// Migration integrity checks.
assert.equal((familyMigration.match(/as \$family\$/g) || []).length, 10, 'All ten family-sharing function bodies must open with the expected delimiter');
assert.equal((familyMigration.match(/^\$family\$;/gm) || []).length, 10, 'All ten family-sharing function bodies must close cleanly');
assert.ok(!familyMigration.includes("raise exception 'Sign in required'$family$"), 'Function body delimiter must not appear inside a statement');
assert.ok(!familyMigration.includes("raise exception 'Sign in required'$family$"), 'Family migration must not contain the previously broken function delimiter');
assert.ok(familyMigration.includes("extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')"), 'Invitation tokens must be SHA-256 hashed');
assert.ok(familyMigration.includes('for update'), 'Invitation redemption must lock the invitation row');
assert.ok(familyMigration.includes('public.is_household_member(p_household_id)'), 'Shared purchase retrieval must verify membership');
const vaultMigration = readFileSync('supabase/migrations/20261101000000_plus_encrypted_document_vault.sql', 'utf8');
assert.ok(vaultMigration.includes('create table if not exists public.vault_documents'), 'Vault metadata migration missing');
assert.ok(vaultMigration.includes("values ('proofpocket-vault', 'proofpocket-vault', false"), 'Vault bucket must be private');
assert.ok(vaultMigration.includes('s.plus_entitled = true'), 'Vault access must require Plus entitlement');
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');
assert.match(supabaseConfig, /\[functions\.delete-account\][\s\S]*?verify_jwt = true/, 'Account deletion function must require gateway JWT verification');
console.log('ProofPocket migration integrity and function configuration checks passed.');


// Account deletion CORS and gateway configuration checks.
assert.ok(accountDeletion.includes('ALLOWED_ORIGINS') && accountDeletion.includes('Access-Control-Allow-Origin'), 'Account deletion must use an explicit CORS origin allowlist');
assert.ok(accountDeletion.includes('req.method === \"OPTIONS\"') && accountDeletion.includes('status: 204'), 'Account deletion must answer valid CORS preflight requests');
assert.ok(accountDeletion.includes('if (origin && !allowedOrigins.includes(origin))'), 'Account deletion must reject unapproved browser origins');
assert.ok(accountDeletion.includes('Vary\": \"Origin'), 'Account deletion CORS must be cache-safe');
assert.ok(accountDeletion.includes('return new Response(null, { status: 403, headers })'), 'Disallowed preflight requests must be rejected');
// Patch #16: preflight every required bucket before the first destructive operation.
assert.ok(accountDeletion.includes('admin.storage.listBuckets()'), 'Account deletion must verify required buckets before cleanup');
assert.ok(accountDeletion.includes('for (const bucketId of ["proofpocket-receipts", "proofpocket-vault"])'), 'Account deletion must preflight both user-file buckets');
assert.ok(accountDeletion.includes('!bucket || bucket.public'), 'Account deletion must refuse missing or public storage buckets');
assert.ok(accountDeletion.includes('PRIVATE_STORAGE_PREFLIGHT_FAILED'), 'Storage preflight failures must stop before any file removal');
const storagePreflightIndex = accountDeletion.indexOf('admin.storage.listBuckets()');
const firstStorageRemovalIndex = accountDeletion.indexOf('removeUserFiles(admin,');
assert.ok(storagePreflightIndex >= 0 && firstStorageRemovalIndex > storagePreflightIndex, 'Both buckets must be validated before storage cleanup begins');
console.log('ProofPocket account-deletion CORS checks passed.');
