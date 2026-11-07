# Guest checkout

Customers can place and track orders without an email signup, password or confirmation email. Supabase creates a private guest session when they submit their first order. The database owns each order through that guest's Auth UUID; submitted email/name fields do not grant access. The existing customer design, menu, order form, prices and staff pages are retained.

## Activate on the existing Supabase project

The frontend and SQL can be reviewed locally, but activation requires the project owner. The publishable browser key cannot change Auth settings or apply SQL.

1. Open **Supabase → SQL Editor** and run the complete [006_guest_checkout.sql](../supabase/migrations/006_guest_checkout.sql). This is a forward migration for the existing version-2 project. The separate YouPI/payment migrations 003–005 are not prerequisites. For a brand-new project, run the baseline `setup.sql` first, then 006. Do not reset existing tables or rerun the baseline after upgrading.
2. Open **Authentication → Sign In / Providers → Anonymous Sign-Ins** and enable anonymous sign-ins. Supabase may label this **Allow anonymous sign-ins**. Keep regular email confirmation enabled for registered customers and staff.
3. Refresh the website, add a dish, fill in contact/order details and place the order. There is no sign-in screen. The guest session sends no signup email, so SMTP/domain setup can wait.

Guest checkout remains unavailable until **both** steps 1 and 2 are complete. Missing setup produces an error and keeps the bag; it never saves a fictional order as a fallback. The migration does not configure live email, payment or delivery providers. Supabase's normal guest-signup limits and any configured security checks still apply.

## Access and data

- Guests receive only the protected `customer` role. Unverified registered accounts cannot impersonate guests through user metadata. Guests cannot access admin, kitchen, staff assignments, menu editing or photo uploads—even if a guest is accidentally assigned a staff role in the database.
- Name, phone, contact email and any delivery address are validated and saved with the order. A guest's contact email is unverified and does not associate the guest with an existing customer's history. Registered customers continue to use their verified account email.
- Existing SQL recomputes prices, portions, add-ons and delivery fees; validates availability and Bangalore slots; preserves snapshots; and makes request-ID retries idempotent. Guests are limited to ten new orders per hour per guest session. A saved-order retry remains available at that limit.
- Guests can see and cancel only their own received orders. Chefs receive preparation tickets without contact details. Administrators can manage guest orders through the existing order list.
- Successful checkout redirects straight to tracking. The [order-history extension](order-history.md), forward migration 007, limits guest history to the latest three orders and older active orders until completion. Earlier completed/cancelled guest records are hidden, not deleted; staff retain them. Signed-in customers receive five orders per page and can retrieve earlier pages/search results.
- Guest tracking belongs to the current browser's customer session. Clearing site data or signing in to a different customer account removes access to that guest history. Staff sign-ins use [independent portal sessions](portal-sessions.md), so administrator/kitchen login and logout preserve the current guest session. Orders are never merged by matching contact email. The UI explains this before a customer-account switch.
- No contact details or real order snapshots enter the fictional browser-demo store. The SDK stores only its usual private session in browser storage; operational records stay in Supabase/memory.
- Reservations, contact messages and newsletter subscriptions retain their existing confirmed-customer rule. Only food ordering receives guest access.

## Verify

```sh
npm run check
npm test
npm run build:pages
npm run test:browser
npm run supabase:verify
```

The first four commands use isolated databases and browser Auth fixtures; they do not create live users/orders. The last command is read-only and reports whether migration 006 and anonymous sign-ins are active. A public/publishable-key request without a guest JWT still cannot read private orders or write them directly. The baseline migration refuses to overwrite the newer permission functions.

After activation, a full production guest-to-kitchen test should use clearly labelled test order details and an authorised chef/admin account. Passing isolated tests does not mean SQL or Auth settings were changed on Cloud.
