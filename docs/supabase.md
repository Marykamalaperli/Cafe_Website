# Supabase setup for BitesBro

The app now uses Supabase Authentication, Postgres and Storage when its two public environment variables are configured. The customer design, food catalogue, fonts, photographs and recommendations remain in place. No Docker is required.

**The owner chose to run SQL manually. The files below are prepared; creating them locally does not apply them to the Cloud project.** No passwords, staff accounts or fictional orders are seeded.

## 1. Create the database and bucket

In **Bites_Bro_Website → SQL Editor**, open a new query, paste the complete contents of [supabase/setup.sql](../supabase/setup.sql), and click **Run**. It contains the schema and the 50-dish/40-photo-metadata seed. It creates **Storage → menu-images**, a public JPEG bucket with a 5 MiB object limit. The `files` folder appears after the first photo upload.

The source migrations are [001_bitesbro.sql](../supabase/migrations/001_bitesbro.sql) and [002_catalogue.sql](../supabase/migrations/002_catalogue.sql). The combined file can be rerun without resetting orders, staff assignments, owner menu edits or uploaded photographs. It refuses to adopt unrelated existing application tables or a pre-existing `menu-images` bucket. Review such a conflict instead of deleting existing data.

`npm run supabase:prepare` regenerates the seed and combined SQL. If a local SQLite file exists, the generator reads **menu rows only** in a read-only transaction, including paused dishes and edited prices; otherwise it uses the sample catalogue. Custom images require their licence/hash in the photo manifest first. It never exports customer tables. The local database inspected for this change contained 50 dishes and no customer records. Future SQLite customer-history transfers need a separate, private migration with explicit account ownership; never infer ownership from an unverified email or publish an export in `public/`.

## 2. Configure email authentication

In **Authentication → Providers / Email**, enable email/password signup and email confirmation. Configure the project's email delivery/SMTP as appropriate. Supabase manages confirmation and recovery emails; the app does not send order confirmations.

The built-in Supabase mail sender restricts delivery to approved project-team recipients and has a low sending limit. For customer signup, configure a custom SMTP provider in the project's **Authentication → Email / SMTP Settings**, including a verified sender domain. Signup needs an actual inbox that can receive the confirmation link. Do not disable email confirmation or role checks to work around a mail configuration error.

If signup fails, the website displays a specific safe error and a provider reference code. In **Supabase → Logs → Auth**, inspect the matching failed request: `email_address_not_authorized` needs email-provider setup; `over_email_send_rate_limit` requires waiting or configuring appropriate SMTP limits; `weak_password` needs a stronger password. For `unexpected_failure`, the log distinguishes confirmation-email delivery from a database trigger/permission failure. Public Auth settings cannot reveal SMTP configuration or account-write errors. Do not rerun baseline SQL to guess at an Auth failure; diagnose the log first.

`No API key found in request` is a gateway rejection before signup validation. Inspect the website's actual **POST** request in DevTools → Network → Response; opening the API URL directly in the address bar sends no `apikey` header and produces the same message. The browser adapter explicitly includes the runtime publishable key on requests to the configured Supabase origin while preserving the signed-in user's Authorization header. Confirm the two public Actions build settings match the project, redeploy, and hard-refresh the site if the actual POST is missing its key. Never put a service-role key in browser settings.

In **Authentication → URL Configuration**, set the Site URL to your frontend, and allow its exact auth callback:

```text
Site URL: https://marykamalaperli.github.io/Cafe_Website/
Redirect URL: https://marykamalaperli.github.io/Cafe_Website/auth/
```

For local development, also allow `http://localhost:3000/auth/` (and `http://127.0.0.1:3000/auth/` if you use that origin). Update these values when using a custom domain. PKCE confirmation/reset links should be opened in the browser that requested them. Signup and password changes require at least 12 characters in this UI; set the same minimum in Supabase Auth.

## 3. Assign the first administrator

Create **admin@bitesbro.com** through the website's **Create account** form and confirm its email, or create a confirmed user in **Authentication → Users** with a password you choose there. No password belongs in SQL or Git.

Then run [supabase/bootstrap-admin.sql](../supabase/bootstrap-admin.sql) in SQL Editor as the project owner. It grants `admin` to that existing confirmed account. If the account is missing/unconfirmed, it stops without changing any roles. Sign in again to open `/admin/`.

For chefs: create/confirm their accounts normally, then sign in as administrator and use **Settings → Staff access → Chef**. The same form can assign administrators or return a staff account to customer access. Administrators cannot change their own role through this form. Role changes take effect on the next data/page refresh without waiting for JWT expiry.

| Account | Pages and data | Changes allowed |
| --- | --- | --- |
| Visitor | Public menu, recommendations, auth | Create account / request password reset |
| Customer | Customer site and their own `/orders/` history | Place orders, cancel own received orders, submit own forms |
| Chef | `/kitchen/`; preparation tickets without contact/address fields | Received → Preparing → Ready → Collected; dish availability |
| Administrator | `/admin/` and `/kitchen/`; operational and customer records | Kitchen actions, permitted cancellations, menu editing/archive, settings, staff roles, photo uploads |

New signups always get `customer`, even if a caller supplies `role: admin` in user metadata. Roles live in a protected `user_roles` table, not editable profile fields. No public role picker or `?demo=1` parameter can override Supabase access.

## 4. Configure the frontend

Keep these values in the ignored `.env.local` file for local runs:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Run `npm ci`, then `npm run dev`. The start/build commands load `.env.local`. Node automatically selects Supabase when these settings exist and stops using SQLite for application reads/writes. A connection or SQL error never falls back to saving an order in SQLite or the fictional browser store.

For **GitHub Pages**, add the same two names under **Repository → Settings → Secrets and variables → Actions → Variables or Secrets**. The deployment workflow installs locked dependencies and supplies these values during the Pages build; it fails before publishing if they are missing. Browser authentication requires the publishable key; the generated, ignored `supabase-config.json` intentionally contains that public URL/key. It never contains a service-role key, database password or management token. The build rejects secret/service-role keys. Do not commit `.env.local` or generated configuration. No management credential is needed in GitHub Actions, and Actions does not run SQL migrations.

Supabase handles the backend for the Pages frontend, so a Node host is optional. Static page shells can be downloaded from Pages; authenticated page guards control the application views, while **Postgres RLS and role-checked functions protect all real data and operations**. Hiding links is not the access boundary. The Node API also verifies caller tokens and preserves body limits, rate limits and same-origin checks. Its CSP permits only the configured Supabase origin for connections and its menu-image path for photographs.

## 5. Store the actual menu photographs

After SQL and administrator setup, open **Administrator → Settings → Upload menu photographs**. This uploads all **40** bundled licensed JPEGs to:

```text
Storage → menu-images → Files → files/
files/<photo-id>-<first-12-characters-of-source-sha256>.jpg
```

Every local file is checked against `photo-credits.json` before upload. The uploader resumes safely: existing bytes must match the source hash; it never overwrites or deletes objects. It links each successful upload to `menu_photos`, and customer/admin menu images then use the Supabase public URLs. Local photos remain a working fallback until upload. Author, source, licence, reference captions and full hashes stay in the database and visible credit page. The bucket grants public image reads and administrator inserts only; customer/chef uploads, overwrites and deletes are not allowed.

Alternatively, run `npm run supabase:photos` in an interactive terminal. It asks for your admin email/password with password echo disabled, uses the signed-in user's permissions, and signs out when finished. It does not store credentials or use a service-role key.

## Tables and server rules

| Table | Key fields / purpose |
| --- | --- |
| `profiles` | Auth user ID, display name, phone; owner can update only name/phone |
| `user_roles` | Auth user ID, customer/chef/admin, update time; no direct client writes |
| `menu_categories` | Cuisine ID, display name, ordering |
| `menu_photos` | Photo ID, local path, SHA-256, full attribution JSON, Storage path, upload time |
| `menu_items` | Dish ID, category, description, integer paise price, photo, diet, portion, spice, preparation, ingredients/allergens, portion/add-on choices, availability/archive |
| `restaurant_settings` | Accepting orders, preparation estimate, delivery fee/free threshold |
| `orders` | Owner ID, reference, contact/fulfilment/date/time, delivery fields, instructions, status, authoritative totals, consent, unique retry ID |
| `order_items` | Order/dish IDs, immutable name/image/price/option snapshots, quantity |
| `order_events` | Order, status, actor ID, timestamp; created atomically with transitions |
| `reservations` | Owner, contact, sitting, guests, notes, consent; locked capacity checks |
| `messages` | Owner, contact, subject/message, consent, reference |
| `newsletter_subscriptions` | Owner, verified account email, consent |
| `staff_activity` | Actor, database role, event text and time; administrator reads only |
| `bitesbro_schema_migrations` | Applied application schema/seed versions |

All tables have RLS enabled. Clients cannot insert/update orders, lines, events, roles, settings or menu records directly. Narrow RPCs verify the database role and authenticated owner. Definer functions use an empty search path and explicit qualified names; their default PUBLIC execution is revoked. Chef reads use a projected ticket function, never direct access to customer tables.

Postgres recalculates bag portions, spice, add-ons, quantities, prices and delivery fees from locked menu/settings rows. It ignores supplied totals/roles and keeps immutable line snapshots. A per-user request UUID prevents retry duplicates. Status changes lock the order and cannot skip/reverse stages or reopen terminal tickets. Reservation capacity checking/insertion happens in one locked transaction. Dates and food slots use Bangalore time, including the afternoon closure and minimum same-day lead time. Contact email comes from the verified Auth account.

Dashboards poll every eight seconds; the customer menu refreshes every fifteen seconds. Real customer/operational records remain in memory and Supabase, never in the fictional demo local-storage namespace. Bag selections and Supabase's refreshable login session are stored in the browser. Sign out on shared devices.

## Verification

```sh
npm run check
npm test                 # Includes actual PostgreSQL/RLS tests in isolated PGlite
npm run build:pages
npm run test:browser     # Existing journeys plus fixture-backed Auth/Storage workflows
npm run supabase:check   # Live, read-only project Auth connectivity
npm run supabase:verify  # Live, read-only schema/bucket/photo readiness and denied anonymous operations
```

[supabase/tests/security.sql](../supabase/tests/security.sql) can also run as a complete query in SQL Editor on the freshly set-up project, before accepting live traffic. It creates temporary test users, exercises pricing, ownership, privilege escalation, chef/admin boundaries, transitions and Storage policies, then **rolls back every fixture change**. It sends no emails and uploads no files. The local test suite executes this exact SQL against real embedded PostgreSQL with stand-in Auth/Storage metadata schemas. Browser tests use the real SDK with mocked Auth/REST/Storage responses, not the real project or email service.

Live readiness remains pending until the owner runs the SQL, creates/confirms the admin account, configures redirects/deployment variables and uploads the images. Payments, delivery dispatch, final business contacts and a production data-retention policy remain separate integrations.
