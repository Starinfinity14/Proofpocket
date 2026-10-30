import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const auth = readFileSync('auth.js', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const config = readFileSync('supabase-config.js', 'utf8');

for (const id of [
  'purchase-form', 'purchase-modal', 'item-name', 'purchase-date',
  'records-list', 'deadlines-list', 'search', 'category-filter',
  'export-btn', 'clear-btn', 'cloud-auth-form', 'cloud-status'
]) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing HTML element: ' + id);
}
for (const asset of ['app.js', 'auth.js', 'styles.css', 'supabase-config.js']) {
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
assert.ok(webhook.includes('if (lookupError)') && webhook.includes('Could not release webhook event for retry') && webhook.includes('from("razorpay_webhook_events").delete()'), 'Failed subscription lookups must release the event ID so webhook delivery can retry');
assert.ok(webhook.includes('"subscription.activated"') && webhook.includes('"subscription.charged"') && webhook.includes('plus_entitled'), 'Entitlement must be updated from subscription webhooks');
assert.ok(billing.includes('create-plus-subscription') && /waiting for the signed Razorpay webhook/i.test(billing), 'Browser callback must not directly grant Plus');
assert.ok(!html.includes('RAZORPAY_KEY_SECRET') && !billing.includes('RAZORPAY_KEY_SECRET'), 'Razorpay secret must not appear in browser code');
console.log('ProofPocket Plus source checks passed.');
