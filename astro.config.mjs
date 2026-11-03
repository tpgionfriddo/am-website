import react from "@astrojs/react";
import keystatic from "@keystatic/astro";
import { defineConfig } from "astro/config";

const localEditor = process.argv.includes("dev");

export default defineConfig({
	site: process.env.SITE_URL || "https://architecturematters.com.au",
	base: process.env.BASE_PATH || "/",
	output: "static",
	trailingSlash: "ignore",
	integrations: [react(), ...(localEditor ? [keystatic()] : [])],
	image: {
		layout: "constrained",
		responsiveStyles: true,
		breakpoints: [640, 1080, 1600, 2048],
	},
	devToolbar: { enabled: false },
});
