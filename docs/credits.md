# Assets and credits

## Fonts

- **Fraunces**, by Undercase Type and contributors. Distributed through `@fontsource/fraunces` 5.2.7 under the SIL Open Font License. See `public/assets/fonts/fraunces-OFL.txt`.
- **DM Sans**, by Colophon Foundry and contributors. Distributed through `@fontsource/dm-sans` 5.2.8 under the SIL Open Font License. See `public/assets/fonts/dm-sans-OFL.txt`.

WOFF2 files are self-hosted; visitors make no requests to a font CDN.

## Photographs

Representative café photographs were sourced from the [Start Bootstrap Business Casual asset repository](https://github.com/StartBootstrap/startbootstrap-business-casual/tree/master/dist/assets/img), then resized and optimised locally. The source repository is MIT licensed; its copyright and license notice is included in `public/assets/images/PHOTO-SOURCE-LICENSE.txt`.

| Local file | Source file |
| --- | --- |
| `barista.jpg` | `intro.jpg` |
| `coffee.jpg` | `products-01.jpg` |
| `bakery.jpg` | `products-02.jpg` |
| `cafe.jpg` | `about.jpg` |

These are stock images illustrating the design, not photographs of BitesBro or its actual menu. Replace them with the café owner's photos when available. No template markup, framework, scripts, or stylesheet were copied from the source project.

## Original artwork

The sun/cup logo, icon sprite, favicon, neighbourhood illustration, and eight SVG menu illustrations were created for this BitesBro implementation. Menu illustrations are deliberately labelled as artwork; they do not represent guaranteed serving appearance or final recipes.

`public/assets/images/bitesbro-hero.jpg` is original AI-generated promotional concept imagery created with OpenAI image generation for BitesBro, then JPEG-encoded for fast delivery. It shows a concept branded cup and croissant; it is not a photograph of the real café or a guaranteed product presentation. The original generation is retained separately in `/workspace/generated_images/`.

## Development tooling

Playwright is used only for browser testing. The production server uses the Node.js standard library and SQLite; there are no npm runtime dependencies.
