# BitesBro — Good food. Great moods.

A food-ordering website for **BitesBro, Bangalore**. South Indian dishes lead the menu, with North Indian, biryani, Indo-Chinese, pizza/burgers/pasta, street bites, desserts and drinks. Both vegetarian and non-vegetarian dishes are included, with plant-based options too.

The sample catalogue has **50 dishes across eight categories, including 16 South Indian choices**. Opening hours supplied by the owner are **10am–3pm and 6pm–11pm**, assumed daily. Street address, business contact details, actual recipes and final prices remain editable inputs.

## Run

Requires **Node.js 24+**. The server uses Node's built-in HTTP and SQLite modules; there are no npm runtime dependencies or required API keys.

```sh
npm ci
npm run dev
```

Run these commands from `/workspace/Cafe_Website` in this cloud workspace, or from the cloned repository root on another machine. The server listens on port 3000 by default. `npm start` runs without the file watcher. Copy `.env.example` to an ignored `.env` file to override `PORT`, `HOST`, `SITE_URL`, `DATABASE_PATH`, `CAFE_TIMEZONE`, or `RATE_LIMIT_MAX`.

## Three-role browser demonstration

The existing customer website now connects to a **fictional Kitchen Display System and Administrator dashboard** without backend hosting:

- Customer demo: `/?demo=1` — the full menu, existing customiser/bag, separate Demo Checkout and tracking.
- Kitchen: `/kitchen/` — incoming/preparing/ready tickets, allowed preparation actions, history and menu availability.
- Administrator: `/admin/` — overview, orders, demo menu editing/add/archive, simulated reports, kitchen preferences and reset.
- Tracking: `/orders/` — fictional history, option/price snapshots and the Received → Preparing → Ready → Collected timeline.

Use **Explore BitesBro Demo** to switch roles. Changes sync between tabs in the same browser/origin; they do not sync across devices. All operational data is fictional and labelled **Demo Mode — No real orders or payments.** The role selector is not staff authentication.

The separate `bitesbro.demo.v1` store contains only fictional tickets, demo menu edits and preferences. Checkout uses a fixed Demo guest and preset preparation notes; it never copies names, contact details, addresses or payment information from connected forms. Menu edits never modify SQLite. New tickets use the current demonstration prices in integer paise, while historical tickets retain snapshots.

Opening `./` without `?demo=1` preserves the existing connected Node.js customer flow. In explicit browser-demo mode, server-write forms are disabled. [Workflow, architecture, security boundaries and future authenticated backend](docs/three-role-demo.md).

## Food ordering

- South Indian: masala/Mysore/ghee/rava/set/cheese dosas, podi idli, idli sambar, medu vada, pongal, uttapam, appam and stew, puttu and kadala, bisi bele bath, thali and Chettinad chicken dosa.
- Other cuisines: curries and naan, four biryanis, Indo-Chinese favourites, pizza, burgers, pasta, street snacks, Indian desserts and drinks. Original café products retain their IDs for previous orders and saved bags.
- Filter by cuisine or vegetarian/non-vegetarian/plant-based preferences; search names, descriptions and ingredients; sort by price; load more dishes as needed.
- Each dish shows its sample portion, preparation estimate, spice preference, ingredients, allergens, available portions and add-ons. Customise dishes before adding them.
- The bag preserves dish IDs, quantities and option IDs in local storage; it does not store contact details. Different customisations of the same dish remain separate lines.
- Pickup and demo delivery use half-hour slots during the supplied opening periods, with at least 30 minutes' lead time for same-day orders. Table reservations retain separate 90-minute sittings and capacity checks.
- Delivery requests require an address and Bangalore `560xxx` postcode. The editable sample delivery fee is ₹40, waived at a food subtotal of ₹499 or more.
- The server recalculates dish prices, portion surcharges, add-ons and delivery fees from authoritative data. Prices are integer paise. Client-supplied totals are ignored.
- Orders and option/price snapshots, contact messages, newsletter subscriptions and reservations persist in SQLite. Public endpoints do not expose customer records.

**Requests really save when the Node server is connected.** Payment processing, email delivery and delivery dispatch are not integrated. Forms explicitly describe demo requests and do not claim a confirmed visit or fulfilment from an unannounced business address. Recipe labels are samples, not guarantees about allergen handling.

## Time-based recommendations and photographs

A dedicated section recommends breakfast/tiffins from **5am–noon**, biryani/rice meals/curries from **noon–4pm**, evening snacks from **4pm–7pm**, and dinner from **7pm–11pm**, all in **Bangalore time (Asia/Kolkata)**. From 11pm–5am it shows next-visit breakfast inspiration with a closed-kitchen message. The actual hours remain 10am–3pm and 6pm–11pm; recommendations never open the kitchen or hide the full menu.

The connected site uses the server's clock and advances it in the browser. GitHub Pages uses the device's current instant formatted in Bangalore time. Picks refresh each minute and when a tab returns to view, respect the diet filter, and open the same working customiser as the full menu. Curated IDs and meal boundaries live in `public/recommendations.js`; unavailable dishes are omitted.

The hero, story, menu, customiser, bag and recommendations use **40 locally served real photographs** with per-file free-use licences and source credits. These include CC0/public domain, CC BY/CC BY-SA, Unsplash and Pexels licences; they are not all public-domain images. Required attribution is visible at `photo-credits.html`, linked from the menu and footer. Some dishes use a clearly labelled cuisine reference photo. Photographs illustrate serving styles, not verified BitesBro recipes or portions.

`public/photo-credits.json` records every author/source/licence, a pinned mirror revision, transformations, SHA-256 and dish mapping. Run `npm run photos:credits` to regenerate the credit page after editing this manifest. Keep photo licences and attribution with the files. The Pages build does this automatically. No image CDN, new runtime key or external browser request is needed.

## Existing database upgrade

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

## GitHub Pages and full-stack hosting

GitHub Pages runs the complete three-role **browser demonstration**, sample menu, customiser and bag. It **cannot run Node.js or SQLite**. Connected server forms stay disabled when no API is available. The explicitly separate Demo Checkout stores only fictional orders in this browser and connects the customer, kitchen and administrator views. It never claims to save a real restaurant order.

```sh
npm run menu:export    # Export only the sample catalogue, using an in-memory DB
npm run build:pages   # Build _site/ with correct repository paths and SEO URLs
```

`.github/workflows/deploy.yml` builds this food frontend on pushes to `main` and deploys it to GitHub Pages. Root, nested-page and repository-subpath asset handling is tested, including directly opening and refreshing role pages. `public/menu.json` contains sample menu data only, never customer records or production database contents.

To accept database-backed requests, deploy the **whole application** to a Node.js host with a persistent disk using the provided Render Blueprint or Docker configuration. Set `SITE_URL` to the real HTTPS origin and `DATABASE_PATH` to the persistent mount. See [deployment instructions](docs/deployment.md). Render's Starter service and disk are paid resources; applying a Blueprint requires a hosting account and review of its price.

## Verification

```sh
npm run check
npm test               # 47 API/database, photo, recommendation and shared demo-model tests
npm run build:pages
npm run test:browser   # 21 Chromium journeys, including three-role workflows on the Pages build
```

Browser tests use `/usr/bin/chromium`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, or a Playwright-installed Chromium. They run against a separate temporary database on port 3100. API tests use in-memory and temporary files. Screenshots/traces go to ignored `test-results/`. Tests do not submit customer data to the development or production database.

## API

All writes require JSON and explicit `consent: true`; validation failures return an `error` and optional field-specific errors.

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

Use a single Node instance with persistent local disk. Terminate HTTPS at the hosting provider/reverse proxy; configure per-client abuse limits there because the application does not trust forwarded IP headers. Keep SQLite-aware backups and never delete `data/` to refresh a menu. Email, payments, authenticated staff tools, request fulfilment and a final privacy/retention policy remain explicit live-service integrations.
