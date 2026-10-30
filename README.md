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
