# Order history and delivery tracking

Successful Supabase checkout redirects immediately to `/orders/?order=<reference>`. The explicit fictional browser demo does the same. A failed checkout keeps the bag and form available.

**My orders** is available in the main customer navbar on desktop and in its mobile menu. The history page shares the customer header, Fraunces/DM Sans typography, ivory/forest/terracotta palette, food photographs and footer. Recent-order cards show food previews, references, dates, status and totals. The selected order includes a progress timeline, dish/options snapshots, totals, fulfilment details and permitted cancellation. **View order progress** jumps directly to the selected ticket on smaller screens.

Visitors without a current guest/account session receive an empty history page with menu and account sign-in links. Opening history does not create an anonymous account or request private order data. Guest sessions are created only at checkout; signing into a confirmed customer account carries the current guest identity’s orders into that account after migration 009. Empty registered-account histories, unavailable references and connection failures have distinct messages.

Mobile history puts the selected ticket before the card list and defaults to an active order when no reference/search/page has been requested. **Order again** on a ticket or card opens a current-menu preview and returns selected food to the bag without creating an order. A smaller masthead, compact timeline and expandable history explanation reduce scrolling. [Repeat-order and customer-flow details](customer-ordering.md).

## Activate on the existing project

Guest checkout is already working on the owner's project. In **Supabase → SQL Editor**, run the complete [007_order_history_delivery.sql](../supabase/migrations/007_order_history_delivery.sql) once. It requires the existing baseline and migration 006; the separate payment-preview migrations 003–005 are not required. Do not rerun `setup.sql`, reset tables, or delete migration markers. This migration can safely be rerun and does not delete order records, change menu prices, or assign staff roles.

GitHub Pages deployment publishes the frontend only. It cannot apply SQL with the public browser key. Until 007 is applied, the frontend limits the visible history using the previous owner-scoped API; server-enforced guest history restrictions and manual delivery controls require 007. Existing order placement continues to work.

## Customer history

| Customer | Recent history | Earlier orders |
| --- | --- | --- |
| Guest / no signup | Latest three, newest first | Older active orders remain in **Still in progress** until finished. Older completed/cancelled orders are hidden from that guest, including direct references and REST reads. |
| Signed-in customer | Five per page, newest first | **Older orders**, **Newer orders**, and reference search retrieve all of that customer's saved orders. |

The owner chose to hide older guest history and retain staff records. No automatic deletion runs. Administrators retain the operational history; chefs retain preparation tickets without customer contact/address fields. Guest visibility is enforced using protected Auth identity and RLS, not email matching or a browser-only filter. Matching contact emails never share order history.

Guest tracking stays with the current browser's private customer session. Before transfer, clearing site data or using another browser removes access to that guest session; it does not erase staff records. Signing into a confirmed customer account from the guest browser transfers all its guest orders, including hidden older orders, into that account after migration 009. Later orders and existing account orders share the same private paginated history. [Independent portal sessions](portal-sessions.md) keep staff login/logout separate from customer history. Real orders are held in Supabase and memory, never copied into the fictional demo store. The fictional demo shows the same three-order window over its fictional customer tickets and retains its staff dataset.

## Fulfilment updates

- **Pickup:** Received → Preparing → Ready → Collected.
- **Delivery after migration 010:** Received → Preparing → Ready → Delivery partner assigned → Order picked up → Out for delivery → Delivered. See [restaurant staff delivery setup](staff-delivery.md).
- Customers can cancel their own received orders; existing administrator cancellation rules remain unchanged.
- Chefs mark food preparing/ready and pickup orders collected. For delivery orders after migration 010, an administrator opens **Orders → View order**, assigns restaurant staff, confirms pickup, marks departure and confirms actual delivery. With 007 alone, the earlier dispatch/arrival controls remain available. Those controls enforce sequence and cannot reopen a terminal delivery. Updates appear when the customer returns to the tab or within the normal eight-second refresh interval.

Delivery status is recorded manually by authorised restaurant staff. This does not book a courier, collect payment, or send an email. Legacy delivery orders previously labelled Collected are retained as awaiting a delivery update; the migration does not invent an arrival time.

The existing five kitchen `orders.status` values remain compatible with reports. Delivery handover uses canonical `collected` internally, while `delivery_assignments` and `delivery_events` provide the separate customer-facing dispatch/arrival state and timestamps. Staff must confirm real arrival; no timer marks orders delivered automatically.

## Verification

`npm test` executes the actual baseline, guest extension and 007 in isolated PostgreSQL, checking three/five limits, active-order exceptions, direct REST/RLS visibility, account isolation, hidden-order retry protection, role checks, delivery sequencing, idempotency and retained records. Browser tests exercise redirects, pagination/search, responsive tracking and customer → chef → administrator delivery updates using fixture services. These tests do not submit live orders or apply Cloud SQL.

Run `npm run supabase:verify` for read-only Cloud readiness. After running 007, it should report schema version 7 and denied unauthenticated history access. A real fulfilment check still needs the owner's customer/chef/admin accounts and a clearly labelled test order; isolated verification does not prove a courier actually delivered food.


## Carry guest history into a customer account

Run [009_guest_account_history.sql](../supabase/migrations/009_guest_account_history.sql) manually in Supabase SQL Editor after 007. It also works when optional payment migration 008 is installed; payments are not a prerequisite. Do not rerun the baseline or delete migration markers. The migration is repeatable, preserves all order IDs, references, items, totals, payment and delivery records, and deletes no orders.

On password sign-in to a confirmed customer account, the browser first verifies the destination credentials/role without replacing the guest session. The guest JWT authorizes that specific destination in a private database table; the destination JWT then claims the orders transactionally before its session is saved. Email/contact matching, a guest UUID, or user metadata cannot grant access. Staff sign-in does not transfer guest orders. Transfers are idempotent and cannot later be redirected into a different account. Stale guest tabs cannot create orders under a transferred identity.

The account receives all orders owned by this current guest identity, even older completed orders hidden in the guest three-order window. Its existing and future orders remain in the same five-per-page history, with a page indicator, Older/Newer controls and reference search. The page and search survive refresh through URL parameters. The guest view remains the latest three plus older active tickets.

If preparation/claim fails or 009 is missing, sign-in reports the problem and does not replace the guest session. Retry with the same destination account if a transfer completed before browser-session saving failed. Guest sessions already lost through cleared site storage or previous account switches cannot be recovered through contact email. After successful transfer, account login works on other browsers too.

The restaurant now uses [staff delivery tracking](staff-delivery.md), including the owner-supplied pickup address and explicitly illustrative journey estimates. No Google routing or real traffic is connected.
