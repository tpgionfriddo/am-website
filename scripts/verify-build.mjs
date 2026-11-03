import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import Markdoc from "@markdoc/markdoc";

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

function checkContentAssets(value, slug, file) {
	if (typeof value === "string") {
		for (const match of value.matchAll(/\/src\/assets\/media\/[^)"'\s]+/g)) {
			if (!match[0].startsWith(`/src/assets/media/${slug}/`)) errors.push(`${file}: image path is not scoped to its Keystatic entry: ${match[0]}`);
			if (!fs.existsSync(match[0].slice(1))) errors.push(`${file}: missing editable image ${match[0]}`);
		}
	} else if (value && typeof value === "object") Object.values(value).forEach((child) => checkContentAssets(child, slug, file));
}

for (const collection of ["pages", "projects", "posts"]) {
	for (const filename of fs.readdirSync(`src/content/${collection}`)) {
		const file = `src/content/${collection}/${filename}`;
		checkContentAssets(JSON.parse(fs.readFileSync(file, "utf8")), filename.replace(/\.json$/, ""), file);
	}
}

walk(directory);
for (const file of pages) {
	const html = fs.readFileSync(file, "utf8");
	const document = cheerio.load(html);
	if (!html.includes("</html>") || !html.includes("</body>")) errors.push(`${file}: incomplete HTML`);
	if (html.includes("/_emdash/") || /<astro-island\b/.test(html)) errors.push(`${file}: unexpected runtime CMS or hydrated island`);
	if (/\{%\s*\/?(?:regular|wideImage)\b/.test(html)) errors.push(`${file}: unrendered rich-text markup`);
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
	if (entry.status === "published" && !fs.existsSync(path.join(directory, file.replace(/\.json$/, ""), "index.html"))) errors.push(`Published article is missing: ${file}`);
	if (entry.status === "published") {
		const destination = path.join(directory, file.replace(/\.json$/, ""), "index.html");
		if (!fs.existsSync(destination)) continue;
		const document = cheerio.load(fs.readFileSync(destination, "utf8"));
		if (document(".entry-header > .single-post__reading .share-post").length !== 1) errors.push(`${file}: article header is missing its centred layout or sharing links`);
		if (document(".single-post__reading > .single-post__content").length !== 1) errors.push(`${file}: article reading column is missing`);
		if (document(".single-post__back > .btn-back").length !== 1 || document(".single-post__sidebar").length) errors.push(`${file}: article navigation still uses the old sidebar layout`);
		const nodes = Markdoc.parse(entry.content).children;
		const wideImages = nodes.filter((node) => node.type === "tag" && node.tag === "wideImage");
		const images = nodes.filter((node) => node.type === "paragraph" && node.children.length === 1 && node.children[0].type === "inline" && node.children[0].children.length === 1 && node.children[0].children[0].type === "image");
		const quotes = nodes.filter((node) => node.type === "blockquote");
		if (document(".single-post__content > .news-image").length !== images.length + wideImages.length) errors.push(`${file}: article image sections were lost`);
		if (document(".single-post__content > .news-image--offset").length !== wideImages.length) errors.push(`${file}: article image widths were lost`);
		if (document(".single-post__content > .news-block-quote > blockquote").length !== quotes.length) errors.push(`${file}: article quote styling was lost`);
	}
}

if (errors.length) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else console.log(`Verified ${pages.length} complete static HTML pages, local links/srcsets, base path, draft exclusion, and absence of server/admin output.`);
