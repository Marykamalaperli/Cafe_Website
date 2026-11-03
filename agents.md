# Working on BitesBro

## Start here

- Read `readme.md`, `docs/architecture.md`, and `design_system.md` before changing the relevant layer.
- Work in the existing checkout. Cloud tasks are already isolated; do not create a Git worktree unless the user asks for one.
- Require Node.js 24+. Use `npm ci` with the committed lockfile. `npm run dev` starts the site and creates an ignored SQLite database on first run.
- Preserve unrelated user changes and existing data. Do not commit `.env`, databases, logs, customer details, or test artifacts.

## Architecture

- `public/` is the only web-served directory. Keep server code, database files, and secrets outside it.
- `server/cafe.js` owns business details and opening periods. `/api/cafe` drives visit details and the booking clock. The user supplied **BitesBro, Bangalore, 10am–3pm and 6pm–11pm**, and explicitly requested **both vegetarian and non-vegetarian food with South Indian dishes leading the menu**. Daily opening, sample menu/prices, and capacity remain editable assumptions.
- `server/food-menu.js` supplies the 42 new food dishes and option metadata; `server/menu.js` retains eight legacy products for the version-1 baseline. Never drop or reseed an existing database merely to update the menu; use parameterised database updates or a versioned migration.
- `server/schema.sql` applies the version-1 baseline. `server/migrations.js` then runs the version-2 food upgrade atomically, backs up existing database files, and preserves old menu edits and order history. `server/menu-photos.js` applies the version-3 photo update, replacing only known bundled illustration paths and preserving owner-uploaded images. Existing version-2 files receive a pre-photo backup; the version-1 backup covers a combined upgrade. Add forward migrations when changing an existing schema; `CREATE TABLE IF NOT EXISTS` alone cannot modify tables.
- Store money as integer paise. Recompute totals from database prices on the server, and preserve order-line price/name snapshots.
- Keep capacity checks and inserts in one transaction. Booking sittings must not overlap or span the afternoon closure.
- Use the café timezone for booking dates, not the visitor's or server's local timezone.
- Public APIs accept writes but do not expose customer records. Add authentication and authorisation before introducing staff endpoints.
- Validate request shape, types, length, dates, availability, and consent on the server. Preserve SQL parameterisation, body limits, same-origin checks, rate limits, and security headers.

## Interface

- Maintain the ivory/forest/terracotta palette, Fraunces + DM Sans pairing, food-led hero photography, and locally served licensed dish photographs. The identity is now a food-ordering restaurant, with coffee as one drinks category.
- `public/recommendations.js` owns suggestions based on the restaurant timezone and server clock (device instant on Pages). Keep suggestions separate from kitchen hours and availability; preserve full-menu browsing and diet filters.
- Photo licences, sources, authors, pinned mirror files and hashes live in `public/photo-credits.json`. Keep required attribution visible through `photo-credits.html`, regenerate it with `npm run photos:credits`, and label cuisine reference images. Do not call all photographs copyright-free or imply stock images show actual BitesBro servings.
- Serve fonts, scripts, images, and styles locally. Update CSP deliberately if an authorised integration truly needs another origin.
- GitHub Pages supports a separate browser-only three-role demo: build with `npm run build:pages`, retain the sample catalogue fallback, and keep real server forms disabled without an API. Demo Checkout is explicitly fictional. Test nested role pages and the repository subpath.
- `public/shared/demo-model.js` owns fictional order/menu state and calculations; `demo-store.js` adds versioned local storage, optional Web Locks and same-origin tab updates. No contact/address/payment data belongs in that store. Keep demo role switching separate from authentication; no public staff APIs are authorised.
- Keep every visible control useful. Connected forms must call real APIs; browser-demo forms use only the fictional adapter. Surface validation/network/storage failures, prevent double clicks, and honestly describe what was saved.
- Preserve semantic HTML, native dialog focus handling, labels, keyboard navigation, live status messages, and reduced-motion styles.
- Keep content readable without reveal animations. The HTML is visible without JavaScript; `.motion-ready` activates progressive enhancements.
- Avoid dummy links, fake maps/ratings/contact details, or claiming emails/payments are connected. Address/email/phone are pending the user's details. Preserve clear demo status until live operations are intentionally configured.
- Bag storage holds only dish IDs, quantities and selected option IDs/spice. The separate demo namespace holds fictional order snapshots, demo menu/preferences and activity, never customer contact information or delivery addresses. Server-side totals must include validated portion/add-on prices and delivery fees.

## Verify changes

- `npm run check` and `npm test` for server or database work.
- `npm run test:browser` for UI, interaction, or full-stack workflow changes. Existing browser tests cover 320–1440px layouts and reduced motion.
- Keep tests meaningful: assert actual database effects and user-visible outcomes. Use an isolated temporary database; never exercise tests against real café/customer data.
- Preserve underlying failures and diagnose them. Do not replace functional checks with trivial passing checks.
- Check `git status --short` and report the change, validation, and any remaining integration gaps concisely.

## Environment

`DATABASE_PATH`, `SITE_URL`, `PORT`, `HOST`, `CAFE_TIMEZONE`, and `RATE_LIMIT_MAX` are documented in `.env.example`. No API key is needed for local SQLite. Keep platform proxy, credentials, and TLS verification intact if installing dependencies. Never print credentials or invent secret values. Services do not survive cloud snapshots; restart them and verify `/api/health` and `/api/menu` in each fresh task.
