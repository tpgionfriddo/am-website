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

Migrations run from the CLI, not the Worker (`migrations.runtime: "check"`), following
[EmDash's deployment-managed migration workflow](https://docs.emdashcms.com/deployment/core-migrations/).
If an EmDash upgrade adds migrations, the site returns 503 until `emdash migrate` has been run.

### Migrations and Worker resource limits

The installed EmDash 1.4.0 has **90 core migrations**, numbered through `091` (`010` is absent).
They are the CMS's accumulated schema history, not migrations generated for this website.
A fresh database applies that history; an existing database only applies pending migrations.

The installed runtime migration path issues separate D1 calls for migration SQL and its
ledger writes. This exceeds the documented Free limit of
[50 D1 calls per Worker invocation](https://developers.cloudflare.com/d1/platform/limits/).
The CLI talks directly to D1, avoiding a single site Worker's invocation budget. The earlier
deployment record shows migrations applied through `035` and a held lock, but does not include
the actual Worker exception: attributing that particular interruption to CPU exhaustion was
not verified.

This is separate from **runtime CPU limits**. On November 3, 2026, production media uploads
returned Cloudflare error `1102`; a live Wrangler tail confirmed `Exceeded CPU Limit` and
`Worker exceeded CPU time limit`. Some ordinary page/API requests also returned `1102`.
Running migrations from the CLI does not fix these request-time failures. Workers Free
currently allows [10 ms CPU per HTTP request](https://developers.cloudflare.com/workers/platform/limits/).
The importer now supplies image dimensions and a tiny WebP thumbnail generated locally by
Sharp, leaving the original upload bytes untouched. EmDash's current placeholder decoder
only processes JPEG and PNG thumbnails, so these uploads omit optional blurhash/dominant-color placeholders
instead of decoding full-resolution images in the Worker. A production homepage import
succeeded on the existing plan with this change; no billing upgrade was made.

On November 3, the staged main-site import completed: D1 contains 10 published pages,
30 published projects, and no articles. The contact form exists and `SETUP_KEY` has been
deleted from the deployed Worker. However, a subsequent sweep of all 40 public routes
received complete HTML for only 25 requests. The other 15 responses were empty or truncated,
despite returning HTTP 200; a live Wrangler tail confirmed CPU-limit exceptions on those
page requests. This is a rendering issue separate from importing content. Resolve it before
switching production DNS; a successful status code alone is not a sufficient health check.

### Public page rendering and caching

Public pages use Astro's Cloudflare route-cache provider, with a five-minute lifetime
and one hour of stale-while-revalidate. Content, settings, menu, and taxonomy query hints
provide EmDash's invalidation tags. The editor toolbar uses its client bootstrap so
shared anonymous HTML still supports signed-in editors. Admin/API routes have no cache
rules; EmDash keeps authenticated/private responses out of the shared cache. Content
remains server-rendered on a cache miss, not prerendered at build time.

The similar-project query now requests only the displayed count plus one candidate for
excluding the current project, rather than fetching up to 50 complete CMS entries.
Ordinary body copy defaults to font weight 400, preserving explicit heading weights.

After these changes on November 3, 2026, all 40 main-site routes returned complete HTML
on deliberately fresh cache keys (`CF-Cache-Status: MISS`), and all 40 subsequent requests
were complete cache hits. Unauthorized session API requests and nonexistent pages
returned cache bypasses. The practice page's paragraphs computed to weight 400.

This does **not** establish reliable uncached Free-plan operation. Live Wrangler trace
events for the 40 misses reported 15–180 ms of CPU, without exceptions in that sweep.
Cloudflare documents some CPU-limit flexibility, so successful requests above the stated
budget are not a guarantee. A production CPU sampling profile did not identify a dominant
application function. Source inspection also found EmDash's HTML-only global prefetch
loads menus, widget areas, and taxonomy lists this layout does not all need; that upstream
behavior is unchanged. Do not treat caching as a fix for first-fill CPU exhaustion or
switch DNS solely on the basis of this successful sweep.

## Import content into production

1. Finish setup at `/_emdash/admin/setup?setup_key=<SETUP_KEY>`.
2. Admin -> Settings -> API tokens: create a token with admin scope.
3. `EMDASH_TOKEN=... node scripts/import.mjs --url https://architecturematters-site.architecturematters-site.workers.dev`
4. `npx wrangler secret delete SETUP_KEY`

### Import in stages

Use `--collections` to select pages, projects, or posts (articles). Only files referenced by
those entries are considered. `--slugs` further narrows the selection to comma-separated
entry slugs. For example, `--collections pages --slugs home` imports just the homepage.

```sh
SITE_URL=https://architecturematters-site.architecturematters-site.workers.dev

# Main pages first; repeat until the command reports the pages imported.
node scripts/import.mjs --url "$SITE_URL" --collections pages --media-limit 10

# Project portfolio next; repeat until the projects are imported.
node scripts/import.mjs --url "$SITE_URL" --collections projects --media-limit 25

# Articles later, without reimporting pages or projects.
node scripts/import.mjs --url "$SITE_URL" --collections posts --media-limit 10
```

Provide `EMDASH_TOKEN` through the environment. `--media-limit` caps new uploads per run;
matching ready media are reused by content hash, including records left by a failed response.
Every successful upload is checkpointed. When the batch limit is reached, the command exits
successfully without creating incomplete content; rerun the same command to continue.
Reads and deduplicating media uploads retry temporary 503 responses up to three attempts;
content-creation requests are not automatically retried, avoiding duplicate entries.
Once all selected media are available, the selected entries are imported and published.
Published entries are skipped unless `--update` is passed, while unfinished drafts resume
taxonomy assignment and publishing. The contact form is created only when selecting the
contact page.

The importer saves its media map and stops on Cloudflare resource-limit error `1102`, or
before creating content if any media upload failed. Content/form failures exit non-zero.
Small batches limit total work and make progress resumable; they do not raise a single
Worker request's CPU budget.

## Not done yet

- Custom domain (and `EMDASH_SITE_URL`), Cloudflare Access email-code logins for editors.
- Email notifications for the contact form (needs Cloudflare Email Sending on a verified domain).
  Submissions are stored under Admin -> Forms -> Submissions.
- Long cache headers for resized images, scheduled off-site backups, uptime alert.
