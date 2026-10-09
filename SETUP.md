# Run Portion­ed locally

## What you need

- Node.js 20 or newer, with npm
- A Supabase account
- Docker Desktop only if you want to run Supabase locally

## 1. Create your Supabase project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Choose an organization, then select **New project**.
3. Name it `portioned-pilot` and choose a region near New York.
4. Create a strong database password and save it. You will need it when linking the CLI.
5. Select **Create new project** and wait until the project status is ready.

Supabase's [Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs) has screenshots and project creation details.

## 2. Set up email sign-in

Portion­ed sends a sign-in link by email.

1. In your Supabase project, open **Authentication → URL Configuration**.
2. Set **Site URL** to `http://localhost:3000`.
3. Add both `http://localhost:3000/**` and `http://localhost:3001/**` to **Redirect URLs**, then save. Next.js uses port 3001 when port 3000 is already occupied.
4. Open **Authentication → Sign In / Providers → Email** and make sure Email is enabled.

The Site URL and redirect allow-list control where sign-in links can return. See [Supabase redirect URL docs](https://supabase.com/docs/guides/auth/redirect-urls).

**Email delivery during development:** Supabase's built-in mailer only sends to email addresses on your Supabase organization team and is limited to two emails per hour. Add your test addresses to the organization, or configure custom SMTP before inviting pilot users. In **Authentication → Emails → SMTP Settings**, enter the SMTP host, port, username, password, and sender address provided by your email service. Verify the sender domain with that service first. [Supabase email delivery details](https://supabase.com/docs/guides/auth/auth-smtp).

## 3. Get the project URL and public key

1. Open the project's **Connect** dialog, or go to **Project Settings → API Keys**.
2. Copy the **Project URL**.
3. Copy the **Publishable key**. It starts with `sb_publishable_`.

The publishable key is intended for browser apps. Do not use a secret key or `service_role` key in the frontend or in a `NEXT_PUBLIC_` variable. Row Level Security protects the data. See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

## 4. Install the app dependencies

Open a terminal in the Portion­ed project directory. If you are cloning the repository for the first time:

```bash
git clone <repository-url> portioned
cd portioned
```

Install the dependencies:

```bash
npm install
```

## 5. Apply the database migration and catalog seed

The migrations create the app tables and security policies, then seed the Roosevelt Island + Midtown East pilot area, stores, and grocery item taxonomy. The separate catalog migration also makes it safe to add the catalog to a project whose schema migration has already run.

Run these commands from the project directory:

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

To find `<project-ref>`, copy the part before `.supabase.co` in your Project URL. For example, in `https://abcxyz.supabase.co`, the project ref is `abcxyz`.

- `supabase init` creates the CLI config in this repository.
- `supabase login` opens a browser so you can authorize the CLI.
- `supabase link` links this checkout to the hosted project. Enter the database password from step 1 when prompted.
- `supabase db push` applies the SQL migration. Review the migration and confirm it.

The CLI workflow is described in [Supabase's migration docs](https://supabase.com/docs/guides/deployment/database-migrations).

To confirm the migration and seed worked, open **Table Editor** in the dashboard and check that `pilot_areas`, `stores`, `item_categories`, and `item_types` contain rows.

## 6. Add local environment values

Copy the example environment file:

```bash
cp .env.example .env.local
```

Open `.env.local` and enter the values from step 3:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Save the file. `.env.local` is ignored by Git; do not commit it. Restart the app if you change these values.

## 7. Start Portion­ed

```bash
npm run dev
```

Open the local URL printed by `npm run dev` (usually [http://localhost:3000](http://localhost:3000); it may use port 3001 if 3000 is busy). Enter your name and email, then open the sign-in link Supabase emails you. The app sends the link back to the same port you used to request it.

The database creates a profile for each new account. Catalog choices and shopping lists are stored in Supabase. Add a list, then use a second account to create a list with the same item, a shared store, and the same availability option to see a match.

## Production build

```bash
npm run build
npm run start
```

## Optional: run Supabase locally

This requires Docker Desktop to be running. From the project directory:

```bash
npx supabase start
```

Copy the local API URL and publishable key printed by the CLI into `.env.local`, then run `npm run dev`. Reset the local database and replay the migrations with:

```bash
npx supabase db reset
```

Stop local Supabase with:

```bash
npx supabase stop
```

## Troubleshooting

- **Supabase setup screen:** check that both variables in `.env.local` are correct, then restart Next.js.
- **No sign-in email:** with Supabase's built-in mailer, the recipient must be on your organization team. For other recipients, configure custom SMTP.
- **Link returns to the wrong place:** set the Site URL and Redirect URL in step 2.
- **Empty store or item choices:** make sure `db push` completed for the same project configured in `.env.local`; check the four catalog tables in step 5.
- **Permission error:** sign in and confirm the migration was applied. Keep row-level security enabled.

## Current scope

The item/store catalog, user profiles, shopping lists, and compatible shopper feed use Supabase. In-app chat, friend-request actions, reviews, and reports are not connected to database workflows yet.
