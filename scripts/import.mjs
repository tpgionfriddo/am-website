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
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "content.json"), "utf8"));

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

async function api(method, p, body) {
	const res = await fetch(`${API}${p}`, {
		method,
		headers: body && !(body instanceof FormData) ? { ...headers, "Content-Type": "application/json" } : headers,
		body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`${method} ${p}: ${res.status} ${text.slice(0, 300)}`);
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
let uploaded = 0;
const failed = [];
for (const [file, meta] of files) {
	if (mediaMap[file]) continue;
	const abs = path.join(ROOT, file);
	const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
	const form = new FormData();
	form.append("file", new Blob([fs.readFileSync(abs)], { type }), path.basename(file));
	if (meta.alt) form.append("alt", meta.alt);
	if (meta.width) form.append("width", String(meta.width));
	if (meta.height) form.append("height", String(meta.height));
	try {
		const { item } = await api("POST", "/media", form);
		mediaMap[file] = { id: item.id, url: item.url, storageKey: item.storageKey, width: item.width, height: item.height, mimeType: item.mimeType };
		uploaded++;
		if (uploaded % 25 === 0) {
			saveMap();
			console.log(`  uploaded ${uploaded}…`);
		}
	} catch (e) {
		failed.push(`${file}: ${e.message}`);
	}
}
saveMap();
console.log(`media: ${uploaded} uploaded, ${Object.keys(mediaMap).length}/${files.size} available`);
for (const f of failed) console.warn("  ! " + f);

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
for (const tax of seed.taxonomies ?? []) {
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
				if (!UPDATE) {
					skipped++;
					continue;
				}
				const current = await api("GET", `/content/${collection}/${found.id}`);
				await api("PUT", `/content/${collection}/${found.id}`, { data, seo, _rev: current.item?._rev ?? current._rev });
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
try {
	const list = await api("GET", "/plugins/emdash-forms/forms/list");
	const forms = list.items ?? list.forms ?? list;
	if (!Array.isArray(forms) || !forms.some((f) => f.slug === "contact")) {
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
} catch (e) {
	console.warn(`  ! contact form: ${e.message}`);
}
