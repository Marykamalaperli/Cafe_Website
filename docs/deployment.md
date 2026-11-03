# Deploy BitesBro

## GitHub Pages with Supabase

GitHub Pages serves the frontend. Supabase supplies Auth, Postgres functions/RLS and file storage, so this configuration supports ordering and staff dashboards without a Node host or Docker.

1. Complete [Supabase setup](supabase.md): run `supabase/setup.sql`, configure email/redirect URLs, create/confirm `admin@bitesbro.com`, and run the admin bootstrap SQL.
2. In GitHub **Settings → Secrets and variables → Actions → Variables or Secrets**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use the publishable key only. Keep `.env.local` ignored; do not add service-role/management keys.
3. Enable Pages with **GitHub Actions** as the source. The existing `.github/workflows/deploy.yml` installs locked dependencies, builds `_site/` on Node 24 and deploys it on pushes to `main` or a manual workflow run. It stops before publishing if the public Supabase settings are missing. It never runs SQL migrations or uploads private data.
4. Confirm the Supabase allowed callback is `https://marykamalaperli.github.io/Cafe_Website/auth/` and the Site URL is `https://marykamalaperli.github.io/Cafe_Website/` (or the actual custom-domain equivalents).
5. Sign in as administrator → **Settings → Upload menu photographs**. This stores/links 40 credited JPEGs in `menu-images/files/`. Assign confirmed chef accounts through **Staff access**.
6. Run `npm run supabase:verify` locally with the ignored public settings to check schema/bucket/photo readiness and denied anonymous operational reads.

```sh
npm ci
npm run build:pages
```

The build creates subpath-safe customer, `/auth/`, `/orders/`, `/kitchen/` and `/admin/` pages. Refreshes and direct nested links work without router rewrites. Fonts/scripts are local; uploaded menu photos load from Supabase. Generated public configuration includes only the publishable URL/key. Missing configuration leaves staff pages inaccessible; a Cloud failure leaves sample browsing available and forms disabled. `?demo=1` cannot bypass Cloud authentication.

Before accepting real traffic, verify customer own-order isolation, rejected customer/chef admin navigation, admin kitchen access, sign-out, confirmation/recovery callbacks and photo credits. Confirm opening hours, recipes/prices, business contacts, actual fulfilment and privacy/retention terms. Payments, dispatch and order-notification email remain separate integrations. Local tests use isolated PostgreSQL/SQLite and mocked Auth/Storage; they do not create production test customers.

This change does not push or deploy automatically. Review it, apply the owner-run SQL and configure the deployment variables before publishing.

## Optional native Node hosting

`npm start` builds the local SDK and starts Node 24. Set `SITE_URL` to the actual HTTPS origin and configure the same two public Supabase variables in the host. Node selects Supabase and does not open SQLite in that mode. `/api/health` queries applied schema readiness; writes require a customer Bearer session and pass through database role checks. Configure host/proxy client-IP abuse limits; the Node limiter trusts no forwarded headers by default.

The existing [Render Blueprint](../render.yaml) remains an optional native Node deployment. It selects a **paid Starter service and 1 GB persistent disk**, originally for the SQLite fallback. Review its price before applying it. Supabase mode does not need SQLite disk storage; adjust the hosting plan/disk deliberately if choosing this route. Add the two public Supabase environment variables in Render and complete SQL/auth setup first. The Blueprint does not deploy merely by being saved.

When using the legacy SQLite preview without Supabase, keep `DATABASE_PATH` on durable storage, run one instance and retain SQLite-aware backups including committed WAL data. Startup forward migrations preserve menu edits/history. Do not copy only an active main DB file, delete it to refresh the menu, or commit customer records.
