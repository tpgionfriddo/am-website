import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	site: "https://architecturematters.com.au",
	output: "server",
	adapter: cloudflare(),
	// WordPress URLs end in a slash; templates link that way, but both forms resolve.
	trailingSlash: "ignore",
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [formsPlugin({ defaultSpamProtection: "honeypot" })],
		}),
	],
	devToolbar: { enabled: false },
});
