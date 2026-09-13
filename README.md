# My English Dictionary

A simple personal English dictionary web application for mobile and desktop browsers.

## Features

- Email and password login through Supabase
- Add, edit, and delete words or phrases
- English and Indonesian meanings
- Part of speech and pronunciation
- Multiple example sentences and translations
- Notes, favorites, search, and mastery status
- Responsive layout for phone and desktop

## Technology

- Frontend: HTML, CSS, and vanilla JavaScript
- Hosting: GitHub Pages
- Authentication and database: Supabase

## Configuration status — 13 September 2026

- App: [My Dictionary](https://indrapandu.github.io/english-dictionary/)
- Supabase project: `english-dictionary` (`cptrggleymlhngejnkig`)
- `js/config.js` contains the Project URL and public publishable key. Preview mode is no longer active.
- `public.words` and `public.word_examples` are created, with ownership policies for each operation.
- Database migration `20260913052727_initialize_dictionary` has been applied. `supabase/schema.sql` is its source SQL.
- `save_word` saves a word and all examples in one transaction. A failed example save rolls back the whole change.
- Supabase JavaScript is pinned to `2.116.0` with an integrity hash.
- No login account exists yet. Email/password login is enabled. Public signups are still enabled in the backend and need to be disabled below; hiding registration on the website does not disable the API.

## Finish your personal login

1. Open [Supabase Authentication > Users](https://supabase.com/dashboard/project/cptrggleymlhngejnkig/auth/users).
2. Choose **Add user > Create new user**. Enter your own email and password and enable **Auto Confirm User** when shown, then create the account. Do not put the password in GitHub or `config.js`.
3. In **Authentication > Sign In / Providers**, disable **Allow new users to sign up** and save. Keep the **Email** provider enabled. Administrator-created accounts can still sign in.
4. Open [My Dictionary](https://indrapandu.github.io/english-dictionary/), log in, add a word with an example, then refresh the page to check persistence.

Account creation and the signup setting must be completed in the Supabase dashboard: the available project connection does not expose Auth user-management or Auth-settings changes. The app uses password login and does not send email invitations or password-reset messages.

The browser communicates directly with the Supabase API. GitHub holds the frontend source and GitHub Pages hosts it. Supabase's optional GitHub integration and automatic database deployments have not been configured.

## Verification

- The live database passed ownership, duplicate-word, create/update/delete, example-cascade, and atomic-save rollback checks in `tests/supabase_rls.sql`.
- Tests also confirmed that another user cannot read, edit, delete, reassign, or attach examples to someone else's word.
- Unauthenticated REST access to both tables and the save function returned permission denied, as intended.
- Supabase security and performance advisors returned no findings after the migration.
- Test data was rolled back. No test accounts or vocabulary records were left in the database.
- JavaScript syntax, the pinned SDK, RPC request construction, database-error propagation, and the no-session login redirect passed checks. RPC network responses in the JavaScript checks were stubbed; database behavior was tested separately on the live project.
- Automated browser testing was unavailable because the browser download timed out. Mobile/desktop interaction should be checked with the first real account.

To repeat database verification, run the **entire** `tests/supabase_rls.sql` file as `postgres` in SQL Editor. It uses temporary test fixtures within a transaction and ends with `ROLLBACK`.

Real email/password login and saving through the deployed site still need the first account created above.

## GitHub Pages

For free hosting from a personal GitHub account, make the repository public. Then open:

`Settings > Pages > Build and deployment > Deploy from a branch`

Select branch `main`, folder `/ (root)`, and save.

The URL is [https://indrapandu.github.io/english-dictionary/](https://indrapandu.github.io/english-dictionary/).

## Security

Only use the Supabase Project URL and **Publishable key** in `js/config.js`. Never put a Supabase `service_role` key, database password, or other private credential in this repository. Browser-visible keys do not grant access to dictionary data without a signed-in user's session; database grants and RLS enforce ownership.
