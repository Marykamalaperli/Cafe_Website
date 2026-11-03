# BitesBro — Good food. Great moods.

A food-ordering website for **BitesBro, Bangalore**. South Indian dishes lead the menu, with North Indian, biryani, Indo-Chinese, pizza/burgers/pasta, street bites, desserts and drinks. Both vegetarian and non-vegetarian dishes are included, with plant-based options too.

The sample catalogue has **50 dishes across eight categories, including 16 South Indian choices**. Opening hours supplied by the owner are **10am–3pm and 6pm–11pm**, assumed daily. Street address, business contact details, actual recipes and final prices remain editable inputs.

## Run

Requires **Node.js 24+**. With the configured public Supabase environment variables, the app uses Supabase Auth, Postgres and Storage. Without them, the Node server retains its local SQLite preview.

```sh
npm ci
npm run dev
```

Run these commands from `/workspace/Cafe_Website` in this cloud workspace, or from the cloned repository root on another machine. The server listens on port 3000 by default. `npm start` runs without the file watcher. Copy `.env.example` to an ignored `.env` file to override `PORT`, `HOST`, `SITE_URL`, `DATABASE_PATH`, `CAFE_TIMEZONE`, or `RATE_LIMIT_MAX`.

## Supabase authentication, database and Storage

Email/password signup, confirmation, sign-in, recovery and sign-out are implemented with the official Supabase SDK. Customers use the customer site and their own order history; chefs use the Kitchen Display; administrators manage operations and can also open the kitchen. Postgres roles, RLS and transactional functions enforce these permissions, including calls made outside the UI.

**The owner chose to run SQL manually. Cloud migration and photo upload are pending until these steps are completed:**

1. Run [supabase/setup.sql](supabase/setup.sql) in **Bites_Bro_Website → SQL Editor**. It creates the protected tables, functions, 50-dish catalogue, photo credits and `menu-images` bucket.
2. Configure Supabase email authentication and the website's `/auth/` callback URL.
3. Create and confirm **admin@bitesbro.com**, then run [supabase/bootstrap-admin.sql](supabase/bootstrap-admin.sql). Choose the password in Auth, never in SQL or Git.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to ignored `.env.local` locally, and to GitHub Actions **Variables or Secrets** for Pages builds.
5. Sign in as administrator → **Settings → Upload menu photographs**. All 40 licensed images upload to **Storage → menu-images → Files → files/** and become the menu's image URLs. Use **Staff access** to assign confirmed chef accounts.
6. Run `npm run supabase:verify` for read-only Cloud readiness checks.

[Complete Supabase instructions, table fields, role matrix and verification](docs/supabase.md).

The SDK is served locally. Generated browser configuration intentionally includes only the public project URL/publishable key. Secret/service-role keys are rejected, `.env.local` stays ignored, and no management token is required. Start/dev/build commands load `.env.local`. A failed Cloud request never saves to SQLite or the fictional browser store.

## Local three-role demonstration

The earlier fictional customer/kitchen/admin workflow remains available only when **Supabase is unconfigured** and `APP_DEMO_MODE=true` is explicitly enabled. It is disabled in Supabase mode, including when `?demo=1` is supplied. The preview stores only fictional orders in `bitesbro.demo.v1`; it never contains real customer contact or delivery details. Production staff pages require sign-in.

## Food ordering

- South Indian: masala/Mysore/ghee/rava/set/cheese dosas, podi idli, idli sambar, medu vada, pongal, uttapam, appam and stew, puttu and kadala, bisi bele bath, thali and Chettinad chicken dosa.
- Other cuisines: curries and naan, four biryanis, Indo-Chinese favourites, pizza, burgers, pasta, street snacks, Indian desserts and drinks. Original café products retain their IDs for previous orders and saved bags.
- Filter by cuisine or vegetarian/non-vegetarian/plant-based preferences; search names, descriptions and ingredients; sort by price; load more dishes as needed.
- Each dish shows its sample portion, preparation estimate, spice preference, ingredients, allergens, available portions and add-ons. Customise dishes before adding them.
- The bag preserves dish IDs, quantities and option IDs in local storage; it does not store contact details. Different customisations of the same dish remain separate lines.
- Pickup and demo delivery use half-hour slots during the supplied opening periods, with at least 30 minutes' lead time for same-day orders. Table reservations retain separate 90-minute sittings and capacity checks.
- Delivery requests require an address and Bangalore `560xxx` postcode. The editable sample delivery fee is ₹40, waived at a food subtotal of ₹499 or more.
- The server recalculates dish prices, portion surcharges, add-ons and delivery fees from authoritative data. Prices are integer paise. Client-supplied totals are ignored.
- Orders and option/price snapshots, contact messages, newsletter subscriptions and reservations persist in Supabase when configured. SQLite remains the local unconfigured preview. Public endpoints do not expose customer records.

**Requests save in Supabase after setup, or in SQLite in the local preview.** Payment processing, email delivery and delivery dispatch are not integrated. Forms explicitly describe demo requests and do not claim a confirmed visit or fulfilment from an unannounced business address. Recipe labels are samples, not guarantees about allergen handling.

## Time-based recommendations and photographs

A dedicated section recommends breakfast/tiffins from **5am–noon**, biryani/rice meals/curries from **noon–4pm**, evening snacks from **4pm–7pm**, and dinner from **7pm–11pm**, all in **Bangalore time (Asia/Kolkata)**. From 11pm–5am it shows next-visit breakfast inspiration with a closed-kitchen message. The actual hours remain 10am–3pm and 6pm–11pm; recommendations never open the kitchen or hide the full menu.

The connected site uses the server's clock and advances it in the browser. GitHub Pages uses the device's current instant formatted in Bangalore time. Picks refresh each minute and when a tab returns to view, respect the diet filter, and open the same working customiser as the full menu. Curated IDs and meal boundaries live in `public/recommendations.js`; unavailable dishes are omitted.

The hero, story, menu, customiser, bag and recommendations use **40 locally served real photographs** with per-file free-use licences and source credits. These include CC0/public domain, CC BY/CC BY-SA, Unsplash and Pexels licences; they are not all public-domain images. Required attribution is visible at `photo-credits.html`, linked from the menu and footer. Some dishes use a clearly labelled cuisine reference photo. Photographs illustrate serving styles, not verified BitesBro recipes or portions.

`public/photo-credits.json` records every author/source/licence, a pinned mirror revision, transformations, SHA-256 and dish mapping. Run `npm run photos:credits` to regenerate the credit page after editing this manifest. Keep photo licences and attribution with the files. The Pages build does this automatically. No image CDN, new runtime key or external browser request is needed.

## Existing SQLite database upgrade

This section applies only to the local SQLite fallback. Supabase uses the separate SQL migrations above; the old file is retained and is never reset.

Startup applies the original version-1 baseline followed by `server/migrations/002_food_ordering.sql` and the version-3 photograph update in `server/menu-photos.js`. For an existing file, it first creates a consistent, uniquely named `.pre-food-v2-….bak` SQLite backup beside the database using `VACUUM INTO`, including committed WAL data.

The migration preserves existing menu IDs, edited names/descriptions/prices, availability, customer records, reservations and order-line history. Legacy categories are mapped to the food menu. New dishes are inserted once; later starts preserve owner edits and do not duplicate the catalogue. Foreign-key checks run before committing, and a failure rolls the transaction back. The version-3 update changes only bundled illustration paths, preserving custom owner-uploaded paths, prices, availability, recipe edits and customer/order history. Existing version-2 databases get a consistent `.pre-photos-v3-….bak` backup before the atomic update; a version-1 upgrade reuses its complete pre-food backup. Repeated starts make no further photo changes or backups. Ensure the persistent volume has space for the backup and retain backups outside Git.

## Edit the business and menu

| Change | Source |
| --- | --- |
| City, address, email, phone, opening periods, capacity and delivery fees | `server/cafe.js` |
| New sample dishes, recipes, dietary labels, options and prices | `server/food-menu.js` |
| Original eight products, retained for the version-1 baseline | `server/menu.js` |
| Existing production menu edits after upgrade | Parameterised SQLite updates or a new forward migration |
| Page content and food-led layout | `public/index.html`, `public/styles.css` |
| Active self-hosted food photographs and licences | `public/assets/images/photos/`, `public/photo-credits.json` |
| Time-of-day suggestions and meal boundaries | `public/recommendations.js` |
| Regenerate illustration sources (optional Python stdlib utility) | `scripts/generate-food-art.py` |

Changing seed data does not overwrite existing production menu records. For live menu changes, update the database or add a versioned migration, then refresh the exported sample catalogue when appropriate.

## GitHub Pages and Node hosting

GitHub Pages serves the frontend; **Supabase provides authentication, database functions and file storage**, so authenticated ordering and staff dashboards can work on Pages without a Node host. Add the two public build variables described above before deploying. `.github/workflows/deploy.yml` installs dependencies, builds `_site/` with repository paths and deploys on pushes to `main`. It does not apply database migrations.

```sh
npm run menu:export    # Export only the sample catalogue, never customer records
npm run build:pages   # Includes local SDK and generated public Supabase configuration
```

When Supabase is unavailable, the sample catalogue remains browsable and forms are disabled. Staff pages fail closed. A Node host is optional; when configured it forwards authenticated operations to Supabase and does not write SQLite. Native Node hosting without Supabase retains the earlier local SQLite preview. [Deployment details](docs/deployment.md).

## Verification

```sh
npm run check
npm test               # API, PostgreSQL/RLS, model, photo, recommendation and configuration tests
npm run build:pages
npm run test:browser   # Chromium journeys, including Supabase Auth/Storage and legacy local previews
```

Browser tests use `/usr/bin/chromium`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, or a Playwright-installed Chromium. They run against a separate temporary database on port 3100. API tests use in-memory and temporary files. Screenshots/traces go to ignored `test-results/`. Tests do not submit customer data to the development or production database.

## API

In Supabase mode, writes also require a valid customer Bearer session and orders require a `requestId` UUID. All writes require JSON and explicit `consent: true`; validation failures return an `error` and optional field-specific errors.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server and actual SQLite connectivity |
| GET | `/api/cafe` | Business settings, authoritative server time, opening periods, local café clock, slots and fees |
| GET | `/api/menu?category=south-indian&diet=veg&q=dosa` | Available dishes, categories and food metadata |
| GET | `/api/fulfilment?date=YYYY-MM-DD` | Valid future half-hour pickup/dispatch slots |
| GET | `/api/availability?date=YYYY-MM-DD` | Reservation capacity for 90-minute sittings |
| POST | `/api/orders` | Contact/date/time, fulfilment, address/postcode if delivery, instructions, consent and item selections |
| POST | `/api/reservations` | Dine-in request with contact, date/time, guests and optional notes |
| POST | `/api/contact` | Contact message |
| POST | `/api/newsletter` | Deduplicated email subscription |

An order line is `{ "id": "masala-dosa", "quantity": 2, "variant": "ghee-roast", "spice": "mild", "addons": ["extra-sambar"] }`. Defaults remain compatible with older `{id, quantity}` orders. Invalid portions/spice/add-ons, identical duplicate lines, unavailable dishes and excessive quantities are rejected atomically. The response includes the reference, authoritative food subtotal, delivery fee and total.

## Project documentation

[Three-role demonstration](docs/three-role-demo.md) · [Implementation report](docs/redesign-report.md) · [Architecture](docs/architecture.md) · [Design system](design_system.md) · [Agent instructions](agents.md) · [Credits](docs/credits.md) · [Deployment](docs/deployment.md)

For the unconfigured SQLite preview, use a single Node instance with persistent local disk. Terminate HTTPS at the hosting provider/reverse proxy; configure per-client abuse limits there because the application does not trust forwarded IP headers. Keep SQLite-aware backups and never delete `data/` to refresh a menu. Email notifications, payments, request fulfilment and a final privacy/retention policy remain explicit live-service integrations. Supabase authentication, staff roles and Storage are implemented; apply the supplied SQL and deployment settings to activate them.
