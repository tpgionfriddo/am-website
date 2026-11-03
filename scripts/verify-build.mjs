import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const directory = path.resolve("dist");
const base = (process.env.BASE_PATH || "").replace(/\/$/, "");
const errors = [];
const pages = [];

function walk(folder) {
	for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
		const file = path.join(folder, entry.name);
		if (entry.isDirectory()) walk(file);
		else if (file.endsWith(".html")) pages.push(file);
	}
}

function checkUrl(url, file) {
	if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return;
	const current = `https://static.invalid${base}/${path.relative(directory, file).replace(/index\.html$/, "")}`;
	const target = new URL(url, current);
	let pathname = decodeURIComponent(target.pathname);
	if (base) {
		if (pathname !== base && !pathname.startsWith(`${base}/`)) {
			errors.push(`${file}: link escapes base path: ${url}`);
			return;
		}
		pathname = pathname.slice(base.length) || "/";
	}
	const destination = path.join(directory, pathname);
	if (!fs.existsSync(destination) && !fs.existsSync(path.join(destination, "index.html"))) errors.push(`${file}: missing target ${url}`);
}

walk(directory);
for (const file of pages) {
	const html = fs.readFileSync(file, "utf8");
	const document = cheerio.load(html);
	if (!html.includes("</html>") || !html.includes("</body>")) errors.push(`${file}: incomplete HTML`);
	if (html.includes("/_emdash/") || /<astro-island\b/.test(html)) errors.push(`${file}: unexpected runtime CMS or hydrated island`);
	document("a[href],link[href],script[src],img[src],source[src]").each((_index, element) => {
		const node = document(element);
		checkUrl(node.attr("href") || node.attr("src"), file);
	});
	document("[srcset]").each((_index, element) => {
		for (const source of document(element).attr("srcset").split(",")) checkUrl(source.trim().split(/\s+/)[0], file);
	});
}

for (const forbidden of ["server", "keystatic", "api", "_worker.js"]) if (fs.existsSync(path.join(directory, forbidden))) errors.push(`Static deployment includes unexpected ${forbidden}`);
for (const file of fs.readdirSync("src/content/posts")) {
	const entry = JSON.parse(fs.readFileSync(path.join("src/content/posts", file), "utf8"));
	if (entry.status !== "published" && fs.existsSync(path.join(directory, file.replace(/\.json$/, ""), "index.html"))) errors.push(`Draft article was published: ${file}`);
}

if (errors.length) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else console.log(`Verified ${pages.length} complete static HTML pages, local links/srcsets, base path, draft exclusion, and absence of server/admin output.`);
