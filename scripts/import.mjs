#!/usr/bin/env node
/**
 * Import content/content.json (from scripts/convert.mjs) into an EmDash site.
 *
 *   node scripts/import.mjs                                  # local dev server (http://localhost:4321)
 *   EMDASH_TOKEN=... node scripts/import.mjs --url https://site.example
 *
 * - Uploads every referenced file once (resumable: content/media-map.<host>.json).
 * - Creates pages, projects and posts that don't exist yet (matched by slug), then
 *   publishes them with their original dates. Existing entries are left alone unless
 *   --update is passed, in which case their data is replaced.
 * - Creates the "contact" enquiry form for the forms plugin if it's missing.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const arg = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : def;
};
const BASE = arg("--url", "http://localhost:4321").replace(/\/$/, "");
const UPDATE = args.includes("--update");
const NOTIFY = arg("--notify", "info@architecturematters.com.au");
const API = `${BASE}/_emdash/api`;
const source = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "content.json"), "utf8"));
const collections = new Set(arg("--collections", "pages,projects,posts").split(",").map((name) => name.trim()));
if ([...collections].some((name) => !["pages", "projects", "posts"].includes(name))) throw new Error("--collections must contain pages, projects, or posts.");
const slugs = args.includes("--slugs") ? new Set(arg("--slugs", "").split(",").map((slug) => slug.trim()).filter(Boolean)) : undefined;
if (slugs && !slugs.size) throw new Error("--slugs requires at least one slug.");
const mediaLimit = Number(arg("--media-limit", Infinity));
if (mediaLimit !== Infinity && (!Number.isSafeInteger(mediaLimit) || mediaLimit < 1)) throw new Error("--media-limit must be a positive integer.");
const content = Object.fromEntries([...collections].map((name) => [name, source[name].filter((entry) => !slugs || slugs.has(entry.slug))]));
if (slugs && [...slugs].some((slug) => !Object.values(content).some((entries) => entries.some((entry) => entry.slug === slug)))) throw new Error("A requested slug was not found in the selected collections.");
console.log(`scope: ${Object.entries(content).map(([name, entries]) => `${entries.length} ${name}`).join(", ")}`);

// ------------------------------------------------------------------- auth
const headers = { "X-EmDash-Request": "1" };
if (process.env.EMDASH_TOKEN) {
	headers.Authorization = `Bearer ${process.env.EMDASH_TOKEN}`;
} else if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
	const res = await fetch(`${API}/setup/dev-bypass?content=0`, { redirect: "manual" });
	const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
	if (!cookies.length) throw new Error(`dev-bypass failed (${res.status}): ${await res.text()}`);
	headers.Cookie = cookies.join("; ");
} else {
	throw new Error("Set EMDASH_TOKEN (a personal access token with admin scope) for a remote site.");
}

async function api(method, p, body, attempt = 0) {
	const res = await fetch(`${API}${p}`, {
		method,
		headers: body && !(body instanceof FormData) ? { ...headers, "Content-Type": "application/json" } : headers,
		body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
	});
	if ((method === "GET" || (method === "POST" && p === "/media")) && res.status === 503 && attempt < 2) {
		await res.body?.cancel();
		await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
		return api(method, p, body, attempt + 1);
	}
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		const error = new Error(`${method} ${p}: ${res.status} ${text.slice(0, 300)}`);
		error.status = res.status;
		error.resourceLimit = text.includes('class="cf-error-code">1102</span>');
		throw error;
	}
	if (!res.ok || json.success === false) {
		const err = new Error(`${method} ${p}: ${res.status} ${JSON.stringify(json.error ?? json).slice(0, 500)}`);
		err.status = res.status;
		throw err;
	}
	return json.data;
}

// ------------------------------------------------------------------ media
const mapFile = path.join(ROOT, "content", `media-map.${new URL(BASE).host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
const mediaMap = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : {};
const saveMap = () => fs.writeFileSync(mapFile, JSON.stringify(mediaMap, null, 1));

// Collect every file reference and the first alt text used for it.
const files = new Map();
JSON.stringify(content, (k, v) => {
	if (v && typeof v === "object" && typeof v.$file === "string" && !files.has(v.$file)) files.set(v.$file, v);
	if (typeof v === "string" && v.startsWith("$file:") && !files.has(v.slice(6))) files.set(v.slice(6), {});
	return v;
});

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp4": "video/mp4" };
const existingMedia = new Map();
let mediaCursor;
do {
	const query = new URLSearchParams({ limit: "100", ...(mediaCursor ? { cursor: mediaCursor } : {}) });
	const listed = await api("GET", `/media?${query}`);
	for (const item of listed.items) if (item.status === "ready" && item.contentHash) existingMedia.set(item.contentHash, item);
	mediaCursor = listed.nextCursor;
} while (mediaCursor);
let uploaded = 0;
let reused = 0;
const failed = [];
for (const [file, meta] of files) {
	if (mediaMap[file]) continue;
	const abs = path.join(ROOT, file);
	const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
	const bytes = fs.readFileSync(abs);
	const hash = `sha1:${createHash("sha1").update(bytes).digest("hex")}`;
	const existing = existingMedia.get(hash);
	if (existing) {
		mediaMap[file] = { id: existing.id, url: existing.url, storageKey: existing.storageKey, width: existing.width, height: existing.height, mimeType: existing.mimeType };
		reused++;
		continue;
	}
	if (uploaded >= mediaLimit) break;
	const form = new FormData();
	form.append("file", new Blob([bytes], { type }), path.basename(file));
	try {
		let dimensions = {};
		if (["image/jpeg", "image/png"].includes(type)) {
			dimensions = imageSize(bytes);
			const thumbnail = await sharp(bytes).rotate().resize({ width: 16, height: 16, fit: "inside", withoutEnlargement: true }).webp().toBuffer();
			form.append("thumbnail", new Blob([thumbnail], { type: "image/webp" }), "thumbnail.webp");
		}
		const width = meta.width ?? dimensions.width;
		const height = meta.height ?? dimensions.height;
		if (width) form.append("width", String(width));
		if (height) form.append("height", String(height));
		if (meta.alt) form.append("alt", meta.alt);
		const { item } = await api("POST", "/media", form);
		mediaMap[file] = { id: item.id, url: item.url, storageKey: item.storageKey, width: item.width, height: item.height, mimeType: item.mimeType };
		existingMedia.set(hash, item);
		uploaded++;
		saveMap();
		if (uploaded % 10 === 0) console.log(`  uploaded ${uploaded}…`);
	} catch (e) {
		if (e.resourceLimit) {
			saveMap();
			throw new Error(`Cloudflare stopped the upload of ${file} with resource-limit error 1102. Media progress is saved; selected content has not been imported. Resolve the Worker resource limit before rerunning.`, { cause: e });
		}
		failed.push(`${file}: ${e.message}`);
	}
}
saveMap();
const available = [...files.keys()].filter((file) => mediaMap[file]).length;
console.log(`media: ${uploaded} uploaded, ${reused} reused, ${available}/${files.size} selected files available`);
for (const f of failed) console.warn("  ! " + f);
if (failed.length) throw new Error(`${failed.length} media uploads failed. Content has not been imported; rerun after resolving the upload errors.`);
if (available < files.size) {
	console.log("Media batch saved. Rerun the same command to continue; content waits until all selected files are available.");
	process.exit(0);
}

// Swap placeholders for media references.
function resolve(value) {
	if (Array.isArray(value)) return value.map(resolve).filter((v) => v !== undefined);
	if (typeof value === "string" && value.startsWith("$file:")) return mediaMap[value.slice(6)]?.url ?? "#";
	if (!value || typeof value !== "object") return value;
	if (typeof value.$file === "string") {
		const m = mediaMap[value.$file];
		if (!m) return undefined;
		return { id: m.id, src: m.url, alt: value.alt, width: m.width ?? value.width, height: m.height ?? value.height, provider: "local", meta: { storageKey: m.storageKey } };
	}
	if (value._type === "image" && value.asset?.$file) {
		const m = mediaMap[value.asset.$file];
		if (!m) return undefined;
		return { ...value, asset: { _ref: m.id, url: m.url }, width: m.width ?? value.width, height: m.height ?? value.height };
	}
	const out = {};
	for (const [k, v] of Object.entries(value)) {
		const r = resolve(v);
		if (r !== undefined) out[k] = r;
	}
	return out;
}

// ------------------------------------------------------------- taxonomies
// Seed terms are only applied with sample content, so create them here.
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "seed", "seed.json"), "utf8"));
const termIds = {}; // taxonomy -> slug -> id
const neededTaxonomies = new Set([...(content.projects?.length ? ["project_type"] : []), ...(content.posts?.length ? ["category"] : [])]);
for (const tax of (seed.taxonomies ?? []).filter((taxonomy) => neededTaxonomies.has(taxonomy.name))) {
	const flat = (terms) => terms.flatMap((t) => [t, ...flat(t.children ?? [])]);
	const have = new Map(flat((await api("GET", `/taxonomies/${tax.name}/terms`)).terms ?? []).map((t) => [t.slug, t.id]));
	for (const t of tax.terms ?? []) {
		if (!have.has(t.slug)) {
			const res = await api("POST", `/taxonomies/${tax.name}/terms`, { slug: t.slug, label: t.label });
			have.set(t.slug, (res.term ?? res.item ?? res).id);
			console.log(`terms: created ${tax.name}/${t.slug}`);
		}
	}
	termIds[tax.name] = Object.fromEntries(have);
}

// --------------------------------------------------------------- content
async function existingSlugs(collection) {
	const map = new Map();
	let cursor;
	do {
		const q = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
		const data = await api("GET", `/content/${collection}?${q}`);
		for (const item of data.items) if (item.slug) map.set(item.slug, item);
		cursor = data.nextCursor;
	} while (cursor);
	return map;
}

const toIso = (d) => {
	if (!d) return undefined;
	const s = /Z|[+-]\d\d:\d\d$/.test(d) ? d : `${d}Z`;
	const t = new Date(s);
	return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
};

async function upsert(collection, entries, build) {
	if (!entries?.length) return;
	const existing = await existingSlugs(collection);
	let created = 0,
		updated = 0,
		skipped = 0;
	for (const e of entries) {
		const { data, taxonomies, publishedAt } = build(e);
		const seo = e.seo ? { title: e.seo.title ?? null, description: e.seo.description ?? null } : undefined;
		const found = existing.get(e.slug);
		try {
			let id;
			if (found) {
				if (!UPDATE && found.status === "published") {
					skipped++;
					continue;
				}
				if (UPDATE) {
					const current = await api("GET", `/content/${collection}/${found.id}`);
					await api("PUT", `/content/${collection}/${found.id}`, { data, seo, _rev: current.item?._rev ?? current._rev });
				}
				id = found.id;
				updated++;
			} else {
				const res = await api("POST", `/content/${collection}`, { slug: e.slug, data, seo });
				id = res.item.id;
				created++;
			}
			for (const [tax, slugs] of Object.entries(taxonomies ?? {})) {
				const ids = slugs.map((s) => termIds[tax]?.[s]).filter(Boolean);
				if (ids.length !== slugs.length) console.warn(`  ! ${collection}/${e.slug}: unknown ${tax} terms in ${slugs}`);
				await api("POST", `/content/${collection}/${id}/terms/${tax}`, { termIds: ids });
			}
			await api("POST", `/content/${collection}/${id}/publish`, publishedAt ? { publishedAt } : {});
		} catch (err) {
			console.warn(`  ! ${collection}/${e.slug}: ${err.message}`);
			process.exitCode = 1;
			if (err.resourceLimit) throw err;
		}
	}
	console.log(`${collection}: ${created} created, ${updated} updated, ${skipped} unchanged`);
}

await upsert("pages", content.pages, (p) => ({
	data: resolve({ title: p.title, featured_image: p.featured_image, layout: p.layout }),
}));
await upsert("projects", content.projects, (p) => ({
	data: resolve({ title: p.title, featured_image: p.featured_image, thumbnail: p.thumbnail, sort_order: p.sort_order, layout: p.layout }),
	taxonomies: { project_type: p.types },
	publishedAt: toIso(p.date),
}));
await upsert("posts", content.posts, (p) => ({
	data: resolve({ title: p.title, featured_image: p.featured_image, content: p.content, excerpt: p.excerpt }),
	taxonomies: { category: p.categories },
	publishedAt: toIso(p.date),
}));

// ------------------------------------------------------------- contact form
if (content.pages?.some((page) => page.slug === "contact-us")) {
	try {
		const list = await api("GET", "/plugins/emdash-forms/forms/list");
		const forms = list.items ?? list.forms ?? list;
		if (!Array.isArray(forms) || !forms.some((form) => form.slug === "contact")) {
			const field = (id, type, label, required, extra = {}) => ({ id, type, label, name: id, placeholder: label, required, width: "full", ...extra });
			await api("POST", "/plugins/emdash-forms/forms/create", {
				name: "Contact enquiry",
				slug: "contact",
				pages: [
					{
						fields: [
							field("name", "text", "Name", true),
							field("email", "email", "Email", true),
							field("phone", "tel", "Phone", true),
							field("website", "url", "Website", false),
							field("enquiry", "textarea", "Enquiry", true),
						],
					},
				],
				settings: {
					confirmationMessage: "Thank you for your enquiry. We'll be in touch soon.",
					notifyEmails: NOTIFY ? [NOTIFY] : [],
					spamProtection: "honeypot",
					submitLabel: "Submit",
				},
			});
			console.log("forms: created contact form");
		} else console.log("forms: contact form exists");
	} catch (error) {
		console.warn(`  ! contact form: ${error.message}`);
		process.exitCode = 1;
	}
}
