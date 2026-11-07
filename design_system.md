# BitesBro design system

**Good food. Great moods.** Warm, grounded, a little playful. The visual language combines café-editorial typography, a food-led photographic composition, hand-drawn line icons, and real freely licensed food photographs. Real café photography should replace the representative stock images when available.

## Brand foundations

| Token | Value | Use |
| --- | --- | --- |
| `--cream` | `#F7F5ED` | Main canvas and forms |
| `--paper` | `#FFFEF9` | Photo borders and light details |
| `--ink` | `#253F32` | Main text, header accents, reservation panel |
| `--orange` | `#BD4B2D` | Primary actions, italic highlights, small illustrations |
| `--orange-hover` | `#A53D22` | Primary action hover |
| `--sage` | `#E8EBDF` | Story panel, ticker, quiet surfaces |
| `--peach` | `#F1C6AF` | Newsletter panel and stamp |
| `--muted` | `#626A5E` | Supporting text |
| `--line` | `#DADCCF` | Dividers and quiet borders |

Use forest text on the light canvas and cream text on forest or terracotta actions. Do not convey errors or selection through colour alone: keep text feedback, borders, and `aria-pressed`/`aria-invalid` states. Decorative labels are not substitutes for readable form labels.

## Font pairing

**Fraunces** is the display face: soft, expressive serif shapes give the café a tactile personality. Its italic creates a signature emphasis without adding another font family. **DM Sans** supplies neutral, clear navigation, descriptions, prices, and form labels. This contrast keeps the identity warm and the interface practical.

Both are locally served WOFF2 files with `font-display: swap`. Critical normal-weight fonts are preloaded. Fall back to Georgia for display and Arial for interface copy. Font licenses are included alongside the files. Use SVGs for arrows and decorative marks instead of depending on emoji or font glyph coverage.

- Hero: responsive display size, roughly 63–112px; two compact lines, with the second line italic terracotta.
- Section titles: roughly 43–70px, negative tracking, line height about 1.08.
- Menu/product titles: 20–24px display type.
- Body: DM Sans, comfortable line height around 1.7–1.9.
- Eyebrows: small uppercase with letter spacing; never use these for important long-form content.

## Layout and components

The content container is capped at 1280px, with responsive 56/36/24/20px side spacing. Sections use approximately 65–110px vertical breathing room. The menu moves from four columns to two. Story, reservation, visit, and newsletter layouts collapse to one column on phones. The header stays visible and becomes an expandable, labelled mobile navigation.

| Component | Treatment |
| --- | --- |
| Logo | Original plate/cutlery SVG with Fraunces wordmark |
| Primary button | Terracotta fill, cream text, 6px corners, directional icon |
| Secondary button | Forest outline or forest fill; maintain consistent height |
| Menu tab | Rounded pill, forest active state, `aria-pressed` |
| Menu card | Food photograph, labelled cuisine reference where applicable, dietary marker, stored price, named Add button |
| Cart | Native dialog, right-aligned drawer, item quantities, visible total, honest pickup status |
| Form | Explicit label, appropriate autocomplete/type, consent, errors and success references |
| Photographs | Arch-shaped dosa hero and rotated South Indian thali story image |
| Stamp | Terracotta flavour stamp with italic display emphasis |
| Location | Clearly illustrative neighbourhood, never presented as a real street map |

The hero and signature panel use real dosa photography, and the story uses a South Indian vegetarian thali. Menu images, recommendations, customisers and bag thumbnails share the same locally served photographs. Photos illustrate serving styles; some have a visible cuisine reference caption. The menu and footer link to the generated public photo-credits page, with individual author, source and licence links. Keep these credits when reusing the photographs.

Photography crops use `object-fit: cover`; explicit dimensions reserve layout space. Lower-page images load lazily. All assets are local; there are no third-party tracking pixels or font requests. The active food imagery contains no generated concept photographs or SVG dish illustrations. Original icons and decorative line art remain.

A four-card recommendation section sits before the full menu. It uses Bangalore time: breakfast/tiffin 5am–noon, lunch noon–4pm, evening bites 4pm–7pm and dinner 7pm–11pm. Overnight copy suggests a future breakfast and clearly says the kitchen is closed. A clock and separate kitchen-status pill show the current local time and actual opening period. The layout moves from four columns to two on phones. Recommendations respect dietary preferences and open the dish customiser; they do not restrict the catalogue.

Four cuisine shortcuts lead to South Indian, biryani, global dishes and desserts. The 50-dish sample catalogue spans eight categories. Cards label vegetarian/non-vegetarian/plant-based dishes with both text and markers; red marks non-vegetarian items. Portion, spice preference, price and estimated preparation time support decisions. Filters include diet, cuisine, ingredient search and price order, with progressive loading for the large catalogue.

The customiser uses a native dialog with portion choices, spice levels, add-ons, ingredients and allergen information. The forest-green signature panel now features Bangalore Masala Dosa. Its details and price come from the catalogue. The cart shows food subtotal, delivery fee and total, with conditional delivery-address fields. A mobile bag bar remains clear of toasts, safe areas and dialogs. Connected server forms are unavailable in the static Pages view; a separate, clearly labelled browser Demo Checkout supports fictional ordering without contact or payment details.

## Motion

Account pages extend the same Fraunces/DM Sans pairing and forest/ivory/terracotta controls. Sign-in, signup, confirmation feedback and password recovery use labelled native form controls, password autocomplete, clear status messages and a constrained card on small screens. Operational views stay hidden until the role check completes. Staff account strips show the role's useful destinations and sign-out. Customer pages use the main navbar's outlined Sign in/Sign out button and a persistent bag icon/count, without a separate account strip. The same responsive customer header appears on the menu, history, customer sign-in and photo credits; its menu collapses below 1000px while sign-in and bag remain visible. Secondary-page bag drawers preserve dish options, allow quantity/removal changes and continue to the menu's full checkout. Cloud mode removes fictional checkout and reset controls without changing the customer food layout.

Use `cubic-bezier(.22, 1, .36, 1)` for entrance and interaction easing. Hover changes should feel small and physical: 2px button lift, a slight photo tilt, or a subtle image zoom. Reveal sections once on entry with opacity and about 22px of vertical motion. The ticker and circular stamp rotate slowly over 55 seconds.

`prefers-reduced-motion: reduce` stops continuous animation, entrance transforms, and smooth scrolling. Reveal content remains visible. All primary information and controls must work without decorative motion. Native dialogs preserve focus and Escape behaviour; status regions announce form results and bag additions.

## Voice and content

Write like a friendly neighbourhood host: “Save me a seat,” “Say a little hello,” and “A little room for a treat.” Keep operational instructions direct. Never trade clarity for personality when explaining errors, payment, email delivery, privacy, or booking status.

Business facts supplied so far: **BitesBro**, **Bangalore**, **10am–3pm and 6pm–11pm**. Daily opening is an assumption. Street address, contact information, final menu/recipes and physical-space images are pending. Vegetarian and non-vegetarian choices are both requested; sample delivery rules remain editable. Keep these editable and do not invent ratings, reviews, or a street address.

## Three-role operational extension

`public/operations.css` extends the same brand tokens and self-hosted fonts. The customer site retains its editorial hero, real photographs, recommendations, full catalogue, customiser and bag. A restrained role strip and three-step workflow invitation introduce the connected demonstration. Demo Checkout has its own dialog and fixed fictional guest; it never disguises a static request as a database order.

The Kitchen Display uses a forest header, light sage workspace, large cream tickets and 44–48px actions. Received/Preparing/Ready columns, quantity emphasis, explicit option notes and textual status chips support quick reading. The queue collapses to one column on small phones. History and an availability panel remain separate from active preparation.

Administrator uses a responsive sidebar, calm metric cards, explicit order/menu tables, derived reports and practical settings. Mobile navigation scrolls within its region; tables scroll within their own containers. Reports use a single restrained sales chart backed by an exact daily table and a textual status breakdown. All performance data is labelled simulated.

Customer order history has the same main navbar as the food website, with **My orders** selected and a shared keyboard/mobile toggle. An editorial heading and small food-photo collage introduce the page; recent-order cards pair thumbnails with references, dates, textual status chips and totals. The selected ticket shows a four-stage pickup or five-stage delivery timeline, dish snapshots and a quiet fulfilment panel. Mobile history cards scroll within their own region, the timeline becomes vertical, and a progress link jumps to the selected ticket. Guests see three recent orders and older active tickets; signed-in customers see five per page with earlier-page navigation and reference search. Purposeful empty states explain absent guest sessions and invite a first order without requiring signup.

Native dialogs preserve Escape/focus behaviour; feedback uses status regions. Colour is never the only status cue. Tracking uses a short entrance animation, disabled for reduced motion; dashboards have no continuous animation. Original SVG icons are reused; licensed food photographs retain their credits and reference labels.

Optional YouPI checkout adds one labelled payment selector to the existing bag. Order history uses a quiet sage payment panel with textual pending/verified/refund states, a reference-correction action and a native payment dialog. Administrator receipt cards require an explicit bank-credit acknowledgement; errors remain beside the form. Existing ivory, forest, terracotta and typefaces remain. The separately built payment review always shows a demo banner and offers no real UPI link or payment QR.
