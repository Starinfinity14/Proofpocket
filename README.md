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

- Receipt attachments are implemented in the signed-in cloud-record UI; they require the household migration to be applied first.
- Browser deadline reminders are implemented as foreground notifications while the app is open. They do not run reliably in the background and do not send email, SMS or web push.
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
- Proposed revised Plus pricing: ₹149/month or ₹1,199/year, reflecting the planned encrypted personal document vault. These prices are proposals, not active offers. Razorpay Test Mode plan IDs and server secrets must be updated to matching amounts before checkout is re-enabled.
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


### Household features foundation (Patch #11)
- Added a private `proofpocket-receipts` Storage bucket with a 5 MB limit and JPEG, PNG, WebP and PDF allowlist.
- Added owner-scoped receipt metadata, household and membership tables, and per-user reminder preferences.
- Storage objects are private and restricted to the authenticated user's UUID folder.
- This migration is committed to the feature branch but has **not** been applied to the Supabase project. Apply it only after reviewing the migration and confirming the existing `purchases` table uses UUID IDs and has `user_id` ownership.
- This is the backend foundation, not a claim that receipt upload, household invitations, or scheduled email delivery are already available in the UI.


### Plus encrypted document vault (Patch #12)
- Added a private `proofpocket-vault` bucket restricted to authenticated Plus subscribers and each user's UUID folder.
- Added owner-scoped vault metadata with a 10 MB ciphertext limit and versioned encryption marker.
- Intended design: encrypt document bytes in the browser before upload; the server stores ciphertext, not plaintext. Do not upload documents until client-side encryption, key recovery, and deletion flows are implemented and reviewed.
- Document names and categories are metadata and can still reveal information; use neutral labels. This is not an official DigiLocker integration and does not verify government-issued documents.
- Proposed Plus price updated in the UI to ₹149/month or ₹1,199/year. Checkout is disabled until matching Razorpay Test Mode plans and server-side plan IDs are configured. No live billing changes have been made.
- The vault migration depends on the Plus billing schema and has not been applied to Supabase.


### Plus Vault interface implementation
- Added a dedicated Plus Vault view to desktop and mobile navigation.
- Added browser-side AES-256-GCM encryption with a per-file random salt and IV; the passphrase is expanded with PBKDF2-SHA-256 (310,000 iterations) and is not uploaded or persisted by the app.
- Added encrypted upload, listing, decrypt-and-download, and deletion flows using the private `proofpocket-vault` bucket and Plus entitlement check.
- Client file limit is 7 MB to allow for base64 envelope overhead under the 10 MB encrypted-object storage cap. Supported input types: PDF, JPEG, PNG and WebP.
- The file name and category remain metadata in Supabase; document contents are encrypted. Avoid descriptive filenames if that metadata is sensitive.
- **Not release-ready yet:** apply the billing and vault migrations in dependency order; verify bucket policies, entitlement revocation, storage cleanup, passphrase-loss messaging, and end-to-end encryption/decryption on real test accounts before enabling the feature for customers. No formal security audit has been completed.


### Purchase receipt attachments — frontend stage
- Added per-record receipt controls for signed-in cloud accounts: upload, list, download through short-lived signed URLs, and delete.
- Browser validation limits files to 5 MB and JPEG, PNG, WebP or PDF. Storage objects use a per-user/per-purchase UUID path in the private bucket.
- Local-only records remain usable; receipt controls explain that cloud sign-in and a cloud-synced purchase are required.
- The household migration must be applied before this feature can operate. No migration was applied and no receipt was uploaded as part of this source change.
- Receipt contents are stored as uploaded files, not end-to-end encrypted. Avoid uploading highly sensitive documents; use the Plus Vault for documents intended for client-side encryption.


### Reminder preferences — browser notification stage
- Added settings for enabling browser notifications and choosing 1, 3, 7, 14 or 30 days before return/warranty dates.
- The app checks dates on startup, focus, visibility changes, record updates and every five minutes while open. A local deduplication key prevents repeated alerts for the same record/date/type on the same day.
- Preferences are saved locally and can sync to the signed-in account through `reminder_preferences.browser_notifications_enabled`, `reminder_days` and `timezone`.
- Browser notifications require a secure context, supported browser and user permission. This is not a background push service; notifications are not guaranteed when the app is closed or suspended.
- No email/SMS provider, scheduled server worker or web-push subscription has been configured. Those are separate future delivery stages.
- The reminder preference migration is part of `20261031000000_household_features_foundation.sql`; it has not been applied to Supabase.


### Family sharing — invitation and explicit-share stage
- Added a household workspace with owner/member roles, one household per account, and a six-person household limit.
- Owners can create a single-use invitation code bound to the invitee's email address. Codes expire after seven days; only a signed-in account with the matching email can redeem one. The code is shown once for the owner to share privately; automatic email delivery is not configured.
- Members can view household membership and explicitly shared purchases. Owners can remove members; members cannot see another member's private purchases unless a purchase is explicitly shared.
- Sharing is restricted server-side to purchases owned by the signed-in account. Shared purchase access is read-only in this stage; edits and deletion remain with the original owner.
- The family-sharing migration `20261031010000_family_sharing.sql` depends on `20261031000000_household_features_foundation.sql` and has **not** been applied. Review and apply migrations in order only after confirming the purchases schema and running the planned security review.
- The invitation code is a bearer credential: share it only with the intended person. It is stored server-side only as a SHA-256 hash and is single-use.
- This stage is source-complete but not yet end-to-end verified. It does not send invitation emails, transfer ownership, or support multiple households per account.


### Reports & analytics
- Added a Reports view with total recorded spending, average purchase amount, category breakdown, monthly spending, warranty-date coverage, and upcoming return/warranty dates.
- Reports support all-time, current-year, 90-day, and 30-day periods, and can export the selected records to CSV.
- Household reporting is optional and includes only purchases explicitly shared with the signed-in member.
- Calculations use available purchase records and INR display formatting. Missing amounts and dates are excluded from calculations that require them. Reports are informational, not accounting or tax advice.
- This stage is implemented in source but has not yet received the full end-to-end launch test.
