import { createReader } from "@keystatic/core/reader";
import keystatic from "../../keystatic.config";
import taxonomies from "../content/taxonomies.json";
import { imageMetadata } from "./images";
import { site } from "../site.config";
import { withBase } from "./urls";

export type CollectionName = "pages" | "projects" | "posts";
export interface Entry { id: string; data: Record<string, any>; }
interface Filter { where?: Record<string, string | string[]>; orderBy?: Record<string, "asc" | "desc">; limit?: number; }

const reader = createReader(process.cwd(), keystatic);
const contentFiles = import.meta.glob("../content/{pages,projects,posts}/*.json", { eager: true });
const collections = new Map<CollectionName, Promise<Entry[]>>();

export function getTerms(name: string) {
	return taxonomies.find((taxonomy) => taxonomy.name === name)?.terms || [];
}

function normalizeLinks(value: any, key = ""): any {
	if (typeof value === "string" && ["url", "link_url"].includes(key)) return withBase(value);
	if (Array.isArray(value)) return value.map((item) => normalizeLinks(item));
	if (!value || typeof value !== "object" || value.constructor !== Object) return value;
	return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalizeLinks(item, name)]));
}

async function loadCollection(name: CollectionName): Promise<Entry[]> {
	if (import.meta.env.DEV) collections.delete(name);
	if (!collections.has(name)) collections.set(name, (async () => {
		const prefix = `../content/${name}/`;
		const slugs = Object.keys(contentFiles).filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length, -5));
		const entries = await Promise.all(slugs.map(async (slug) => ({ slug, entry: await reader.collections[name].readOrThrow(slug, { resolveLinkedFiles: true }) })));
		return entries.map(({ slug, entry }) => {
			const data = normalizeLinks(entry);
			const termNames = name === "projects" ? data.types || [] : data.categories || [];
			const taxonomy = name === "projects" ? "project_type" : "category";
			return { id: slug, data: { ...data, publishedAt: data.date, terms: { [taxonomy]: getTerms(taxonomy).filter((term) => termNames.includes(term.slug)) } } };
		});
	})());
	return collections.get(name)!;
}

export async function getCollection(name: CollectionName, filter: Filter = {}) {
	let entries = (await loadCollection(name)).filter((entry) => entry.data.status === "published");
	for (const [key, value] of Object.entries(filter.where || {})) {
		const choices = Array.isArray(value) ? value : [value];
		entries = entries.filter((entry) => (entry.data.terms?.[key] || []).some((term: { slug: string }) => choices.includes(term.slug)));
	}
	const order = Object.entries(filter.orderBy || {});
	entries = [...entries].sort((left, right) => {
		for (const [field, direction] of order) {
			const name = field === "published_at" ? "date" : field;
			const leftValue = left.data[name] ?? "";
			const rightValue = right.data[name] ?? "";
			const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
			if (comparison) return direction === "asc" ? comparison : -comparison;
		}
		return left.id.localeCompare(right.id);
	});
	return { entries: filter.limit === undefined ? entries : entries.slice(0, filter.limit) };
}

export async function getEntry(name: CollectionName, slug: string) {
	return { entry: (await getCollection(name)).entries.find((entry) => entry.id === slug) || null };
}

export function getSeoMeta(entry: Entry, { path }: { path: string; siteTitle?: string; siteUrl?: string }) {
	const source = imageMetadata(entry.data.featured_image);
	return { description: entry.data.seo?.description || entry.data.excerpt || site.tagline, canonical: entry.data.seo?.canonical || new URL(withBase(path), site.url).toString(), ogImage: source ? new URL(source.src, site.url).toString() : undefined };
}
