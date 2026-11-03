import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = JSON.parse(fs.readFileSync(process.env.CONTENT_SOURCE || path.join(root, "content/content.json"), "utf8"));
const seed = JSON.parse(fs.readFileSync(path.join(root, "seed/seed.json"), "utf8"));
const output = process.env.CONTENT_DIRECTORY || path.join(root, "src/content");
const media = new Map();
let contentSlug;

function write(relative, value) {
	const destination = path.join(output, relative);
	if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite ${destination}`);
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.writeFileSync(destination, `${JSON.stringify(value, null, "\t")}\n`);
}

function mediaPath(file) {
	const relative = file.replace(/^archive\/uploads\//, "");
	const destination = /\.(?:jpg|jpeg|png|gif|webp|avif|svg)$/i.test(file)
		? `/src/assets/media/${contentSlug}/${relative}`
		: `/media/${relative}`;
	media.set(destination, file);
	return destination;
}

function resolveFiles(value) {
	if (typeof value === "string") return value.replace(/\$file:(archive\/uploads\/[^)\s]+)/g, (_match, file) => mediaPath(file));
	if (Array.isArray(value)) return value.map(resolveFiles);
	if (!value || typeof value !== "object") return value;
	if (value.$file) return { src: mediaPath(value.$file), alt: value.alt || "", width: value.width, height: value.height };
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveFiles(item)]));
}

const escapeMarkdown = (text) => text.replace(/([\\`*_[\]<>])/g, "\\$1");

function richText(blocks) {
	return (blocks || []).map((block) => {
		if (block._type === "image") {
			const file = block.asset?.$file;
			if (!file) throw new Error("Missing rich-text image file");
			if (block.alignment === "wide") return `{% wideImage src=${JSON.stringify(mediaPath(file))} alt=${JSON.stringify(block.alt || "")} /%}`;
			return `![${escapeMarkdown(block.alt || "")}](${mediaPath(file)})`;
		}
		if (block._type !== "block") throw new Error(`Unsupported rich-text block: ${block._type}`);
		const text = (block.children || []).map((span) => {
			let rendered = escapeMarkdown(span.text || "").replace(/\n/g, "  \n");
			for (const mark of span.marks || []) {
				if (mark === "strong") rendered = `**${rendered}**`;
				else if (mark === "em") rendered = `*${rendered}*`;
				else if (mark === "code") rendered = `\`${rendered}\``;
				else if (mark === "strike-through") rendered = `~~${rendered}~~`;
				else {
					const link = block.markDefs?.find((definition) => definition._key === mark);
					if (link?._type === "link") rendered = `[${rendered}](${resolveFiles(link.href)})`;
				}
			}
			return span.marks?.includes("regular") ? `{% regular %}${rendered}{% /regular %}` : rendered;
		}).join("");
		if (block.listItem) return `${"  ".repeat(Math.max(0, (block.level || 1) - 1))}${block.listItem === "number" ? "1." : "-"} ${text}`;
		if (/^h[1-6]$/.test(block.style)) return `${"#".repeat(Number(block.style.slice(1)))} ${text}`;
		if (block.style === "blockquote") return `> ${text.replace(/\n/g, "\n> ")}`;
		return text;
	}).join("\n\n");
}

const blockTypes = seed.blockTypes.map((block) => ({ slug: block.slug, label: block.label, fields: block.versions.at(-1).fields }));
const definitions = Object.fromEntries(blockTypes.map((block) => [block.slug, block]));

function fieldValues(value, definitions) {
	return Object.fromEntries(definitions.map((field) => {
		const current = value[field.slug];
		if (field.type === "portableText") return [field.slug, richText(current)];
		if (field.type === "repeater") return [field.slug, (current || []).map((item) => fieldValues(item, field.validation.subFields))];
		return [field.slug, resolveFiles(current)];
	}));
}

write("block-schema.json", blockTypes);
write("taxonomies.json", seed.taxonomies.map(({ name, label, terms }) => ({ name, label, terms })));
write("redirects.json", seed.redirects.filter((redirect) => redirect.enabled));

for (const collection of ["pages", "projects", "posts"]) {
	for (const entry of source[collection]) {
		contentSlug = entry.slug;
		const { slug, layout, content, ...rest } = entry;
		const result = { ...resolveFiles(rest), status: collection === "posts" ? "draft" : "published" };
		if (layout) result.layout = layout.map((block) => ({ discriminant: block._type, value: fieldValues(block, definitions[block._type].fields) }));
		if (content) result.content = richText(content);
		write(`${collection}/${slug}.json`, result);
	}
}

for (const [destination, file] of process.env.SKIP_MEDIA_COPY === "1" ? [] : media) {
	const relative = destination.startsWith("/src/") ? destination.slice(1) : `public${destination}`;
	const target = path.join(root, relative);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(path.join(root, file), target);
}

console.log(`Migrated ${source.pages.length} pages, ${source.projects.length} projects, ${source.posts.length} draft articles, and ${media.size} local assets.`);
