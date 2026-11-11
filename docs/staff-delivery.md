# Restaurant staff delivery tracking

The owner supplied this pickup address: **White Rose Layout, 2nd Cross Rd, near Narayana School, Pattandur Agrahara, Whitefield, Bengaluru, Karnataka 560066**. Delivery is handled by **BitesBro restaurant staff**. Contact email/phone remain unconfigured.

## Activate

Run the complete [010_staff_delivery_tracking.sql](../supabase/migrations/010_staff_delivery_tracking.sql) manually in Supabase SQL Editor after migration 007. It works with optional migrations 008 and 009 already installed and can be rerun safely. Do not rerun the baseline or delete migration markers. It preserves orders, historical delivery events, payment records, prices and ownership. Existing delivered orders remain delivered. Existing dispatched orders can still be marked delivered; earlier pending orders follow the new assignment/pickup sequence. No real delivery events are invented for old orders.

Deploy the frontend and refresh open staff/customer tabs. GitHub Pages does not apply SQL. Until 010 is applied, the existing 007 dispatch/arrival controls remain available; the demo address/time presentation can still appear.

## Operation

1. Chef marks food **Preparing**, then **Ready**.
2. Administrator opens **Orders → View order → Assign restaurant staff**. The partner is fixed to BitesBro restaurant staff. Optionally enter the staff member’s name and adjust the demo journey time (default 45 minutes, allowed 10–180).
3. After the actual handover, choose **Confirm staff pickup**.
4. When the staff member departs, choose **Mark out for delivery**.
5. After actual delivery, choose **Mark delivered**.

Customers see **Ready → Delivery partner assigned → Order picked up → Out for delivery → Delivered**, along with their saved delivery address, the restaurant pickup address, the assigned staff name when provided, and the delivery progress timestamps. Updates appear on returning to the tab or through the existing eight-second refresh. Chef views still omit customer contact/address details and staff member names. Customers cannot change delivery progress. Unpaid UPI orders cannot be assigned or dispatched. Cancellation and terminal-state safeguards remain enforced by SQL.

The internal kitchen status becomes `collected` at staff pickup; the separate delivery status stays active until delivered. Older active guest orders remain trackable. Administrator counts/revenue retain their documented collected-order definition.

## Demo time only

Before pickup, customers see an illustrative journey duration after staff pickup. After pickup, the UI shows a demo arrival time computed from the recorded pickup timestamp plus that duration. If it passes, the page says it is waiting for a staff update. A timer never changes the delivery status. Estimates disappear after delivery/cancellation.

**No Google Maps/Routes API, real traffic, road distance, GPS tracking or external courier booking is added.** The owner explicitly requested demo times for now. No customer address is sent to a mapping or courier provider. The journey estimate excludes cooking, assignment and pickup waiting time.

## Verification

Isolated PostgreSQL tests execute 010 on the version-7 and optional payment schemas, including repeat application, protected roles, pickup/dispatch sequencing, idempotent event recording, payment guards, contact projection and terminal delivery. Browser tests follow customer → chef → administrator → customer, check demo labels and addresses, and verify 320–1440px layouts. These tests create no live orders and do not apply Cloud SQL.
