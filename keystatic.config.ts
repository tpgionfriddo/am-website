import { collection, config, fields, singleton } from "@keystatic/core";
import { block, mark } from "@keystatic/core/content-components";
import { createElement } from "react";
import blockDefinitions from "./src/content/block-schema.json";
import taxonomies from "./src/content/taxonomies.json";

type FieldDefinition = {
	slug: string;
	label: string;
	type: string;
	required?: boolean;
	validation?: { options?: string[]; subFields?: FieldDefinition[] };
};

const mediaDirectory = { directory: "src/assets/media", publicPath: "/src/assets/media/" };
const regular = mark({ label: "Regular weight (400)", icon: createElement("span", null, "400"), schema: {}, tag: "span", style: { fontWeight: "400" } });
const richText = (label: string) => fields.markdoc.inline({ label, options: { image: mediaDirectory }, components: {
	regular,
} });
const articleBody = fields.markdoc.inline({ label: "Article body", options: { image: mediaDirectory }, components: {
	regular,
	wideImage: block({
		label: "Wide image",
		description: "An article image extending to the left of the text column on desktop.",
		schema: { src: fields.image({ label: "Image", ...mediaDirectory }), alt: fields.text({ label: "Alternative text" }) },
	}),
} });
const image = (label: string) => fields.object({
	src: fields.image({ label: "Image", ...mediaDirectory }),
	alt: fields.text({ label: "Alternative text" }),
	width: fields.integer({ label: "Original width" }),
	height: fields.integer({ label: "Original height" }),
}, { label });

function field(definition: FieldDefinition): ReturnType<typeof fields.text> | ReturnType<typeof fields.object> | ReturnType<typeof fields.array> | ReturnType<typeof fields.markdoc.inline> | ReturnType<typeof fields.select> | ReturnType<typeof fields.checkbox> | ReturnType<typeof fields.integer> {
	const { label } = definition;
	switch (definition.type) {
		case "image": return image(label);
		case "portableText": return richText(label);
		case "boolean": return fields.checkbox({ label });
		case "integer": return fields.integer({ label });
		case "select": return fields.select({ label, options: [{ label: "None", value: "" }, ...(definition.validation?.options || []).map((value) => ({ label: value, value }))], defaultValue: "" });
		case "repeater": return fields.array(fields.object(schema(definition.validation?.subFields || [])), { label, itemLabel: (props) => {
			const name = props.fields.name || props.fields.title;
			return name && "value" in name ? String(name.value || "Item") : "Item";
		} });
		default: return fields.text({ label, multiline: definition.type === "text", validation: { isRequired: definition.required } });
	}
}

function schema(definitions: FieldDefinition[]) {
	return Object.fromEntries(definitions.map((definition) => [definition.slug, field(definition)]));
}

const variants = Object.fromEntries(blockDefinitions.map((block) => [block.slug, { label: block.label, schema: fields.object(schema(block.fields)) }]));
const layout = (maximum: number) => fields.blocks(variants, { label: "Page sections", validation: { length: { max: maximum } } });
const seo = fields.object({
	title: fields.text({ label: "Search title" }),
	description: fields.text({ label: "Search description", multiline: true }),
	canonical: fields.text({ label: "Canonical URL override" }),
}, { label: "Search and sharing" });
const common = () => ({
	title: fields.slug({ name: { label: "Title", validation: { isRequired: true } } }),
	status: fields.select({ label: "Publication status", options: [{ label: "Draft", value: "draft" }, { label: "Published", value: "published" }], defaultValue: "draft" }),
	featured_image: image("Banner image"),
	seo,
});
const options = (taxonomy: string) => taxonomies.find((item) => item.name === taxonomy)!.terms.map((term) => ({ label: term.label, value: term.slug }));

export default config({
	storage: { kind: "local" },
	ui: { brand: { name: "Architecture Matters" } },
	collections: {
		pages: collection({ label: "Pages", slugField: "title", path: "src/content/pages/*", format: { data: "json" }, schema: { ...common(), layout: layout(40) } }),
		projects: collection({ label: "Projects", slugField: "title", path: "src/content/projects/*", format: { data: "json" }, schema: { ...common(), thumbnail: image("Project-list thumbnail"), sort_order: fields.integer({ label: "Display order", defaultValue: 0 }), date: fields.text({ label: "Original publication date" }), types: fields.multiselect({ label: "Project types", options: options("project_type") }), layout: layout(60) } }),
		posts: collection({ label: "Articles", slugField: "title", path: "src/content/posts/*", format: { data: "json" }, schema: { ...common(), date: fields.text({ label: "Publication date (ISO format)" }), categories: fields.multiselect({ label: "Categories", options: options("category") }), excerpt: fields.text({ label: "Excerpt", multiline: true }), content: articleBody } }),
	},
	singletons: {
		settings: singleton({ label: "Site settings", path: "src/content/settings", format: { data: "json" }, schema: {
			name: fields.text({ label: "Site name" }), legalName: fields.text({ label: "Legal name" }), tagline: fields.text({ label: "Tagline" }), url: fields.text({ label: "Production URL" }), phone: fields.text({ label: "Phone" }), phoneHref: fields.text({ label: "Telephone link" }), email: fields.text({ label: "Email" }), address: fields.array(fields.text({ label: "Address line" }), { label: "Address" }), poBox: fields.text({ label: "Postal address" }), acknowledgement: fields.text({ label: "Acknowledgement of Country", multiline: true }),
			social: fields.array(fields.object({ name: fields.select({ label: "Network", options: ["facebook", "instagram", "linkedin", "houzz", "youtube"].map((value) => ({ label: value, value })), defaultValue: "instagram" }), url: fields.text({ label: "URL" }) }), { label: "Social links", itemLabel: (props) => props.fields.name.value }),
			menu: fields.array(fields.object({ label: fields.text({ label: "Label" }), url: fields.text({ label: "Link" }) }), { label: "Navigation", itemLabel: (props) => props.fields.label.value }),
		} }),
	},
});
