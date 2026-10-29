(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const status = $('#cloud-status');
  const message = $('#cloud-message');
  const setupNote = $('#cloud-setup-note');
  const form = $('#cloud-auth-form');
  const signIn = $('#cloud-signin');
  const signUp = $('#cloud-signup');
  const signOut = $('#cloud-signout');
  const email = $('#cloud-email');
  const password = $('#cloud-password');
  if (!form) return;

  const cfg = window.PROOFPocket_SUPABASE_CONFIG || window.PROOFPOCKET_SUPABASE_CONFIG;
  const ready = !!(window.supabase && cfg && cfg.url && cfg.publishableKey &&
    !cfg.publishableKey.includes('PASTE_YOUR_'));
  if (!ready) {
    setupNote.hidden = false;
    message.textContent = 'Cloud sync is not configured yet. Local records still work.';
    form.addEventListener('submit', e => { e.preventDefault(); message.textContent = 'Add your Supabase publishable key to supabase-config.js first.'; });
    signUp.addEventListener('click', () => { message.textContent = 'Add your Supabase publishable key to supabase-config.js first.'; });
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let userId = null;
  let hydration = false;
  let syncQueue = Promise.resolve();

  const toDb = r => ({
    id: r.id, user_id: userId, name: r.name, store: r.store || '',
    category: r.category || 'Other', purchase_date: r.purchaseDate || null,
    amount: r.amount === '' || r.amount == null ? null : Number(r.amount),
    return_date: r.returnDate || null, warranty_date: r.warrantyDate || null,
    notes: r.notes || '', created_at: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString()
  });
  const fromDb = r => ({
    id: r.id, name: r.name, store: r.store || '', category: r.category || 'Other',
    purchaseDate: r.purchase_date || '', amount: r.amount == null ? '' : Number(r.amount),
    returnDate: r.return_date || '', warrantyDate: r.warranty_date || '', notes: r.notes || '',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
  });
  async function fetchCloudRecords() {
    const { data, error } = await client.from('purchases').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(fromDb);
  }
  async function syncRecords(snapshot, deletedIds = []) {
    if (!userId || hydration) return;
    const safe = Array.isArray(snapshot) ? snapshot : [];
    const explicitDeletes = Array.isArray(deletedIds) ? [...new Set(deletedIds.filter(id => typeof id === 'string'))] : [];
    syncQueue = syncQueue.then(async () => {
      if (!userId || hydration) return;
      const rows = safe.map(toDb);
      if (rows.length) {
        const { error } = await client.from('purchases').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      // Only delete IDs explicitly reported by the UI; never infer deletion from a stale local snapshot.
      if (explicitDeletes.length) {
        const { error } = await client.from('purchases').delete().eq('user_id', userId).in('id', explicitDeletes);
        if (error) throw error;
      }
      status.textContent = 'Synced';
      message.textContent = 'Your purchase records are synced to your account.';
    }).catch(err => {
      status.textContent = 'Sync issue';
      message.textContent = 'Cloud sync failed: ' + (err.message || 'Please try again.');
      console.error('ProofPocket sync failed:', err);
    });
    return syncQueue;
  }
  window.addEventListener('proofpocket:records-changed', e => {
    if (userId && !hydration) syncRecords(e.detail && e.detail.records, e.detail && e.detail.deletedIds);
  });

  async function loadSession(session) {
    userId = session && session.user ? session.user.id : null;
    if (!userId) {
      status.textContent = 'Local only';
      signIn.hidden = false; signUp.hidden = false; signOut.hidden = true;
      message.textContent = 'Signed out. Your browser records remain available.';
      return;
    }
    status.textContent = 'Loading…';
    signIn.hidden = true; signUp.hidden = true; signOut.hidden = false;
    try {
      hydration = true;
      const local = window.proofPocket.getRecords();
      const cloud = await fetchCloudRecords();
      if (cloud.length) {
        if (local.length && !confirm('Cloud records were found. Replace the records currently in this browser with the cloud records? Choose Cancel to keep browser records and upload them instead.')) {
          hydration = false;
          await syncRecords(local);
          hydration = true;
        } else {
          window.proofPocket.replaceRecords(cloud);
        }
      } else if (local.length) {
        if (confirm('No cloud records were found. Upload the purchase records currently saved in this browser?')) {
          hydration = false;
          await syncRecords(local);
          hydration = true;
        }
      }
      status.textContent = 'Signed in';
      message.textContent = 'Signed in as ' + session.user.email + '.';
    } catch (err) {
      status.textContent = 'Connection issue';
      message.textContent = 'Could not load cloud records: ' + (err.message || 'Please try again.');
    } finally {
      hydration = false;
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    message.textContent = 'Signing in…';
    const { data, error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (error) { message.textContent = error.message; return; }
    await loadSession(data.session);
  });
  signUp.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    message.textContent = 'Creating account…';
    const { data, error } = await client.auth.signUp({ email: email.value.trim(), password: password.value, options: { emailRedirectTo: 'https://starinfinity14.github.io/Proofpocket/' } });
    if (error) { message.textContent = error.message; return; }
    if (data.session) await loadSession(data.session);
    else message.textContent = 'Account created. Check your email to confirm it, then sign in.';
  });
  signOut.addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) { message.textContent = error.message; return; }
    userId = null;
    await loadSession(null);
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) { message.textContent = error.message; return; }
    if (data.session) loadSession(data.session);
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') loadSession(null);
  });
})();