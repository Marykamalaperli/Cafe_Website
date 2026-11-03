# BitesBro design system

**Good food. Great moods.** Warm, grounded, a little playful. The visual language combines café-editorial typography, a food-led photographic composition, hand-drawn line icons, and original illustrated menu items. Real café photography should replace the representative stock images when available.

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
| Menu card | Original product artwork, dietary marker, stored price, named Add button |
| Cart | Native dialog, right-aligned drawer, item quantities, visible total, honest pickup status |
| Form | Explicit label, appropriate autocomplete/type, consent, errors and success references |
| Photographs | Arch-shaped South Indian feast hero and rotated food story image |
| Stamp | Terracotta flavour stamp with italic display emphasis |
| Location | Clearly illustrative neighbourhood, never presented as a real street map |

The menu art is deliberately illustrative and labelled as such in alt text and allergen guidance. Photography crops use `object-fit: cover`; explicit dimensions reserve layout space. Lower-page images load lazily. All assets are local; there are no third-party tracking pixels or font requests.

The hero now leads with an original generated South Indian feast: a crisp dosa, idli, vada, sambar and chutneys, with biryani and a cooler in the background. It is concept imagery, not a photo of a physical restaurant. A terracotta flavour stamp and plate/cutlery identity replace the coffee-led branding. Supporting story imagery uses the food composition, not a barista image.

Four cuisine shortcuts lead to South Indian, biryani, global dishes and desserts. The 50-dish sample catalogue spans eight categories. Cards label vegetarian/non-vegetarian/plant-based dishes with both text and markers; red marks non-vegetarian items. Portion, spice preference, price and estimated preparation time support decisions. Filters include diet, cuisine, ingredient search and price order, with progressive loading for the large catalogue.

The customiser uses a native dialog with portion choices, spice levels, add-ons, ingredients and allergen information. The forest-green signature panel now features Bangalore Masala Dosa. Its details and price come from the catalogue. The cart shows food subtotal, delivery fee and total, with conditional delivery-address fields. A mobile bag bar remains clear of toasts, safe areas and dialogs. Form submission is visibly unavailable in the static Pages sample view.

## Motion

Use `cubic-bezier(.22, 1, .36, 1)` for entrance and interaction easing. Hover changes should feel small and physical: 2px button lift, a slight photo tilt, or a subtle image zoom. Reveal sections once on entry with opacity and about 22px of vertical motion. The ticker and circular stamp rotate slowly over 55 seconds.

`prefers-reduced-motion: reduce` stops continuous animation, entrance transforms, and smooth scrolling. Reveal content remains visible. All primary information and controls must work without decorative motion. Native dialogs preserve focus and Escape behaviour; status regions announce form results and bag additions.

## Voice and content

Write like a friendly neighbourhood host: “Save me a seat,” “Say a little hello,” and “A little room for a treat.” Keep operational instructions direct. Never trade clarity for personality when explaining errors, payment, email delivery, privacy, or booking status.

Business facts supplied so far: **BitesBro**, **Bangalore**, **10am–3pm and 6pm–11pm**. Daily opening is an assumption. Street address, contact information, final menu/recipes and physical-space images are pending. Vegetarian and non-vegetarian choices are both requested; sample delivery rules remain editable. Keep these editable and do not invent ratings, reviews, or a street address.
