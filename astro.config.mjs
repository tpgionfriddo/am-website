import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

const publicPageCache = { maxAge: 300, swr: 3600 };

export default defineConfig({
	site: "https://architecturematters.com.au",
	output: "server",
	adapter: cloudflare(),
	cache: { provider: cacheCloudflare() },
	routeRules: {
		"/": publicPageCache,
		"/[slug]": publicPageCache,
		"/project/[slug]": publicPageCache,
		"/australian-architecture/[slug]": publicPageCache,
		"/architectural-news/page/[n]": publicPageCache,
		"/category/[...path]": publicPageCache,
	},
	// WordPress URLs end in a slash; templates link that way, but both forms resolve.
	trailingSlash: "ignore",
	image: {
		layout: "constrained",
		responsiveStyles: true,
		// Few srcset widths per image: every unique size is a Cloudflare Images
		// transformation (5,000/month free). ~530 images x 4 sizes stays under that.
		breakpoints: [640, 1080, 1600, 2048],
	},
	integrations: [
		react(),
		emdash({
			toolbar: "client",
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [formsPlugin({ defaultSpamProtection: "honeypot" })],
			// Core migrations are applied from the deploy machine (`pnpm emdash migrate`, see
			// README). The free Workers plan's per-request limits can't finish them in a request.
			migrations: { runtime: "check", dev: "auto" },
		}),
	],
	devToolbar: { enabled: false },
});
