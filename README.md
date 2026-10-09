# Portion­ed

Portion­ed helps neighbors coordinate an in-person grocery trip and split package-sized items. The current pilot area is Roosevelt Island + Midtown East near the Roosevelt Island tramway.

## Run it

Follow [SETUP.md](./SETUP.md) for the full instructions to create/configure Supabase, seed pilot catalog data, sign in, and run the app locally.

## Stack

- Next.js App Router, React, and TypeScript
- Supabase Auth and Postgres with row-level security
- Database-seeded pilot stores and shared grocery item taxonomy

The frontend does not contain sample shopper records or catalog arrays. Store/item choices and account shopping plans are loaded from Supabase. The pilot begins with an empty match feed until real users create compatible plans. See the current implementation scope in [SETUP.md](./SETUP.md).
