import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

const project = process.env.PUBLIC_KEYSTATIC_CLOUD_PROJECT;

if (!project || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(project)) {
	throw new Error("Set PUBLIC_KEYSTATIC_CLOUD_PROJECT to the team/project identifier from Keystatic Cloud settings before building the editor.");
}

export default defineConfig({
	srcDir: fileURLToPath(new URL("./src/", import.meta.url)),
	publicDir: fileURLToPath(new URL("./public/", import.meta.url)),
	outDir: fileURLToPath(new URL("../dist-editor/", import.meta.url)),
	cacheDir: fileURLToPath(new URL("../node_modules/.astro-editor/", import.meta.url)),
	output: "static",
	integrations: [react()],
	vite: {
		define: {
			"import.meta.env.PUBLIC_KEYSTATIC_CLOUD_PROJECT": JSON.stringify(project),
		},
	},
	devToolbar: { enabled: false },
});
