# Architecture Matters website

This is a fully static Astro website with local and separately hosted Keystatic editors.

## Commands

- `pnpm dev`: development server and Keystatic at `/keystatic`.
- `pnpm build`: generate the deployable static website in `dist/`.
- `pnpm build:editor`: generate the separate Keystatic Cloud editor in `dist-editor/`.
- `pnpm deploy:editor`: build and deploy only the editor Worker; requires the Cloud project identifier.
- `pnpm typecheck`: validate Astro and TypeScript.
- `pnpm verify`: check the built site's internal links and assets.

## Conventions

- All public routes are prerendered. Do not add request-time CMS or database dependencies.
- Keep Keystatic's server routes development-only; GitHub Pages cannot run them.
- The separate `editor/` build uses client-side Keystatic Cloud authentication. Never mix its hydrated editor into the public `dist/` build or deploy public article/layout changes with an editor deployment.
- Edit content through Keystatic or the files in `src/content/`.
- Use the shared image component for local CMS images and the shared URL helper for internal links.
- Respect `BASE_PATH` for GitHub project Pages; do not hardcode root-relative asset URLs.
- Keep unpublished articles as drafts until explicitly approved for publication.
- Production uses GitHub Pages at architecturematters.com.au. Changes pushed to main automatically deploy; manual workflow runs remain available. Do not change DNS, the custom domain, or hosting without approval.
- The `backup/emdash-2026-11-03` branch preserves the prior deployment. Do not redeploy or delete that Worker.
- Never commit secrets, `.env` files, local databases, or CMS tokens.

## Layout

- `keystatic.config.ts`: CMS collections and settings.
- `src/content/`: version-controlled page, project, article, and settings data.
- `src/assets/media/`: original local images; optimized during the build.
- `src/lib/`: static content access, rich text, images, and URL helpers.
- `src/components/blocks/`: original theme's editable page sections.
- `.github/workflows/`: GitHub Pages deployment.
- `wrangler.static.jsonc`: optional future static-only Worker deployment, with no account-specific bindings.
- `editor/` and `wrangler.editor.jsonc`: separate static editor Worker in the Architecture Matters account; no CMS API server or database.
