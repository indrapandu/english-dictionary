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

## Current preview

The frontend runs in preview mode while `js/config.js` still contains placeholders. Preview changes are temporary and disappear after the page is refreshed.

## Setup

1. Create a Supabase project.
2. Open **SQL Editor**, copy `supabase/schema.sql`, and run it once.
3. In **Authentication > Users**, create the account that will use this application.
4. Copy the Supabase **Project URL** and **Publishable key**.
5. Replace the two placeholders in `js/config.js` and commit the change.
6. Open the GitHub Pages URL and log in with the Supabase account.

For a private personal app, disable public user registration in Supabase after creating your own account.

## GitHub Pages

For free hosting from a personal GitHub account, make the repository public. Then open:

`Settings > Pages > Build and deployment > Deploy from a branch`

Select branch `main`, folder `/ (root)`, and save.

The expected URL is:

`https://indrapandu.github.io/english-dictionary/`

## Security

Only use the Supabase Project URL and **Publishable/anon key** in `js/config.js`. Never put a Supabase `service_role` key, database password, or other private credential in this repository.
