# Working on BitesBro

## Start here

- Read `readme.md`, `docs/architecture.md`, and `design_system.md` before changing the relevant layer.
- Work in the existing checkout. Cloud tasks are already isolated; do not create a Git worktree unless the user asks for one.
- Require Node.js 24+. Use `npm ci` with the committed lockfile. `npm run dev` starts the site and creates an ignored SQLite database on first run.
- Preserve unrelated user changes and existing data. Do not commit `.env`, databases, logs, customer details, or test artifacts.

## Architecture

- `public/` is the only web-served directory. Keep server code, database files, and secrets outside it.
- `server/cafe.js` owns business details and opening periods. `/api/cafe` drives visit details and the booking clock. The user supplied **BitesBro, Bangalore, 10am–3pm and 6pm–11pm**. Daily opening, sample menu/prices, and capacity remain editable assumptions.
- `server/menu.js` supplies the first-run seed. Never drop or reseed an existing database merely to update the menu; use parameterised database updates or a versioned migration.
- `server/schema.sql` applies idempotently and records schema version 1. Add forward migrations when changing an existing schema; `CREATE TABLE IF NOT EXISTS` alone cannot modify tables.
- Store money as integer paise. Recompute totals from database prices on the server, and preserve order-line price/name snapshots.
- Keep capacity checks and inserts in one transaction. Booking sittings must not overlap or span the afternoon closure.
- Use the café timezone for booking dates, not the visitor's or server's local timezone.
- Public APIs accept writes but do not expose customer records. Add authentication and authorisation before introducing staff endpoints.
- Validate request shape, types, length, dates, availability, and consent on the server. Preserve SQL parameterisation, body limits, same-origin checks, rate limits, and security headers.

## Interface

- Maintain the ivory/forest/terracotta palette, Fraunces + DM Sans pairing, photographic collage, and custom menu artwork.
- Serve fonts, scripts, images, and styles locally. Update CSP deliberately if an authorised integration truly needs another origin.
- Keep every visible control useful. Forms must call real APIs, surface validation/network failures, prevent double clicks, and honestly describe what was saved.
- Preserve semantic HTML, native dialog focus handling, labels, keyboard navigation, live status messages, and reduced-motion styles.
- Keep content readable without reveal animations. The HTML is visible without JavaScript; `.motion-ready` activates progressive enhancements.
- Avoid dummy links, fake maps/ratings/contact details, or claiming emails/payments are connected. Address/email/phone are pending the user's details. Preserve clear demo status until live operations are intentionally configured.
- `localStorage` holds only bag IDs and quantities, never contact information.

## Verify changes

- `npm run check` and `npm test` for server or database work.
- `npm run test:browser` for UI, interaction, or full-stack workflow changes. Existing browser tests cover 320–1440px layouts and reduced motion.
- Keep tests meaningful: assert actual database effects and user-visible outcomes. Use an isolated temporary database; never exercise tests against real café/customer data.
- Preserve underlying failures and diagnose them. Do not replace functional checks with trivial passing checks.
- Check `git status --short` and report the change, validation, and any remaining integration gaps concisely.

## Environment

`DATABASE_PATH`, `SITE_URL`, `PORT`, `HOST`, `CAFE_TIMEZONE`, and `RATE_LIMIT_MAX` are documented in `.env.example`. No API key is needed for local SQLite. Keep platform proxy, credentials, and TLS verification intact if installing dependencies. Never print credentials or invent secret values. Services do not survive cloud snapshots; restart them and verify `/api/health` and `/api/menu` in each fresh task.
