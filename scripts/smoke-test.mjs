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
