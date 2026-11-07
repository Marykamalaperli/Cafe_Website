# Order history and delivery tracking

Successful Supabase checkout redirects immediately to `/orders/?order=<reference>`. The explicit fictional browser demo does the same. A failed checkout keeps the bag and form available.

## Activate on the existing project

Guest checkout is already working on the owner's project. In **Supabase → SQL Editor**, run the complete [007_order_history_delivery.sql](../supabase/migrations/007_order_history_delivery.sql) once. It requires the existing baseline and migration 006; the separate payment-preview migrations 003–005 are not required. Do not rerun `setup.sql`, reset tables, or delete migration markers. This migration can safely be rerun and does not delete order records, change menu prices, or assign staff roles.

GitHub Pages deployment publishes the frontend only. It cannot apply SQL with the public browser key. Until 007 is applied, the frontend limits the visible history using the previous owner-scoped API; server-enforced guest history restrictions and manual delivery controls require 007. Existing order placement continues to work.

## Customer history

| Customer | Recent history | Earlier orders |
| --- | --- | --- |
| Guest / no signup | Latest three, newest first | Older active orders remain in **Still in progress** until finished. Older completed/cancelled orders are hidden from that guest, including direct references and REST reads. |
| Signed-in customer | Five per page, newest first | **Older orders**, **Newer orders**, and reference search retrieve all of that customer's saved orders. |

The owner chose to hide older guest history and retain staff records. No automatic deletion runs. Administrators retain the operational history; chefs retain preparation tickets without customer contact/address fields. Guest visibility is enforced using protected Auth identity and RLS, not email matching or a browser-only filter. Matching contact emails never share order history.

Guest tracking stays with the current browser's private Supabase session. Clearing site data, using another browser, or signing in to a different account removes access to that guest session; it does not erase staff records. Real orders are held in Supabase and memory, never copied into the fictional demo store. The fictional demo shows the same three-order window over its fictional customer tickets and retains its staff dataset.

## Fulfilment updates

- **Pickup:** Received → Preparing → Ready → Collected.
- **Delivery:** Received → Preparing → Ready → Out for delivery → Delivered.
- Customers can cancel their own received orders; existing administrator cancellation rules remain unchanged.
- Chefs mark food preparing/ready and pickup orders collected. For delivery orders, an administrator opens **Orders → View order**, then uses **Mark out for delivery** and, after actual arrival, **Mark delivered**. Those controls enforce sequence and cannot reopen a terminal delivery. Updates appear when the customer returns to the tab or within the normal eight-second refresh interval.

Delivery status is recorded manually by authorised restaurant staff. This does not book a courier, collect payment, or send an email. Legacy delivery orders previously labelled Collected are retained as awaiting a delivery update; the migration does not invent an arrival time.

The existing five kitchen `orders.status` values remain compatible with reports. Delivery handover uses canonical `collected` internally, while `delivery_assignments` and `delivery_events` provide the separate customer-facing dispatch/arrival state and timestamps. Staff must confirm real arrival; no timer marks orders delivered automatically.

## Verification

`npm test` executes the actual baseline, guest extension and 007 in isolated PostgreSQL, checking three/five limits, active-order exceptions, direct REST/RLS visibility, account isolation, hidden-order retry protection, role checks, delivery sequencing, idempotency and retained records. Browser tests exercise redirects, pagination/search, responsive tracking and customer → chef → administrator delivery updates using fixture services. These tests do not submit live orders or apply Cloud SQL.

Run `npm run supabase:verify` for read-only Cloud readiness. After running 007, it should report schema version 7 and denied unauthenticated history access. A real fulfilment check still needs the owner's customer/chef/admin accounts and a clearly labelled test order; isolated verification does not prove a courier actually delivered food.
