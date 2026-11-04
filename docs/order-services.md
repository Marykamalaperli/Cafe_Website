# Payments, order emails and delivery

This extension is on the separate `preview/youpi-demo` review branch. Publishing the review adds only an isolated sandbox under `/review/`; the main site is built from `main`. These migrations and server functions are not applied to Supabase Cloud by that workflow. Local checks use isolated PostgreSQL and simulated services. They do not prove a real payment, inbox delivery, courier booking, or production customer-to-kitchen flow.

## YouPI checkout

The selected gateway is [youpi-pg/YouPI-PG](https://github.com/youpi-pg/YouPI-PG), reviewed at revision `405327c27d78ae9d0dccdb1e2d2426cefc359477`. BitesBro uses an original REST adapter for its `MANUAL_UPI` contract. The upstream README describes it as experimental. Its package manifest declares a commercial licence, but that revision contains no `LICENSE` file; no upstream application code, SDK or APK is copied into this project. Confirm its terms with the maintainer before hosting or redistributing it.

The Supabase function creates checkout from the saved order's integer-paise total. Merchant credentials remain server-side. Checkout URLs must match the configured HTTPS checkout origin and path. The browser opens the hosted portal in another tab; YouPI handles its own checkout authentication. BitesBro's customer/chef/admin authentication remains with Supabase.

YouPI signs webhook bodies with HMAC-SHA256. The adapter checks the raw-body signature, signed timestamp and delivery UUID; SQL deduplicates deliveries and matches the exact order, payment ID, amount and currency. All gateway outcomes, including `SUCCESS`, `OBSERVED_SUCCESS` and `RECONCILED`, leave this manual payment unapproved. A valid customer reference is a **claim**, not proof that money arrived.

In **Administrator → Settings → Bank receipts awaiting review**, check the credit, exact amount and 12-digit reference in the receiving bank account before selecting **Confirm bank receipt**. Only that protected administrator RPC marks the payment paid and releases the chef ticket. A confirmed reference cannot pay two orders. Customers and chefs cannot approve payments. Refunds for direct/YouPI UPI are completed through the bank and recorded by the administrator; there is no automatic YouPI refund API here. Reconcile late payments against cancelled/expired orders manually; never ask someone to pay again solely because a webhook or browser callback was delayed.

GitHub Pages can host the storefront. It cannot run the YouPI payment server, observers or a persistent gateway database. Hosting YouPI, configuring its merchant/receiving account and webhook, and independently verifying bank receipts remain necessary for real use. The review simulator never contacts banks or installs observers.

## Apply the forward migrations manually

For the existing BitesBro project that already ran `setup.sql`, run these complete files in **Supabase → SQL Editor**, in this order:

1. [003_order_services.sql](../supabase/migrations/003_order_services.sql)
2. [004_courier_dispatch.sql](../supabase/migrations/004_courier_dispatch.sql)
3. [005_youpi_checkout.sql](../supabase/migrations/005_youpi_checkout.sql)

These add payment records, a leased email/refund queue, delivery assignments/events, courier quotes/bookings, and YouPI sessions/webhook events. Existing users, orders, menu edits and photographs are retained. Public clients cannot execute service-only payment, mail or courier RPCs. RLS remains enabled. For a brand-new project, run the baseline `setup.sql` first and then these forward migrations. Once upgraded, do not rerun the old baseline; it deliberately refuses to downgrade the protected functions.

Check versions read-only:

```sql
select public.bitesbro_health();
select version from public.bitesbro_schema_migrations order by version;
```

Version 5 is expected after the three new files. No Actions workflow applies SQL automatically.

## Configure the Supabase server function

Deploy `supabase/functions/order-services` using the Supabase CLI or dashboard tooling. Example CLI command from the repository:

```sh
supabase functions deploy order-services --project-ref YOUR_PROJECT_REF
```

`supabase/config.toml` disables the platform JWT precheck so gateway webhooks can arrive. The handler independently verifies customer/admin JWTs against Auth and protected database roles; scheduled jobs use a separate worker secret. Webhooks require the appropriate raw-body HMAC.

Store these in **Supabase Edge Functions → Secrets**, never GitHub Pages variables, `VITE_*`, committed files, or chat:

| Setting | Purpose |
| --- | --- |
| `SITE_URL` | Full storefront URL ending in `/`, including `/Cafe_Website/` |
| `ALLOWED_ORIGINS` | Exact browser origins, comma separated; default is the Site URL origin |
| `YOUPI_API_URL` | HTTPS base of the running YouPI API |
| `YOUPI_CHECKOUT_URL` | HTTPS base of its checkout portal |
| `YOUPI_MERCHANT_ID` | Merchant ID from that gateway |
| `YOUPI_MERCHANT_API_KEY` | Separate server-side merchant API key |
| `YOUPI_WEBHOOK_SECRET` | Merchant webhook signing secret |
| `RESEND_API_KEY` | Order-email provider credential |
| `ORDER_EMAIL_FROM` | Sender on a domain verified with Resend |
| `ORDER_JOB_SECRET` | Separate random secret for a scheduled job runner |

Supabase supplies its server URL, service-role key and anon key to the Edge runtime. The service-role key stays in the function. The frontend continues to use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

On YouPI, configure the merchant webhook URL as:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/order-services/youpi/webhook
```

Set YouPI's `YOUPI_ALLOWED_RETURN_ORIGINS` and `YOUPI_ALLOWED_ORIGINS` to the exact storefront origin (for this Pages site, `https://marykamalaperli.github.io`). Configure receiving-account details there. In BitesBro **Administrator → Settings → BitesBro Pay**, set the matching merchant UPI ID/payee. Until real merchant details are supplied, the review uses an invalid, clearly labelled demo handle and produces no payment QR or app launch.

YouPI appears automatically when its service settings are complete. A status check can report a gateway outcome; it cannot approve payment. Cash remains available. Direct UPI with local QR generation is a fallback when YouPI is unconfigured. An optional Razorpay adapter is retained but is not selected in the YouPI review; it requires its own test/live keys, webhook secret and deliberate payment toggle.

If a webhook is delayed or a reference needs correction after rejection, the hosted-checkout dialog also offers **Already paid? Submit or correct a bank reference**. This authenticated owner-only fallback records a claim in BitesBro; it never marks the payment paid and never asks the customer to pay twice.

## Order-confirmation emails

An email job is inserted transactionally for a cash order or a verified online payment, and for cancellation/refund/dispatch/delivery events. Jobs use database leases, bounded retries and Resend idempotency keys. Older orders are backfilled without sending historical confirmation emails. A crashed or ambiguous job moves to review rather than resending indefinitely.

For the review, **Administrator → Settings → Process queued emails & refunds → Preview simulated emails** captures messages without sending mail. With live credentials, `submitted to email provider` means Resend accepted the request; it does not prove inbox delivery. Supabase Auth confirmation/recovery emails remain separate from order emails.

For automatic processing, schedule an HTTPS POST to `/functions/v1/order-services/jobs/run` with `{}` as JSON and `Authorization: Bearer <ORDER_JOB_SECRET>` from a trusted scheduler. Keep the secret in that scheduler's secure settings. No schedule is deployed by this change; until configured, an administrator must process the queue manually. The endpoint processes bounded batches and can be called repeatedly.

## Courier dispatch

The initial adapter is **Porter two-wheeler**, with a quote shown before booking. It is a provisional Bangalore option; current prices, merchant eligibility and live service quality have not been verified. No claim is made that it is always the cheapest provider. The protocol adapter still needs a real Porter UAT test against the merchant account; the passing tests use contract fixtures.

Set these server secrets/settings after obtaining API access:

```text
PORTER_API_KEY
COURIER_MODE=test
COURIER_PICKUP_NAME
COURIER_PICKUP_PHONE
COURIER_PICKUP_ADDRESS
COURIER_PICKUP_POSTCODE
COURIER_PICKUP_LAT
COURIER_PICKUP_LNG
MAX_COURIER_FARE_PAISE=20000
```

Test mode selects the Porter UAT host. Only `COURIER_MODE=live` selects its live host. The restaurant's actual pickup address, contact and coordinates are still needed. No fabricated pickup details are used for live bookings.

In **Administrator → Deliveries**, save the customer's Bangalore map pin, request a quote, and review the restaurant's cost. The customer's saved delivery fee is not increased. Quotes expire after five minutes and a changed pin invalidates them. Booking requires a ready, payment-eligible kitchen ticket, no other assigned rider, and a fresh fare check. Live booking is restricted to within 90 minutes of the requested pickup. An uncertain booking stays under review to prevent a duplicate charged booking. Reconcile it in the courier account before any manual recovery.

**Refresh courier status** checks the provider; no automatic courier polling/webhook is scheduled here. A separate manual-rider fallback is available only without a courier booking. The review has explicit **Simulate courier pickup/delivery** buttons; these do not book a real rider.

## Review and verification

```sh
npm run demo:review       # Internal Node review: isolated PostgreSQL, no Cloud reads/writes
npm run build:review      # Credential-free static sandbox suitable for /review/ on Pages
npm run preview:review    # Internal static verification server
npm run check
npm test
npm run build:pages
npm run test:browser
```

The static sandbox runs PGlite in a service worker scoped to `/Cafe_Website/review/`. Only the separate review build installs it; the production build does not. It simulates the documented YouPI REST/webhook contract, Resend acceptance and courier state; it is not a running YouPI installation. Three preset review accounts use the password shown on `review.html`; these credentials do not exist in production. Use fictional details. Review state stays in that browser's isolated IndexedDB and resets when its site data is cleared.

Tests exercise actual PostgreSQL migrations/RLS, authoritative prices, forged/changed/stale webhook rejection, delivery replay, manual bank approval, chef privacy, courier expiry/collision handling, and browser customer → admin → chef → courier → email-preview journeys. They do not establish real provider connectivity. Before live activation, apply the owner-run SQL, deploy the function, configure providers, and complete a separately authorised real Supabase/UAT test with confirmed customer, chef and administrator accounts.
