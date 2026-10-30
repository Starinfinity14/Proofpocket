(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const monthly = $('plus-monthly');
  const yearly = $('plus-yearly');
  const status = $('plus-status');
  const note = $('plus-message');
  if (!monthly || !yearly || !status || !note) return;
  const cfg = window.PROOFPOCKET_SUPABASE_CONFIG;
  if (!window.supabase || !cfg?.url || !cfg?.publishableKey) {
    note.textContent = 'Cloud sign-in is not configured. Plus test checkout is unavailable.';
    monthly.disabled = yearly.disabled = true;
    return;
  }
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let busy = false;
  const setBusy = value => {
    busy = value;
    monthly.disabled = yearly.disabled = value;
  };
  async function refresh() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      status.textContent = 'Free plan';
      note.textContent = 'Sign in to your ProofPocket account before starting a Plus test subscription.';
      return;
    }
    const { data, error } = await client.from('subscriptions')
      .select('status,plan_interval,plus_entitled,current_end,cancel_at_cycle_end')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) {
      status.textContent = 'Plan status unavailable';
      note.textContent = 'Billing status could not be loaded. The subscription table and RLS migration must be applied first.';
      return;
    }
    if (data?.plus_entitled && data.status === 'active') {
      status.textContent = 'Plus active · ' + (data.plan_interval === 'yearly' ? 'Yearly' : 'Monthly');
      note.textContent = data.current_end
        ? 'Current period ends ' + new Date(data.current_end).toLocaleDateString() + (data.cancel_at_cycle_end ? '. Cancellation is scheduled at period end.' : '.')
        : 'Your Plus access is active. Razorpay test events are controlling this status.';
    } else if (data) {
      status.textContent = 'Free plan · subscription ' + data.status;
      note.textContent = 'Plus stays locked until a verified Razorpay activation or successful charge webhook is received.';
    } else {
      status.textContent = 'Free plan';
      note.textContent = 'Choose a test plan below. No real payment will be collected in Test Mode.';
    }
  }
  async function start(interval) {
    if (busy) return;
    setBusy(true);
    note.textContent = 'Checking your account and preparing a test subscription…';
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Sign in to ProofPocket first.');
      const { data, error } = await client.functions.invoke('create-plus-subscription', {
        body: { interval }
      });
      if (error || !data?.subscriptionId || !data?.keyId) {
        throw new Error(data?.error || error?.message || 'Could not start test checkout.');
      }
      if (!window.Razorpay) throw new Error('Razorpay Checkout did not load. Refresh the page and try again.');
      const checkout = new window.Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'ProofPocket',
        description: interval === 'monthly' ? 'Plus · Monthly test subscription' : 'Plus · Yearly test subscription',
        theme: { color: '#39744d' },
        modal: { ondismiss: () => { note.textContent = 'Checkout closed. Plus remains locked until the verified webhook updates your account.'; setBusy(false); } },
        handler: () => {
          note.textContent = 'Checkout returned. Waiting for the signed Razorpay webhook; Plus is not unlocked by this browser callback.';
          setTimeout(refresh, 1500);
          setBusy(false);
        }
      });
      checkout.open();
    } catch (error) {
      note.textContent = error?.message || 'Unable to start test checkout.';
      setBusy(false);
    }
  }
  monthly.addEventListener('click', () => start('monthly'));
  yearly.addEventListener('click', () => start('yearly'));
  client.auth.onAuthStateChange(() => { refresh().catch(() => {}); });
  refresh().catch(() => {});
  window.addEventListener('focus', () => refresh().catch(() => {}));
  window.proofPocketBillingRefresh = refresh;
})();