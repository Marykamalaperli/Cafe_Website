# Repeat orders, favourites and the mobile customer flow

These frontend improvements work with the existing version-7 order history. No new SQL or payment activation is required. Current guest/member visibility, protected staff roles and independent sessions stay intact.

## Order again

The selected ticket and recent-history cards offer **Order again**. It opens a preview and fetches the current menu. Historical names/prices remain in the original ticket; the new preview uses current prices and labels any price changes.

Available portion, spice and add-on IDs are preserved. An unavailable dish, retired portion or removed add-on is listed for review; the application never silently replaces it with another recipe. If some selections remain available, the preview explicitly identifies the selections that will be added. Ingredients/allergens can be inspected in each preview line. A failed current-menu request keeps the existing bag and offers retry.

Customers can add to an existing bag or replace it. Identical selections merge; different portions/spice/add-ons remain separate. A merge that would exceed ten of a selection, twenty selections or thirty total items is blocked. Changes from another tab require reviewing the refreshed bag before adding.

Only dish IDs, option IDs, spice and quantities enter bag storage. Names, prices, old schedules, contact information, addresses, preparation notes and payment details are not copied. Completing the preview opens the normal checkout; it does not place an order, create a payment or modify the previous order. The backend validates availability/options and recalculates prices again when checkout is submitted.

## Favourites

Heart buttons appear on menu/recommendation cards. The **Favourites** menu filter combines with search, cuisine and diet filters. Saved preferences survive reloads and update across customer tabs. Temporarily unavailable dishes keep their saved IDs so they can reappear when available again.

Favourites are labelled **Saved on this browser**, including for signed-in customers. They contain dish identifiers only, not contact details or order records, and do not claim account/cloud synchronisation. Their storage key includes the website folder; `/review/` favourites do not alter production favourites. Storage failures display an error instead of claiming a save.

## Mobile tracking and checkout

On phones/tablets, the selected ticket comes before the history list. Opening history without a reference selects an active order first; pagination, search and explicit references keep the chosen order. A smaller heading, compact progress timeline and expandable privacy/history explanation bring the order status into the first screen. Selecting a history card scrolls/focuses its ticket. Guests still see three recent orders plus older active tickets; members see five per page with older/newer navigation.

The main checkout drawer keeps its header and a footer with the current order total and the original submit button visible while details are filled. Switching delivery/pickup updates both totals from the existing fee calculation. No payment settings are changed by these layout updates.

## Kitchen arrivals

Authorized kitchen displays have an optional **Sound off / Sound on** control and a visible new-arrival notice. Sound starts only after a user presses the control; a confirmation tone demonstrates it. It applies to that open display and needs enabling again after reload.

The first snapshot, re-renders and ordinary status changes never trigger arrival alarms. Newly visible received tickets do; this also covers a payment-eligible ticket released by the existing server gates. The notice links to Received and clears when its tickets leave that stage or it is dismissed. Turning sound off retains visual notices. This uses the current polling/visibility behaviour, not push notifications or background delivery.

## Verification

Pure tests cover selection/price validation, bag limits, ID-only favourite storage and arrival detection. Browser checks cover repeat-order previews, changed bags across tabs, missing options, mobile active-order priority, persistent favourites, sticky totals and opt-in sound. Existing history, role/session and checkout suites remain applicable. Tests use isolated fixtures, not Cloud orders.


## Tracking and checkout layout

Customer tracking puts partner name, contact number, call action and the explicitly labelled demo journey estimate directly below the current order status. Pickup/delivery addresses expand with a native details control. Preparation, assignment and delivery still require the existing staff updates; changing the layout never advances an order.

The administrator Orders page adds task filters scoped to the selected reporting period: In kitchen, Assign partner, Awaiting pickup, Delivery in progress and Completed. The order table shows the next operational step; on phones, each row becomes a readable card with the same View order action. Clear order filters resets search/status/task filters while retaining the selected reporting period. Same-day defaults and revenue definitions are unchanged.

Checkout groups fulfilment, contact and timing fields into numbered sections, uses one-column contact fields on phones, and highlights native validation failures. The existing sticky total and submit button remain. Public loading cards appear while private history/staff access is checked; order records remain hidden until access is verified. No new SQL or external integration is required for these presentation changes.
