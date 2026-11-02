# Architecture

BitesBro is a same-origin web application with no runtime npm dependencies. Node.js 24+ serves the frontend and JSON API; its built-in `node:sqlite` connects directly to a persistent SQLite file. This makes the development workflow reproducible without credentials or separate infrastructure.

```text
Cafe_Website/
├── AGENTS.md                 Agent-discovery entry point
├── agents.md                 Full development instructions
├── readme.md                 Run, test, configure, deploy
├── design_system.md          Visual and interaction system
├── .env.example              Non-secret runtime settings
├── package.json
├── package-lock.json
├── playwright.config.js      Isolated full-stack browser runner
├── docs/
│   ├── architecture.md
│   └── credits.md
├── public/                   Only directory exposed by HTTP
│   ├── index.html            Semantic page, forms, native dialogs
│   ├── styles.css            Tokens, responsive components, reduced motion
│   ├── app.js                API client, menu, bag, forms, enhancements
│   ├── robots.txt
│   ├── sitemap.xml
│   └── assets/
│       ├── favicon.svg
│       ├── icons.svg         Original SVG symbol library
│       ├── fonts/            Self-hosted WOFF2 + licenses
│       └── images/           Photos, original product illustrations, credits
├── server/
│   ├── index.js              Configuration, HTTP lifecycle, graceful shutdown
│   ├── app.js                Routing, security, validation, business operations
│   ├── cafe.js               Business facts, hours, booking-slot derivation
│   ├── database.js           SQLite connection, schema, first-run seed
│   ├── schema.sql            Tables, constraints, indexes, schema version
│   └── menu.js               Initial menu data
├── tests/
│   ├── api.test.js           HTTP + SQLite integration tests
│   └── browser.spec.js       Chromium user journeys + responsive checks
└── data/                     Generated and ignored; mount persistently
    └── bitesbro.sqlite       Plus SQLite WAL/SHM files during operation
```

## Request flow

```mermaid
flowchart LR
  Browser[Browser: HTML, CSS, JavaScript] -->|same-origin HTTP| Server[Node.js HTTP server]
  Server -->|public files only| Assets[Local assets]
  Server -->|validated JSON requests| Operations[Menu, bookings, orders, contact]
  Operations -->|parameterised SQL + transactions| SQLite[(Persistent SQLite)]
```

Static paths are resolved and checked against the public directory, including realpath checks so symlinks cannot escape it. The server injects the configured site origin into canonical/social metadata, `robots.txt`, and `sitemap.xml`. The single-page sitemap lists the canonical document once; fragment sections are not separate pages.

The browser loads the menu and café clock from the API. Category changes fetch stored menu rows; free-text search filters the returned category. The bag stores only product IDs and quantities in local storage. At checkout, the server rereads prices and availability rather than trusting client values.

## Data model

```mermaid
erDiagram
  MENU_ITEMS ||--o{ ORDER_ITEMS : references
  ORDERS ||--|{ ORDER_ITEMS : contains
  MENU_ITEMS {
    text id PK
    text name
    text category
    integer price
    integer available
  }
  ORDERS {
    integer id PK
    text reference UK
    text email
    text pickup_date
    text pickup_time
    integer total
    text status
  }
  ORDER_ITEMS {
    integer order_id FK
    text menu_item_id FK
    text name
    integer quantity
    integer unit_price
  }
  RESERVATIONS {
    integer id PK
    text reference UK
    text email
    text date
    text time
    integer guests
  }
  SUBSCRIBERS {
    integer id PK
    text email UK
    integer consent
  }
  MESSAGES {
    integer id PK
    text reference UK
    text email
    text subject
    text message
  }
```

Customer names, phones, consent, notes and creation timestamps are also recorded where appropriate; see `schema.sql` for the authoritative fields. Newsletter addresses are normalised and deduplicated. Reservation email/date/time is unique. Order items retain the name and price at the time of the request. Money is stored in integer paise, never floating point.

## Consistency and operations

- SQLite opens with foreign keys, WAL mode, and a busy timeout. The initial schema is idempotent and seeds only an empty menu table. Version 1 is recorded; future structural changes need explicit forward migrations.
- A booking validates a real calendar date against the café's timezone, a future published slot, guest count, contact details, and consent. `BEGIN IMMEDIATE` wraps the capacity check and insert. Capacity is per non-overlapping 90-minute sitting; the afternoon closure is excluded.
- Pickup validates IDs, item availability, bounded integer quantities and the pickup slot, then calculates the total from stored prices. Order and line inserts commit atomically. No money moves through this application.
- The server accepts JSON objects only, enforces a 16KB body limit, checks request origin, and rate-limits anonymous writes by direct client IP. It trusts no forwarded headers by default. CSP restricts resources to the same origin; framing is denied.
- References are cryptographically random. No public GET endpoint returns orders, reservations, messages, or subscriber lists. A future staff interface requires authentication and explicit authorisation.
- `SIGINT`/`SIGTERM` drain requests and close SQLite. A health request executes a real database query rather than returning a static “up.”

## Boundaries

This implementation is appropriate for a single Node.js instance and persistent local disk. It is not a horizontally distributed database design. Rate-limit state is process-local and resets on restart. Deploy HTTPS at a reverse proxy, put client-IP abuse controls there, and back up the database through a SQLite-aware backup operation.

Email sending, online payments, real map directions, staff authentication, cancellation flows, and automated request fulfilment are not integrated. Current forms save demo requests and disclose that status. Do not expose SQL files or customer data to add an admin convenience endpoint. Address, contact details, actual menu, and retention/fulfilment rules remain business inputs before a live launch.
