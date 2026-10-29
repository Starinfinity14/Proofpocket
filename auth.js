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
  const avatar = $('.avatar');
  if (!form || !status || !message || !signIn || !signUp || !signOut || !email || !password) return;

  const originalAvatarLabel = avatar ? avatar.textContent.trim() : 'Profile';
  const cfg = window.PROOFPOCKET_SUPABASE_CONFIG || window.PROOFPocket_SUPABASE_CONFIG;
  const ready = !!(window.supabase && cfg && cfg.url && cfg.publishableKey &&
    !cfg.publishableKey.includes('PASTE_YOUR_'));
  if (!ready) {
    if (setupNote) setupNote.hidden = false;
    message.textContent = 'Cloud account is not configured. Local records still work.';
    form.addEventListener('submit', e => { e.preventDefault(); message.textContent = 'Cloud sign-in is unavailable: check supabase-config.js and the Supabase JS library.'; });
    signUp.addEventListener('click', () => { message.textContent = 'Cloud sign-up is unavailable: check supabase-config.js and the Supabase JS library.'; });
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let userId = null;
  let currentUser = null;
  let hydration = false;
  let syncQueue = Promise.resolve();
  let profileMenu = null;

  const setMessage = (text, isError = false) => {
    message.textContent = text;
    message.style.color = isError ? '#a63b32' : '';
  };
  const setBusy = (busy, label) => {
    signIn.disabled = busy;
    signUp.disabled = busy;
    signOut.disabled = busy;
    if (busy && label) setMessage(label);
  };
  const readableError = (err) => {
    const raw = (err && err.message) || 'Please try again.';
    if (/email not confirmed/i.test(raw)) return 'This email is not confirmed yet. Use “Resend confirmation email” below, then open the newest message.';
    if (/invalid login credentials/i.test(raw)) return 'Email or password is incorrect. If you just created the account, confirm your email first.';
    if (/already registered|user already exists/i.test(raw)) return 'An account may already exist for this email. Try signing in or use password reset.';
    if (/password.*(weak|short|length)/i.test(raw)) return 'Choose a stronger password that meets the requirements shown by Supabase.';
    if (/fetch|network|failed to fetch/i.test(raw)) return 'Could not reach Supabase. Check your internet connection and the project URL, then try again.';
    if (/redirect|url.*not allowed|not allowed.*url/i.test(raw)) return 'Supabase rejected the redirect URL. Add https://starinfinity14.github.io/Proofpocket/ to Authentication → URL Configuration → Redirect URLs.';
    return raw;
  };
  const toDb = (r, ownerId) => ({
    id: r.id, user_id: ownerId, name: r.name, store: r.store || '',
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
  function updateProfile(user) {
    currentUser = user || null;
    if (avatar) {
      const label = currentUser && currentUser.email ? currentUser.email : originalAvatarLabel;
      avatar.textContent = currentUser && currentUser.email ? currentUser.email.trim().charAt(0).toUpperCase() : 'Y';
      avatar.title = currentUser && currentUser.email ? 'Signed in as ' + currentUser.email + ' — open account menu' : 'Profile and account';
      avatar.setAttribute('aria-label', avatar.title);
    }
    if (profileMenu) {
      profileMenu.querySelector('[data-profile-email]').textContent = currentUser && currentUser.email ? currentUser.email : 'Not signed in';
      profileMenu.querySelector('[data-profile-state]').textContent = currentUser ? 'Cloud account connected' : 'Local mode';
      const out = profileMenu.querySelector('[data-profile-signout]');
      if (out) out.hidden = !currentUser;
    }
  }
  function buildProfileMenu() {
    if (!avatar || profileMenu) return;
    profileMenu = document.createElement('div');
    profileMenu.className = 'profile-menu';
    profileMenu.hidden = true;
    profileMenu.innerHTML = '<strong class="profile-menu-title">Account</strong><span class="profile-menu-email" data-profile-email>Not signed in</span><span class="profile-menu-state" data-profile-state>Local mode</span><button type="button" data-profile-settings>Account settings</button><button type="button" data-profile-reset>Reset password</button><button type="button" data-profile-signout hidden>Sign out</button>';
    avatar.insertAdjacentElement('afterend', profileMenu);
    avatar.setAttribute('aria-haspopup', 'true');
    avatar.setAttribute('aria-expanded', 'false');
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      profileMenu.hidden = !profileMenu.hidden;
      avatar.setAttribute('aria-expanded', String(!profileMenu.hidden));
    });
    profileMenu.addEventListener('click', async e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.hasAttribute('data-profile-settings')) {
        profileMenu.hidden = true;
        avatar.setAttribute('aria-expanded', 'false');
        document.querySelector('[data-view="settings"]')?.click();
        $('#cloud-email')?.focus();
      } else if (btn.hasAttribute('data-profile-reset')) {
        profileMenu.hidden = true;
        avatar.setAttribute('aria-expanded', 'false');
        document.querySelector('[data-view="settings"]')?.click();
        if (!email.value.trim() && currentUser && currentUser.email) email.value = currentUser.email;
        await resetPassword();
      } else if (btn.hasAttribute('data-profile-signout')) {
        profileMenu.hidden = true;
        avatar.setAttribute('aria-expanded', 'false');
        await doSignOut();
      }
    });
    document.addEventListener('click', e => {
      if (profileMenu && !profileMenu.hidden && !profileMenu.contains(e.target) && e.target !== avatar) {
        profileMenu.hidden = true;
        avatar.setAttribute('aria-expanded', 'false');
      }
    });
    updateProfile(null);
  }
  async function fetchCloudRecords() {
    const { data, error } = await client.from('purchases').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(fromDb);
  }
  async function syncRecords(snapshot, deletedIds = []) {
    if (!userId || hydration) return;
    const ownerId = userId;
    const safe = Array.isArray(snapshot) ? snapshot.map(r => ({ ...r })) : [];
    const explicitDeletes = Array.isArray(deletedIds) ? [...new Set(deletedIds.filter(id => typeof id === 'string'))] : [];
    syncQueue = syncQueue.then(async () => {
      // A queued operation must never write to a different account after an account switch.
      if (!ownerId || userId !== ownerId || hydration) return;
      const rows = safe.map(r => toDb(r, ownerId));
      if (rows.length) {
        const { error } = await client.from('purchases').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      if (explicitDeletes.length) {
        const { error } = await client.from('purchases').delete().eq('user_id', ownerId).in('id', explicitDeletes);
        if (error) throw error;
      }
      if (userId === ownerId) {
        status.textContent = 'Synced';
        setMessage('Your purchase records are synced to your account.');
      }
    }).catch(err => {
      if (userId === ownerId) {
        status.textContent = 'Sync issue';
        setMessage('Cloud sync failed: ' + readableError(err), true);
      }
      console.error('ProofPocket sync failed:', err);
    });
    return syncQueue;
  }
  window.addEventListener('proofpocket:records-changed', e => {
    if (userId && !hydration) syncRecords(e.detail && e.detail.records, e.detail && e.detail.deletedIds);
  });

  async function loadSession(session) {
    userId = session && session.user ? session.user.id : null;
    updateProfile(session && session.user ? session.user : null);
    if (!userId) {
      status.textContent = 'Local only';
      signIn.hidden = false; signUp.hidden = false; signOut.hidden = true;
      setMessage('Signed out. Your browser records remain available.');
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
      setMessage('Signed in as ' + session.user.email + '.');
    } catch (err) {
      status.textContent = 'Connection issue';
      setMessage('Signed in, but cloud records could not be loaded: ' + readableError(err), true);
    } finally {
      hydration = false;
    }
  }
  async function resetPassword() {
    const address = email.value.trim() || (currentUser && currentUser.email) || '';
    if (!address) {
      setMessage('Enter your account email first, then choose Reset password.', true);
      email.focus();
      return;
    }
    setMessage('Sending password reset email…');
    const { error } = await client.auth.resetPasswordForEmail(address, {
      redirectTo: 'https://starinfinity14.github.io/Proofpocket/'
    });
    if (error) setMessage(readableError(error), true);
    else setMessage('If an account exists for ' + address + ', a password reset email has been requested. Check your inbox and spam folder.');
  }
  async function resendConfirmation() {
    const address = email.value.trim();
    if (!address) {
      setMessage('Enter the email address you used to create the account first.', true);
      email.focus();
      return;
    }
    setMessage('Requesting a confirmation email…');
    const { error } = await client.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo: 'https://starinfinity14.github.io/Proofpocket/' } });
    if (error) setMessage(readableError(error), true);
    else setMessage('If confirmation is still required, a new email has been requested. Open the newest message and check spam.');
  }
  async function doSignOut() {
    setBusy(true, 'Signing out…');
    const { error } = await client.auth.signOut();
    if (error) { setMessage(readableError(error), true); setBusy(false); return; }
    userId = null;
    await loadSession(null);
    setBusy(false);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    setBusy(true, 'Signing in…');
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (error) throw error;
      await loadSession(data.session);
    } catch (err) {
      setMessage(readableError(err), true);
    } finally { setBusy(false); }
  });
  signUp.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    setBusy(true, 'Creating account…');
    try {
      const { data, error } = await client.auth.signUp({
        email: email.value.trim(),
        password: password.value,
        options: { emailRedirectTo: 'https://starinfinity14.github.io/Proofpocket/' }
      });
      if (error) throw error;
      if (data.session) {
        await loadSession(data.session);
      } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setMessage('An account may already exist for this email. Try signing in or use Reset password.', true);
      } else {
        setMessage('Account request received. If email confirmation is enabled, open the confirmation link in your newest email. If no email arrives, check spam or use Resend confirmation email.');
      }
    } catch (err) {
      setMessage(readableError(err), true);
    } finally { setBusy(false); }
  });
  signOut.addEventListener('click', doSignOut);
  const resendBtn = document.createElement('button');
  resendBtn.type = 'button';
  resendBtn.className = 'text-btn auth-helper-btn';
  resendBtn.textContent = 'Resend confirmation email';
  resendBtn.addEventListener('click', resendConfirmation);
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'text-btn auth-helper-btn';
  resetBtn.textContent = 'Reset password';
  resetBtn.addEventListener('click', resetPassword);
  const helperRow = document.createElement('div');
  helperRow.className = 'auth-helper-row';
  helperRow.append(resendBtn, resetBtn);
  form.insertAdjacentElement('afterend', helperRow);

  buildProfileMenu();
  client.auth.getSession().then(({ data, error }) => {
    if (error) { setMessage(readableError(error), true); return; }
    if (data.session) loadSession(data.session);
  }).catch(err => setMessage(readableError(err), true));
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') loadSession(null);
    if (event === 'TOKEN_REFRESHED' && session && session.user) updateProfile(session.user);
  });
})();