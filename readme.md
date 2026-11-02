# BitesBro

**Good bites. Better days.** A complete café website for BitesBro in Bangalore: an original responsive interface, self-hosted typography and artwork, a Node.js HTTP server, and a persistent SQLite database.

Opening hours: **10am–3pm and 6pm–11pm**, currently assumed daily. The street address, phone, and email are intentionally left as “coming soon.” The menu and prices are sample content that you can replace.

## Run it

Requires **Node.js 24 or newer**. No database server, paid service, API key, bundler, or frontend framework is required.

```sh
cd /workspace/Cafe_Website
npm ci
npm run dev
```

The HTTP server listens on port `3000`. `npm start` starts it without Node’s file watcher. The first start creates `data/bitesbro.sqlite`, applies the schema, and seeds eight menu items. Later starts keep existing data. Refresh the browser after changing frontend files; server files restart automatically in development.

For local settings, copy `.env.example` to `.env` and edit the non-secret values you need. The application runs with sensible defaults without this file. `.env`, database files, and test artifacts are ignored by Git.

## What works

- Database-backed menu, category filtering, search, dietary information, and real loading/error/empty states.
- A persistent bag, quantity adjustments, and pickup requests stored with item and price snapshots. The server calculates prices from SQLite, ignoring client totals.
- Reservations with live availability, capacity checks inside a database transaction, duplicate prevention, and a 60-day booking window.
- Opening-hour-aware, non-overlapping 90-minute sittings: 10am, 11:30am, 1pm, 6pm, 7:30pm, and 9pm. Last sittings finish before closing. The temporary capacity is 24 people per sitting, with 1–8 guests per request.
- Contact messages and case-normalised newsletter subscriptions saved to SQLite, with consent and submission feedback.
- Native accessible dialogs, mobile navigation, keyboard controls, reduced-motion support, and local font/image assets.
- A canonical URL, social metadata, favicon, `robots.txt`, and `sitemap.xml`. The server inserts `SITE_URL` into SEO files.

**Orders, bookings, messages, and subscriptions really persist.** Online payment and email delivery are not connected. Forms clearly identify demo requests and do not claim to send confirmation emails or confirm visits to an unannounced street address. No public endpoint exposes customer records. There is no admin dashboard or authentication flow in this version.

## Update your café details

| Change | File |
| --- | --- |
| City, street address, email, phone, opening periods, sitting capacity | `server/cafe.js` |
| Seed menu, descriptions, integer prices in paise | `server/menu.js` |
| Existing menu records after first run | Update `menu_items` in SQLite with parameterised SQL; startup does not overwrite it |
| Page copy, images, social metadata | `public/index.html` |
| Colours, spacing, fonts, motion, responsive layouts | `public/styles.css` |
| Real deployment origin | `SITE_URL` in the environment |

The visit section reads contact details and hours from `/api/cafe`. Booking slots are derived from the same opening periods. Keep the initial HTML fallback and privacy copy consistent when changing business details. Update sample recipes/allergen information before taking real orders. Replacing photographs with your own café is recommended: the supporting photos are representative stock imagery and the branded hero is generated concept imagery, not photographs of the real café.

## Tests

```sh
npm run check          # JavaScript syntax
npm test               # 18 API/database integration tests
npm run test:browser   # 9 Chromium end-to-end tests
npm run test:all       # All of the above
```

Browser tests use the installed `/usr/bin/chromium` when available. On another machine, install Chromium with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a suitable browser executable. Playwright is a development dependency; the running application has no npm runtime dependencies.

The browser suite starts its own server on port `3100` with a fresh temporary database. It tests menu filtering, search, a persisted bag, the signature-drink feature, the mobile bag bar, server-priced checkout, real bookings, newsletter/contact submissions, focus restoration, reduced motion, and layouts from 320px to 1440px. Screenshots and failure traces go to ignored `test-results/`. API tests use isolated in-memory and temporary on-disk databases. No test writes to the development café database.

## API

All writes require JSON and `consent: true`. Money is returned as integer paise. Errors return `{ "error": "…", "fields": { "field": "…" } }` where relevant.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Prove server and database connectivity |
| GET | `/api/cafe` | Business details, local café date/time, hours and booking slots |
| GET | `/api/menu?category=coffee` | Available menu items; categories: `all`, `coffee`, `matcha`, `bakes`, `bites` |
| GET | `/api/availability?date=YYYY-MM-DD` | Remaining reservation seats and future times |
| POST | `/api/reservations` | Name, email, phone, date, time, integer guests, optional notes, consent |
| POST | `/api/orders` | Name, email, phone, date, time, `items: [{id, quantity}]`, consent |
| POST | `/api/newsletter` | Email and consent; duplicate addresses are handled without disclosure |
| POST | `/api/contact` | Name, email, subject, message and consent |

Personal data is intentionally not readable through public GET routes. For authorised local inspection, connect a SQLite client to the configured `DATABASE_PATH`. Avoid copying personal data into logs, Git, or screenshots.

## Deploy

The repository includes a **Render Blueprint** with persistent SQLite storage, a production **Dockerfile**, and **Compose** configuration. Follow the [deployment guide](docs/deployment.md) for account setup, launch, custom domains, and validation. The Render Starter service and disk are paid; review the displayed price before applying the Blueprint.

Run `npm ci --omit=dev` and `npm start` on a Node.js 24+ host with a **persistent writable volume**. Set `DATABASE_PATH` to a path on that volume and `SITE_URL` to the real HTTPS origin. A reverse proxy or managed hosting service should terminate HTTPS. Port `3000` is the default; `HOST` and `PORT` are configurable.

Use a single application instance with this SQLite setup. Ephemeral serverless filesystems do not preserve the database. The in-process limiter does not trust forwarded IP headers: behind a reverse proxy, set per-client limits at the proxy and tune `RATE_LIMIT_MAX` for the shared upstream IP. Database operations are parameterised, writes are transactional, JSON bodies are limited to 16KB, foreign-origin submissions are rejected, and security headers limit resources to this origin.

Before switching from demo requests to live café operations, provide the remaining business details and real menu, define request fulfilment and data retention, and replace the demo copy. Email, payments, an authenticated staff dashboard, and external maps are explicit future integrations; no credentials or pretend connections have been added.

Back up SQLite using its backup API or SQLite’s `.backup` command. Do not copy only the main `.sqlite` file during WAL writes. Never remove `data/` to refresh a real menu.

## Project guide

- [Architecture and database model](docs/architecture.md)
- [Design system](design_system.md)
- [Agent instructions](agents.md) (also discovered through `AGENTS.md`)
- [Asset credits](docs/credits.md)

There is no production build step: the server serves the committed frontend directly. Publish the prepared cloud environment through environment settings to retain its filesystem; running server processes must be started again in a new task.
