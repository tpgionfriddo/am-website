# Architecture Matters website

A fully static Astro rebuild of architecturematters.com.au with a local Keystatic CMS.
The original WordPress theme, page structure and recovered content are retained. Public
requests serve prebuilt HTML and images: there is no CMS, database or server-side rendering
in the deployed site.

## Develop and edit

Use Node 24 and pnpm 11 (the exact pnpm version is pinned in package.json).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:4321 for the site and http://localhost:4321/keystatic for the editor.
Keystatic reads and writes local, version-controlled files. Saving an edit does not publish
it: review the change, commit it and rebuild. The editor/API is deliberately excluded from
production; GitHub Pages cannot run it. Hosted editing would require a separate service.

- **Pages:** 10 published pages, with structured sections.
- **Projects:** 30 published projects, images, project types and display order.
- **Articles:** 10 recovered articles retained as drafts, excluded from public output.
- **Site settings:** contact details, social links, navigation and footer information.

Keep article status set to Draft until publication is approved. Taxonomy choices are in
src/content/taxonomies.json. All 19 recovered section types have structured editing fields.
Images selected in Keystatic are stored in src/assets/media and optimized at build time;
PDFs are served from public/media. Original width/height metadata is informational; rendered
image dimensions come from the actual file. After changing content, review both the page
and any project/news lists where it appears.

## Validate locally

```sh
pnpm typecheck
pnpm build
pnpm verify
pnpm preview
```

The verification script checks complete HTML, local links and responsive image assets,
draft exclusion and the absence of CMS/server output. For the GitHub project URL:

```sh
SITE_URL=https://tpgionfriddo.github.io BASE_PATH=/am-website pnpm build
BASE_PATH=/am-website pnpm verify
pnpm preview --base /am-website
```

Use http://localhost:4321/am-website/ for that preview. BASE_PATH is a build setting; links
and assets are generated for it. Rebuild with BASE_PATH=/ when changing to the client's
root domain. The build output is dist/, not public/.

## Preview deployment

Repository: https://github.com/tpgionfriddo/am-website

The GitHub Pages workflow is **manual-only**. Pushing a commit does not deploy it. Run the
Deploy static website to GitHub Pages workflow when an updated preview is wanted. It uses
the repository's Pages origin/base path, checks types, builds, validates and deploys dist/.
The repository is public because the current GitHub plan does not support Pages for a
private repository. No CNAME or custom domain is configured: the client's DNS and current
site are unchanged. Pages previews carry a noindex directive and have no analytics tag.

Fixed legacy URLs have complete HTML redirect pages with working base-aware links.
These are browser/meta-refresh redirects, not HTTP 301 responses. Arbitrary wildcard
WordPress author/tag URLs cannot be statically enumerated and currently receive a 404.

## Future Cloudflare hosting

wrangler.static.jsonc prepares a separate, assets-only Worker named
architecturematters-static. It contains no account ID, database, bucket or secret bindings.
After selecting the client's Cloudflare account and approving that deployment:

```sh
SITE_URL=https://architecturematters.com.au BASE_PATH=/ pnpm build
pnpm verify
pnpm exec wrangler deploy --config wrangler.static.jsonc
```

That configuration is not the existing EmDash Worker. Do not reuse the old deployment
configuration or switch DNS until the replacement has been reviewed.

## Contact and analytics

The old server-processed contact form is replaced by working email/phone links. A genuine
form endpoint and spam protection are needed before adding a submission form to this
static site; no nonfunctional form is presented to visitors.

The archived homepage used Google Analytics 4 measurement ID **G-MWM3VQ47GW**, installed
through MonsterInsights. The same GA4 property can be retained using Google's standard
client-side tag, on either GitHub Pages or Workers; the WordPress plugin is not needed.
**No analytics is currently loaded**, so testing does not pollute client reports. Before
enabling tracking on the approved domain, confirm property ownership, consent/opt-out
requirements and any desired custom events (downloads, outbound links, phone/email clicks).
MonsterInsights-specific events are not automatically reproduced by a basic pageview tag.

## EmDash backup and recovery sources

The branch **backup/emdash-2026-11-03**, commit **36f7ecd**, preserves the EmDash approach,
including its importer and deployment configuration. The deployed EmDash site remains
untouched at https://architecturematters-site.architecturematters-site.workers.dev . Its
Cloudflare resources and local credentials have not been deleted. Do not run that branch's
deploy scripts unless explicitly restoring that approach.

The website repository lives at ~/Documents/tpgxyz/am/am-website. The earlier maintenance
site is a separate repository and is unchanged.

- src/content/: authoritative editable content and settings.
- keystatic.config.ts: CMS schemas and local editor.
- src/components/blocks/: the recovered theme's 19 editable section types.
- src/lib/: build-time reading, links, rich text and image resolution.
- src/layouts/Base.astro: shared header/footer, metadata and navigation.
- src/styles/theme/: recovered theme CSS; src/styles/global.css contains port adjustments.
- archive/: recovered WordPress HTML/JSON, not a runtime dependency.
- content/content.json and seed/seed.json: historical migration snapshots, not live content.
- scripts/migrate-static.mjs: one-time conversion; refuses to overwrite existing content.
- archive/uploads/: ignored local recovery assets, preserved alongside the migrated copies.

The original body default was weight 500 with many inline overrides to 400. Exact per-span
weight fidelity remains a follow-up; the current port's body override is 400. Do not flatten
all original typography to 500 when revisiting it.
