# My English Dictionary

A personal English learning app with three modules, designed for desktop and mobile browsers.

[Open My Dictionary](https://indrapandu.github.io/english-dictionary/)

## Modules

| Module | Purpose | Specific fields |
| --- | --- | --- |
| Chunks | Learn useful combinations and reusable sentence patterns, such as `make a decision` or `Would you mind…?` | Chunk type, pattern, when to use |
| Words | Learn individual vocabulary, such as `cumbersome` | Part of speech |
| Phrases | Learn expressions, idioms, phrasal verbs and sayings, such as `on the same page` | Phrase type, register, when to use |

Every module supports English and Indonesian meanings, pronunciation, multiple example sentences with translations, notes, favorites, and New / Learning / Familiar / Mastered status.

Module navigation is in the desktop sidebar and the mobile tab bar. Search, filters and counts apply to the selected module. Search includes meanings, examples and the module-specific fields. The URL remembers the module through `#chunks`, `#words` or `#phrases`; the default is Words.

## Architecture

- Frontend: static HTML, CSS and vanilla JavaScript, hosted by GitHub Pages.
- Authentication: existing Supabase email/password login.
- Database: Supabase Postgres project `english-dictionary` (`cptrggleymlhngejnkig`).
- `public.words` is the shared entry table. Its legacy name is retained; the `module` column separates Chunks, Words and Phrases.
- `public.word_examples` contains child examples linked by `word_id` with cascading deletion.
- `save_entry(p_module, p_entry_id, p_entry, p_examples)` saves an entry and all its examples in one transaction, then returns the saved record and examples. The UI updates from this confirmed response.
- Editing preserves the entry ID and replaces its example rows atomically. The RPC checks both ownership and module before updating.
- The original `save_word` RPC is retained as a compatibility wrapper restricted to Words.
- A unique index on `(user_id, module, lower(word))` prevents duplicates within one module. The same text may be studied in different modules or by different users.
- Initial data loading uses batches of 500 records. Module switching and search then operate on the user's loaded entries. There is no Realtime subscription.

Existing entries remain in Words with their original IDs, owners and examples. They are not automatically reclassified. The module expansion does not change the login provider.

## Database setup

The following migrations are applied to the live project and recorded in `supabase/migrations/`:

1. `20260913052727_initialize_dictionary.sql`
2. `20260913072909_add_learning_modules.sql`

For a **new project**, apply the migrations in order, or apply `supabase/schema.sql` once as a standalone current schema. Do not apply both paths.

For the original two-table deployment, apply only the second migration. Do not rerun applied migrations. Supabase's optional GitHub integration and automatic migration deployment are not configured.

## Account setup

1. In [Supabase Authentication > Users](https://supabase.com/dashboard/project/cptrggleymlhngejnkig/auth/users), create your personal user with email/password and auto-confirm the email.
2. For private use, disable **Allow new users to sign up** under Authentication settings. Hiding signup controls does not disable the signup API.
3. Open the app and log in. You can add entries in any module.

Account creation and signup settings are managed in the dashboard. Passwords and other private credentials must never be stored in this repository. `js/config.js` contains only the project URL and public publishable key. The Supabase browser SDK is pinned to `2.116.0` with an integrity hash.

## Verification

Run the frontend regression tests with Node.js 24:

```sh
npm ci
npm test
```

The tests use jsdom with simulated API responses. They exercise module isolation, form fields, create/edit/delete, favorites, cancellation, duplicate handling, escaping, example preservation, pagination and signed-out behavior. jsdom is a development dependency; the deployed app has no build step and does not load it.

Run each SQL test file in its entirety as `postgres` in Supabase SQL Editor:

- `tests/supabase_rls.sql`: original Words behavior, ownership and anonymous denial.
- `tests/modules_rls.sql`: three-module CRUD, category validation, duplicate scopes, atomic rollback, module guards, cross-user isolation and delete cascades.

Both SQL suites passed on the live project after the module migration. Fixtures and test users were rolled back. Frontend tests passed; authenticated visual testing in a real browser still requires a user session.

Performance advisors reported no findings. The security advisor reported one Auth setting: [leaked password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The module migration does not change Auth settings. RLS remains enabled on both tables, and anonymous access to entries and save functions is denied.

## Hosting

GitHub Pages deploys `main` from the repository root. Changes to HTML, CSS and JavaScript publish through the Pages workflow. Database migrations must be applied separately before publishing frontend code that depends on them.
