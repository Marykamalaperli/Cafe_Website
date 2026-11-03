# Assets and credits

Supabase authentication, database and Storage use the official `@supabase/supabase-js` SDK (MIT). Its official browser bundle and licence are copied locally at build time. The isolated PostgreSQL security tests use `@electric-sql/pglite` (Apache-2.0); it is a development dependency and does not run in the website.

## Fonts

- **Fraunces**, by Undercase Type and contributors. Distributed through `@fontsource/fraunces` 5.2.7 under the SIL Open Font License. See `public/assets/fonts/fraunces-OFL.txt`.
- **DM Sans**, by Colophon Foundry and contributors. Distributed through `@fontsource/dm-sans` 5.2.8 under the SIL Open Font License. See `public/assets/fonts/dm-sans-OFL.txt`.

WOFF2 files are self-hosted; visitors make no requests to a font CDN.

## Active food photographs

The current website uses 40 real, locally served photographs in `public/assets/images/photos/`. **Free to reuse does not mean every image is in the public domain.** Licences include CC0/public domain, CC BY, CC BY-SA, Unsplash and Pexels. Every image retains its own licence. Visible author/source/licence credit is available at `public/photo-credits.html`, linked from the menu and footer.

`public/photo-credits.json` is the authoritative per-file manifest: author, original source, licence URL, pinned downloaded mirror/revision, transformations, SHA-256, dish assignments and cuisine-reference captions. `npm run photos:credits` regenerates the public credits; the Pages build also runs it. Existing resized mirror files were copied without further pixel edits and are cropped responsively by CSS. BY-SA photographs and photo adaptations retain the applicable share-alike licence; this does not change the licence of unrelated site code.

Sources include Wikimedia Commons photographs mirrored with credits in Ravjot-Singh/wether_depen, spinorgs/VJ-s-Indian-restaurant, Prureddy/vidhatri-bhavan-website, spidyshivam/shagun-home-delivery, chasvitf/baankanompang, PatienceQuartey/odin-recipes, ClangsterXD/odin-recipes and Lucaci04/coffee-demos-studio; CC0 StockSnap photographs mirrored by Axess34/oz-example-littlewren; and credited Unsplash/Pexels photographs mirrored by mimi-kimi/Matchakohi, VertexModels/chunk-bakehouse and Natarajan-Gothandaraman/Shanthi_Foods. The manifest pins each exact file, so future upstream edits do not silently change provenance. No third-party project application code was copied or executed.

Stock photos show serving styles, not the physical BitesBro kitchen or verified menu portions. Some dishes intentionally use clearly labelled cuisine references rather than claiming an exact serving. Replace those with the owner's own photographs when available. Recipes, dietary labels, allergens and prices remain editable sample data.

## Original artwork and earlier assets

The plate/cutlery logo, SVG icon sprite, favicon and illustrative neighbourhood are original BitesBro artwork. Earlier unused photographs, generated concept heroes and dish SVGs remain in the repository as design history; the active pages and catalogue use the licensed photo manifest. Earlier source notices remain alongside those historical files.

## Development tooling

Playwright is used only for browser testing. Node serves the frontend and optional API; the configured production backend uses Supabase Auth, Postgres and Storage. SQLite remains the unconfigured local preview.
