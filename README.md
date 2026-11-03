# Architecture Matters website

A rebuild of architecturematters.com.au (previously WordPress, `rarchitecture` theme) on
[Astro](https://astro.build) + [EmDash](https://docs.emdashcms.com), hosted on Cloudflare
Workers with D1 (database), R2 (media) and KV (sessions). Content and images were recovered
from the Wayback Machine (last clean capture July 2026).

- Site: https://architecturematters-site.architecturematters-site.workers.dev
- Admin: `/_emdash/admin`
- Cloudflare account: Architecture Matters (`a2bcaec6c865d7951e765fc7611d87e8`, Adept's account)

## Layout

```
src/layouts/Base.astro        header, overlay menu, footer, acknowledgement modal
src/components/blocks/        one component per CMS block type (matches the old theme's sections)
src/views/, src/pages/        routes -- WordPress URLs are preserved
src/styles/theme/             original theme CSS (main.css, block.css), unmodified
src/scripts/theme.ts          original theme JS, ported from jQuery
src/middleware.ts             locks the setup wizard behind SETUP_KEY
seed/seed.json                content model: collections, block types, taxonomies, menu, redirects
archive/                      Wayback mirror (HTML/JSON in git; archive/uploads/ is 189 MB, local only)
scripts/wayback-mirror.py     re-run the mirror
scripts/convert.mjs           archive -> content/content.json
scripts/import.mjs            content/content.json -> any EmDash site (media + entries + contact form)
```

## Develop

```sh
pnpm install
pnpm dev           # http://localhost:4321, admin via the dev-bypass link in the console
node scripts/import.mjs   # load the recovered content into the local site
```

## Deploy

Secrets live in `~/.config/architecturematters/prod.env` (not in git): `EMDASH_ENCRYPTION_KEY`
(keep a copy -- losing it loses encrypted plugin settings) and `SETUP_KEY` (delete after setup).

```sh
pnpm build
export CLOUDFLARE_API_TOKEN=$(npx wrangler auth token | tail -1)
pnpm emdash migrate --status --account-id a2bcaec6c865d7951e765fc7611d87e8 --d1 b86b8244-089f-477a-b549-206c9dfae07f
pnpm emdash migrate         --account-id a2bcaec6c865d7951e765fc7611d87e8 --d1 b86b8244-089f-477a-b549-206c9dfae07f
npx wrangler deploy
```

Migrations run from the CLI, not the Worker (`migrations.runtime: "check"`): on the free plan a
Worker request can't finish a full migration run. If an EmDash upgrade adds migrations, the
site returns 503 until `emdash migrate` has been run.

## Import content into production

1. Finish setup at `/_emdash/admin/setup?setup_key=<SETUP_KEY>`.
2. Admin -> Settings -> API tokens: create a token with admin scope.
3. `EMDASH_TOKEN=... node scripts/import.mjs --url https://architecturematters-site.architecturematters-site.workers.dev`
4. `npx wrangler secret delete SETUP_KEY`

## Not done yet

- Custom domain (and `EMDASH_SITE_URL`), Cloudflare Access email-code logins for editors.
- Email notifications for the contact form (needs Cloudflare Email Sending on a verified domain).
  Submissions are stored under Admin -> Forms -> Submissions.
- Long cache headers for resized images, scheduled off-site backups, uptime alert.
