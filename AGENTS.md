# Architecture Matters website

This is a fully static Astro website with a local Keystatic editor.

## Commands

- `pnpm dev`: development server and Keystatic at `/keystatic`.
- `pnpm build`: generate the deployable static website in `dist/`.
- `pnpm typecheck`: validate Astro and TypeScript.
- `pnpm verify`: check the built site's internal links and assets.

## Conventions

- All public routes are prerendered. Do not add request-time CMS or database dependencies.
- Keep Keystatic's server routes development-only; GitHub Pages cannot run them.
- Edit content through Keystatic or the files in `src/content/`.
- Use the shared image component for local CMS images and the shared URL helper for internal links.
- Respect `BASE_PATH` for GitHub project Pages; do not hardcode root-relative asset URLs.
- Keep unpublished articles as drafts until explicitly approved for publication.
- Production uses GitHub Pages at architecturematters.com.au. Keep deployment manual-only and do not change DNS, the custom domain, or hosting without approval.
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
