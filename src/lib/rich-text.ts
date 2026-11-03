import Markdoc, { type RenderableTreeNode } from "@markdoc/markdoc";

export function richTextNodes(value: any): RenderableTreeNode[] {
	const node = value?.node ?? (typeof value === "string" ? Markdoc.parse(value) : null);
	if (!node) return [];
	const rendered = Markdoc.transform(node, {
		tags: {
			regular: { render: "regular", inline: true, attributes: {} },
			wideImage: {
				render: "wide-image",
				selfClosing: true,
				attributes: { src: { type: String, required: true }, alt: { type: String, default: "" } },
			},
		},
	});
	if (Markdoc.Tag.isTag(rendered) && rendered.name === "article") return rendered.children;
	return Array.isArray(rendered) ? rendered : [rendered];
}
