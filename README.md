# ProofPocket

A responsive household purchase organizer for purchase details, return-by dates and warranty deadlines. The app supports English and Hindi, local browser storage, JSON export, and optional Supabase account sync.

## Included functionality

- Add, edit and delete purchase records.
- Search records and filter by category.
- Track return and warranty dates, including past-due dates.
- Dashboard totals, recent records and progress badges.
- Local-first storage when signed out.
- Optional Supabase email/password authentication and per-user cloud sync.
- JSON export, local-data deletion, and a signed-in control to delete that account’s cloud purchase records (the authentication account itself is not deleted).
- Responsive desktop and mobile layouts.
- Keyboard-accessible purchase dialog with focus containment, Escape-to-close, and focus restoration.

## Run locally

Open `index.html` in a modern browser, or serve this folder with a static HTTP server. No frontend build step is required.

## Supabase setup

The browser uses the Supabase publishable key in `supabase-config.js`. A publishable key is designed for public clients; **never place a Supabase secret or service-role key in this file**.

The Supabase project must have the `public.purchases` table and row-level security policies that restrict SELECT, INSERT, UPDATE and DELETE to rows whose `user_id` equals `auth.uid()`. Do not disable RLS to make sync work.

Before public launch:
1. Enable leaked-password protection in Supabase Auth.
2. Enable email confirmation and test the confirmation and password-reset flows.
3. Add the production site URL and redirect URL to Supabase Authentication → URL Configuration.
4. Confirm the purchases table grants authenticated access and has the required RLS policies.
5. Test sign-up, sign-in, sign-out, account switching, sync failure, offline/local-only use, and the delete-my-cloud-records confirmation flow.

## GitHub Pages deployment

The GitHub Actions workflow in `.github/workflows/pages.yml` runs JavaScript syntax checks and release smoke tests on pushes to `main` and `feature/supabase-auth-sync`, and on pull requests into `main`. It deploys only from `main`.

To enable deployment:
1. In the repository, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Merge the reviewed release branch into `main`.
4. Open **Actions → ProofPocket CI and Pages** and confirm both verification and deployment jobs pass.

The expected project-site URL is `https://starinfinity14.github.io/Proofpocket/`. It becomes a valid preview/production URL only after GitHub Pages has been configured and the deployment workflow succeeds.

## Known limitations

- Receipt/image upload is not implemented.
- Automatic push/email reminders are not implemented; deadlines are displayed in the app.
- Cloud sync requires internet access and a correctly configured Supabase project.
- Local-only records remain in that browser and are not automatically transferred to an account.
- This app is not a secure document vault. Do not store passwords, payment-card details, identity documents or other highly sensitive information.
- A successful static deployment does not by itself prove the Supabase authentication and sync flows are configured correctly; test those separately before inviting users.

## Release checks

Run:
```sh
node --check app.js
node --check auth.js
node --check supabase-config.js
node scripts/smoke-test.mjs
```


### Backup restore
- Settings includes a JSON backup import action for files exported by ProofPocket.
- Restore validates the backup format and individual records, limits files to 5 MB, keeps existing records, and skips duplicate IDs.
- Test restore with a copied export and confirm the imported records appear in the current local or signed-in account scope.


### Freemium model preview
- Free remains the default: unlimited purchase records, in-app return/warranty tracking, JSON export/restore, and optional account cloud sync.
- Proposed Plus: family sharing, receipt attachments, automatic reminders, advanced reports/exports, and priority support.
- Indicative beta pricing shown in the UI: ₹99/month or ₹799/year; proposal only, not a checkout or active subscription.
- Do not remove or cap existing free features as part of this preview. Validate demand and operating costs before implementing billing or paid entitlements.


### ProofPocket Plus — Razorpay Test Mode
- Monthly and yearly recurring subscription checkout is prepared for Razorpay Test Mode (₹99/month and ₹799/year are the configured product prices; create matching Razorpay test plans before enabling checkout).
- Browser checkout calls the authenticated `create-plus-subscription` Edge Function. Razorpay API credentials and plan IDs belong only in Supabase Edge Function secrets.
- `razorpay-webhook` validates the HMAC-SHA256 signature against the raw request body and records event IDs for duplicate-delivery protection.
- The `subscriptions` table is owner-readable only; clients cannot insert or update entitlements. Plus is enabled only by verified server-side subscription lifecycle events.
- Required Edge Function secrets: `RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY`, and Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY` (plus the standard `SUPABASE_URL` and `SUPABASE_ANON_KEY`).
- Configure a Test Mode webhook to `https://zvtbrzzvrowmsesykqck.supabase.co/functions/v1/razorpay-webhook` and subscribe to `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.paused`, `subscription.cancelled`, `subscription.completed`, and `subscription.resumed`.
- Apply `supabase/migrations/20261030000000_proofpocket_plus_billing.sql` and deploy both Edge Functions before testing checkout. These steps are intentionally not run automatically by a GitHub source change.
- This is not a live-payment release. Do not switch `RAZORPAY_MODE` to live or use live credentials in this test build. Merchant onboarding and any real-payment activation must be handled by a legally eligible adult.
- Run the release checks and then manually test sign-in, monthly/yearly checkout, activation, subsequent charge, failed charge, cancellation, duplicate webhook, invalid signature and account isolation. Browser checkout callbacks never unlock Plus.
