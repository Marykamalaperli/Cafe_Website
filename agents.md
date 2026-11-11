# Working on BitesBro

## Start here

- Read `readme.md`, `docs/architecture.md`, and `design_system.md` before changing the relevant layer.
- Work in the existing checkout. Cloud tasks are already isolated; do not create a Git worktree unless the user asks for one.
- Require Node.js 24+. Use `npm ci` with the committed lockfile. `npm run dev` starts the site and creates an ignored SQLite database on first run.
- Preserve unrelated user changes and existing data. Do not commit `.env`, databases, logs, customer details, or test artifacts.

## Architecture

- `public/` is the only web-served directory. Keep server code, database files, and secrets outside it.
- Configured Supabase uses Auth, Postgres/RLS and Storage, including on GitHub Pages. Read `docs/supabase.md` before changing auth, role guards, SQL or photo uploads. `supabase/setup.sql` is generated from the two source migrations with `npm run supabase:prepare`; keep them in sync. The owner explicitly chose to run SQL manually. Do not claim a local migration file or a mocked test applied changes to Cloud.
- Roles come from protected `user_roles`, never local storage or user metadata. New accounts are customers; `admin@bitesbro.com` receives its first admin role only through the confirmed-account bootstrap SQL. Customer operations are owner-scoped, chefs receive preparation projections, and administrators can access admin and kitchen views. Preserve role checks, RLS, qualified definer functions and revoked default function privileges.
- Real operational state stays in memory and Supabase. Never copy it into the fictional demo store. `APP_DEMO_MODE=true` enables the earlier fictional role preview only when Supabase is unconfigured; `?demo=1` cannot override Cloud roles. Page guards improve navigation; RLS and transactional RPCs enforce security.
- `menu-images/files/` stores public licensed JPEGs. Only administrators upload; verify source hashes, preserve attribution, avoid overwrites/deletes and register an image only after its object exists. Publishable browser configuration is generated/ignored; service keys, admin passwords and management tokens must never enter it.
- `server/cafe.js` owns business details and opening periods. `/api/cafe` drives visit details and the booking clock. The user supplied **BitesBro, Bangalore, 10am–3pm and 6pm–11pm**, and explicitly requested **both vegetarian and non-vegetarian food with South Indian dishes leading the menu**. Daily opening, sample menu/prices, and capacity remain editable assumptions.
- `server/food-menu.js` supplies the 42 new food dishes and option metadata; `server/menu.js` retains eight legacy products for the version-1 baseline. Never drop or reseed an existing database merely to update the menu; use parameterised database updates or a versioned migration.
- `server/schema.sql` applies the version-1 baseline. `server/migrations.js` then runs the version-2 food upgrade atomically, backs up existing database files, and preserves old menu edits and order history. `server/menu-photos.js` applies the version-3 photo update, replacing only known bundled illustration paths and preserving owner-uploaded images. Existing version-2 files receive a pre-photo backup; the version-1 backup covers a combined upgrade. Add forward migrations when changing an existing schema; `CREATE TABLE IF NOT EXISTS` alone cannot modify tables.
- Store money as integer paise. Recompute totals from database prices on the server, and preserve order-line price/name snapshots.
- Keep capacity checks and inserts in one transaction. Booking sittings must not overlap or span the afternoon closure.
- Use the café timezone for booking dates, not the visitor's or server's local timezone.
- Supabase writes require authenticated customer/staff roles as appropriate. Node's unconfigured SQLite preview retains the earlier public forms; never use it as a fallback after a Cloud failure. No anonymous endpoint may expose customer records.
- The owner authorised guest food ordering. Read `docs/guest-checkout.md`: Supabase guest Auth sessions provide private UUID/JWT ownership without signup emails. Guests receive only customer access; admin/chef roles always require confirmed non-guest accounts. Contact email never determines ownership. Apply forward migration 006 manually and enable Anonymous Sign-Ins; do not claim local tests activated Cloud or disable registered-user confirmation. The baseline must not overwrite upgraded permission functions.
- Read `docs/staff-delivery.md` for migration 010: deliveries use restaurant staff, with assignment, pickup, departure and delivery recorded by an administrator. Times are explicitly illustrative demo estimates; do not add Google routing, live traffic or automatic completion without a new user request.
- Read `docs/order-history.md` for migration 007: show guests three recent orders and older active tickets until finished; hide older completed guest data through RPC/RLS while retaining staff records. Members see five per page and retain search/pagination access to all their records. Never delete orders to enforce display limits. Delivery dispatch/arrival is administrator-recorded and does not book a courier. Publish frontend separately from owner-run Cloud SQL.
- Read `docs/portal-sessions.md` before changing browser auth. Customer, admin and kitchen sessions are independent; preserve the established customer key and guest UUIDs. Verify database roles before persisting a password login, retain same-portal logout propagation, and never copy a guest token into staff storage. Portal selection is navigation/session routing, never role assignment. Keep the existing Auth callback and test all three portals in one browser context, including refresh after another portal logs out.
- Read `docs/payments.md` for YouPI. Use forward migration 008 after history version 7; do not mix the earlier 003–005 preview SQL into the working Cloud schema. Manual UPI claims/signed gateway successes never pay an order automatically. Only an authorized administrator verifies the bank credit; unpaid UPI must be hidden from chefs and blocked by SQL transitions. Preserve payment idempotency, immutable totals, verified-reference uniqueness and owner/history checks. Merchant secrets stay in Edge Functions, never browser config. The `/review/` service worker and PostgreSQL database are fictional, separately built and scoped; never install them in the production root or copy real records into them. Real payments default to disabled.
- Validate request shape, types, length, dates, availability, and consent on the server. Preserve SQL parameterisation, body limits, same-origin checks, rate limits, and security headers.

## Interface

- Maintain the ivory/forest/terracotta palette, Fraunces + DM Sans pairing, food-led hero photography, and locally served licensed dish photographs. The identity is now a food-ordering restaurant, with coffee as one drinks category.
- `public/recommendations.js` owns suggestions based on the restaurant timezone and server clock (device instant on Pages). Keep suggestions separate from kitchen hours and availability; preserve full-menu browsing and diet filters.
- Photo licences, sources, authors, pinned mirror files and hashes live in `public/photo-credits.json`. Keep required attribution visible through `photo-credits.html`, regenerate it with `npm run photos:credits`, and label cuisine reference images. Do not call all photographs copyright-free or imply stock images show actual BitesBro servings.
- Serve fonts, scripts, images, and styles locally. Update CSP deliberately if an authorised integration truly needs another origin.
- GitHub Pages supports authenticated Supabase operations after SQL/configuration setup. Build with `npm run build:pages`; retain the sample catalogue and disable forms when Cloud is unavailable. Test nested role pages, callbacks and the repository subpath. Offline demo checkout is explicitly fictional and opt-in.
- `public/shared/demo-model.js` owns fictional order/menu state and pure metric helpers; `demo-store.js` adds local storage, Web Locks and tab updates. No contact/address/payment data belongs in that store. Staff RPCs require database-verified roles; no anonymous staff API is authorised.
- Keep every visible control useful. Connected forms must call real APIs; browser-demo forms use only the fictional adapter. Surface validation/network/storage failures, prevent double clicks, and honestly describe what was saved.
- Preserve semantic HTML, native dialog focus handling, labels, keyboard navigation, live status messages, and reduced-motion styles.
- Keep content readable without reveal animations. The HTML is visible without JavaScript; `.motion-ready` activates progressive enhancements.
- Avoid dummy links, fake maps/ratings/contact details, or claiming emails/payments are connected. The owner supplied the White Rose Layout / Whitefield pickup address in `server/cafe.js`; email and phone remain pending. Preserve clear demo status until live operations are intentionally configured.
- Bag storage holds only dish IDs, quantities and selected option IDs/spice. The separate demo namespace holds fictional order snapshots, demo menu/preferences and activity, never customer contact information or delivery addresses. Server-side totals must include validated portion/add-on prices and delivery fees.
- Read `docs/customer-ordering.md` for repeat ordering, favourites and kitchen arrivals. Fetch the current menu before repeat-order previews; never silently substitute retired options, reuse old prices, copy contact/payment/schedule data, or place an order from the repeat button. Preserve merge/replace review and bag limits. Browser favourites hold folder-scoped dish IDs only and must not claim account sync. Kitchen audio is opt-in and must not replay the initial queue or expose data outside the existing role guards.

## Verify changes

- `npm run check` and `npm test` for server or database work.
- `npm run test:browser` for UI, interaction, or full-stack workflow changes. Existing browser tests cover 320–1440px layouts and reduced motion.
- Keep tests meaningful: assert actual database effects and user-visible outcomes. Use an isolated temporary database; never exercise tests against real café/customer data.
- `tests/postgres.test.js` executes the real migrations/security SQL in isolated PostgreSQL (PGlite) with stand-in Auth/Storage schemas. `tests/auth.spec.js` uses the real browser SDK with fixture responses. Keep live connection/readiness checks read-only, and distinguish these verification layers in reports.
- Preserve underlying failures and diagnose them. Do not replace functional checks with trivial passing checks.
- Check `git status --short` and report the change, validation, and any remaining integration gaps concisely.

## Environment

`DATABASE_PATH`, `SITE_URL`, `PORT`, `HOST`, `CAFE_TIMEZONE`, and `RATE_LIMIT_MAX` are documented in `.env.example`. No API key is needed for local SQLite. Keep platform proxy, credentials, and TLS verification intact if installing dependencies. Never print credentials or invent secret values. Services do not survive cloud snapshots; restart them and verify `/api/health` and `/api/menu` in each fresh task.
