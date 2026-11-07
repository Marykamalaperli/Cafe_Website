# YouPI payments and the review demo

The payment demo is at **https://marykamalaperli.github.io/Cafe_Website/review/review.html** after the updated Pages workflow deploys. It uses the same payment handler, PostgreSQL migrations and role checks as the integration, with simulated Auth and YouPI services. Its database stays in this browser's separate IndexedDB namespace. No real bank, UPI app, YouPI server, Supabase project, email service or courier is contacted.

The main storefront continues with payment on pickup/delivery until the owner completes the activation steps below. GitHub Pages serves the frontend and demo; it cannot host the real YouPI gateway. No workflow applies Cloud SQL or deploys a Supabase function.

## Try the demo

1. Open the review link and wait for **Ready**.
2. Open **Order as a guest**, **Administrator demo** and **Chef demo** in separate tabs. The staff sign-in links prefill fictional accounts; click **Sign in**. Their password is shown on the review page and exists only in the isolated demo.
3. Add food, choose **UPI · YouPI payment demo**, and place the order with fictional details.
4. In the payment dialog, submit a simulated 12-digit bank reference. You can also try gateway success, failure or expiry. Even a success response does not mark an order paid.
5. Open **Administrator → Settings → Payments**. Check the simulated receipt details, acknowledge the bank-credit check and save the receipt review. The chef ticket becomes available only after approval.
6. Prepare, mark ready and collect the ticket in the kitchen. Follow payment and preparation in **My orders**. Customer, administrator and kitchen sign-ins stay independent.

Receipt rejection permits a corrected reference. Cancelling a paid order creates a refund-pending record; an administrator records a refund only after it has been completed. Demo refunds move no money. Pausing YouPI keeps cash checkout available. Demo guest history retains three recent orders plus older active tickets; registered demo customers retain five-per-page access to their history. Reloading preserves the demo database.

The service worker is scoped to `/Cafe_Website/review/`. It is installed only in the separately built review folder, not by the main website. Demo bags and Auth/verifier keys have separate namespaces, preserving the main site's bag and guest/staff sessions on the same origin. Production Auth keys and customer records are not copied into the sandbox. A demo schema upgrade resets only its fictional sessions/database. Older guest payment reviews and pending refunds remain trackable until finished, even outside the three recent orders. The previous untracked `_review_site/` artifact is not used or overwritten.

## Selected gateway and verification

The owner selected [youpi-pg/YouPI-PG](https://github.com/youpi-pg/YouPI-PG). The original REST adapter follows its `MANUAL_UPI` contract reviewed at revision `405327c27d78ae9d0dccdb1e2d2426cefc359477`. No upstream server, SDK or APK is bundled. That revision describes the gateway as experimental and its package manifest declares a commercial licence without including a licence file; confirm its hosting/use terms with its maintainer.

Saved order totals in integer paise determine the gateway amount. Server-only merchant credentials create a hosted checkout with a stable idempotency key. HTTPS checkout origin/path, payment ID, order reference, amount and INR currency are checked. Raw-body HMAC-SHA256, signed timestamp and delivery UUID authenticate webhooks. Duplicate deliveries are deduplicated; reuse with different content is rejected. Stale events cannot overwrite newer gateway status.

**A UTR/RRN is a payment claim, not proof of receipt.** All gateway outcomes, including SUCCESS and RECONCILED, remain unverified in this manual integration. Only a confirmed, database-authorized administrator can approve a credit after checking the receiving bank account, exact amount and bank reference. Customers and chefs cannot approve or overwrite payments. Verified references remain unique even after refunds. Chef projections omit bank references and customer contact information; unpaid UPI tickets are excluded and their preparation actions are blocked in SQL. Payment reads also respect the guest history window.

Order cancellation never pretends to refund money automatically. Late credits on cancelled orders enter receipt review and then require a refund record. If a checkout fails/expires after a possible bank debit, the UI asks customers to check the debit and submit their existing reference rather than automatically paying twice.

## Activate for the existing Cloud project

1. Review and run **[008_youpi_payments.sql](../supabase/migrations/008_youpi_payments.sql)** in Supabase SQL Editor, after the existing version-7 history migration. It preserves orders/menu/accounts and defaults online payments to disabled. Do **not** run the old preview migrations 003–005 or rerun the baseline setup. Version 8 can be rerun safely; incompatible earlier payment tables cause an explicit stop.
2. Host/configure the selected YouPI server separately, including its merchant, receiving-bank details, exact storefront return origin and webhook. This repository supplies the BitesBro adapter, not a hosted gateway or bank observer.
3. Store the following **only in Supabase Edge Functions → Secrets**:

   | Name | Value |
   | --- | --- |
   | `SITE_URL` | `https://marykamalaperli.github.io/Cafe_Website/` |
   | `PAYMENTS_MODE` | `live` only when deliberately activating the configured merchant |
   | `YOUPI_API_URL` | HTTPS origin/base of the running YouPI API |
   | `YOUPI_CHECKOUT_URL` | HTTPS base of the hosted checkout portal |
   | `YOUPI_MERCHANT_ID` | Merchant identifier |
   | `YOUPI_MERCHANT_API_KEY` | Merchant server API key |
   | `YOUPI_WEBHOOK_SECRET` | Merchant webhook signing secret |

   Supabase supplies its server URL, anon key and service-role key to Edge Functions. No merchant/service/management secret belongs in `VITE_*`, GitHub Pages configuration, chat or committed files. `ALLOWED_ORIGINS` may specify exact browser origins; by default only the Site URL origin is allowed.
4. Deploy **`supabase/functions/payments`** with the Supabase CLI (`supabase functions deploy payments --project-ref YOUR_PROJECT_REF`). `supabase/config.toml` disables the platform JWT precheck for signed gateway webhooks; the handler independently verifies customer JWTs against Auth and `my_role` for customer endpoints. Service-only RPCs are not executable by browser roles.
5. Configure the YouPI merchant webhook as `https://YOUR_PROJECT.supabase.co/functions/v1/payments/youpi/webhook`.
6. In **Administrator → Settings → Payments**, deliberately enable YouPI. Add the public repository Actions variable **`APP_PAYMENTS_ENABLED=true`** and redeploy the frontend. The UI also checks the running function's capabilities; incomplete setup leaves cash available. Locally, the same flag can go in ignored `.env.local`.
7. Before accepting real orders, verify the hosted merchant flow, actual bank receipt and customer → administrator → chef journey. Passing the isolated demo does not establish bank settlement or production provider connectivity.

The SQL adds `order_payments`, `youpi_sessions`, `youpi_webhook_events` and `payment_audit`; all enable RLS. Narrow RPCs own writes. Historical orders are marked **payment not recorded**, preserving their totals/status without assuming either an unpaid debt or a received payment. New cash receipts and completed manual refunds are recorded explicitly. Existing delivery tracking remains administrator-recorded; this payment upgrade does not book couriers or send order emails.

## Local verification

```sh
npm run check
npm test
npm run build:pages
npm run test:browser          # builds the isolated payment review automatically
npm run preview:review       # http://127.0.0.1:3211/Cafe_Website/review/review.html
```

The build output is ignored `_payment_review_site/`. Browser journeys use a local static server, the real SDK and real PostgreSQL in the scoped service worker. Unit tests execute migrations/RLS and the same server handler with contract fixtures. No test signs into or writes to the Cloud project.
