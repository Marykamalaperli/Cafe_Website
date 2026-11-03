# Deploy BitesBro

BitesBro needs a Node.js 24+ process and persistent storage. The same process serves the website and API, so no separate frontend domain or CORS configuration is needed. A host-provided HTTPS URL is sufficient; a custom domain is optional.

The repository includes a Render Blueprint and a portable Docker image/Compose setup. These files prepare deployment; they do not establish that a public website has been created.

## Render

[Deploy BitesBro to Render](https://render.com/deploy?repo=https://github.com/Marykamalaperli/Cafe_Website)

1. Open the link and sign in to your Render account. Connect the GitHub repository if Render requests access.
2. Review the `bitesbro` Blueprint. It selects a **paid Starter web service and a 1GB persistent disk**, in Singapore. Review the actual price in Render before applying it. A free service's ephemeral filesystem does not provide the durable SQLite storage required by this application.
3. Apply the Blueprint. Render installs production dependencies, starts Node, and checks `/api/health`.
4. Copy the actual HTTPS service URL after Render reports the deployment healthy. The start command uses Render's supplied `RENDER_EXTERNAL_URL` for canonical/social URLs and the sitemap; no guessed domain is committed.
5. For a custom domain, add it in Render, then set the start command to `npm start` and configure `SITE_URL` to the custom HTTPS origin in Render's environment settings.

`DATABASE_PATH=/var/data/bitesbro.sqlite` places SQLite, WAL and SHM files on the persistent disk. Keep one service instance. Render mounts the disk at runtime; do not use a pre-deploy command to initialise this database, because pre-deploy environments do not share this mounted disk. The existing startup performs safe initialisation.

The public-form limiter does not trust forwarded IP headers. The Blueprint sets its per-upstream limit to 300 requests per 15 minutes; add per-client limits at a trusted edge if needed. Check the actual request behaviour on your host before accepting live traffic.

If agent-managed deployment is desired, a Render account and appropriately scoped API access must be connected first. Supply credentials only through secure environment settings; never paste API keys into chat or commit them. GitHub push access alone does not grant Render account access.

## Docker or another container host

```sh
docker build -t bitesbro .
docker volume create bitesbro-data
docker run -d --name bitesbro \
  --restart unless-stopped \
  -p 3000:3000 \
  -e SITE_URL=https://your-real-domain.example \
  -v bitesbro-data:/app/data \
  bitesbro
```

The image runs as the non-root `node` user and includes a database-aware health check. A fresh named volume receives the writable data-directory ownership from the image. For an existing volume or bind mount, ensure UID/GID 1000 can write to the mount before starting it. Keep TLS termination at the hosting provider or reverse proxy.

Alternatively, set the real `SITE_URL` in a local, ignored `.env` file and run:

```sh
docker compose up -d --build
docker compose ps
```

The Compose file preserves data in the named `bitesbro-data` volume. Do not run `docker compose down --volumes` against an installation with data you need to retain.

For a managed build with an HTTPS-inspecting proxy, the Dockerfile accepts the platform's optional CA secret without baking it into the image:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t bitesbro .
```

Normal hosting builds do not need this secret. TLS verification remains enabled.

## Verify the public deployment

- Open the real HTTPS service URL on desktop and mobile. Confirm the menu loads from the API and images/fonts load from the same origin.
- `GET /api/health` must return `status: ok` and `database: connected`; `GET /api/menu` must return the 50 sample items unless the menu was edited.
- Confirm the canonical URL, social image URL, `robots.txt`, and `sitemap.xml` use the actual public origin.
- Exercise forms using fictional details before accepting real requests. Confirm records survive a host restart/redeploy using the attached persistent disk.
- Keep demo-request messaging until the actual café menu, street address, contact information, fulfilment and privacy policy are ready. Email delivery and online payments remain separate integrations.

Keep backups through a SQLite-aware backup operation. Do not copy only the main database file while WAL writes are active, and never commit customer data or database files to GitHub.

## GitHub Pages three-role frontend

The existing workflow builds with `npm run build:pages` on Node.js 24 and deploys `_site/`. The builder exports the full sample catalogue, retains photograph credits, includes nested customer tracking/kitchen/admin pages and fixes absolute HTML/CSS asset paths for `/Cafe_Website/`. JavaScript modules resolve shared URLs from their own location.

Public demonstration routes are `/Cafe_Website/?demo=1`, `/Cafe_Website/kitchen/`, `/Cafe_Website/admin/` and `/Cafe_Website/orders/`. Direct links and refreshes work without a client-router fallback. All three roles share fictional browser data; the role selector is not authentication. Real server forms stay disabled on static hosting. No production credentials or backend host are needed for Demo Checkout.

The Node host continues to provide the existing API and SQLite persistence separately. It serves nested public demo pages with the same security headers and realpath protections. Existing database migrations and backups remain intact; this redesign adds no schema change or operational backend endpoint.

See [the three-role guide](three-role-demo.md) for the demonstration scenario and the authenticated backend work required before real kitchen/admin access. Changes for this milestone are left on a feature branch for review; no commit, push or deployment is automatic.
