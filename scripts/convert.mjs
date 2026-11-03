#!/usr/bin/env node
/**
 * Convert the Wayback Machine mirror (archive/) into structured EmDash content.
 *
 *   node scripts/convert.mjs            -> writes content/content.json
 *
 * Images are emitted as { $file: "archive/uploads/...", alt, width, height }
 * placeholders; scripts/import.mjs uploads them and swaps in media references.
 * Only text, links and images are extracted -- no scripts, styles or embeds --
 * so nothing from the (pre-hack) archive can carry executable content across.
 */
import * as cheerio from "cheerio";
import { imageSize } from "image-size";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ARCHIVE = path.join(ROOT, "archive");
const OUT = process.env.CONTENT_OUTPUT || path.join(ROOT, "content", "content.json");
const SITE = "https://architecturematters.com.au";

const warnings = [];
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------- helpers
let keyCounter = 0;
const key = () => `k${(++keyCounter).toString(36)}`;

const htmlPath = (p) => path.join(ARCHIVE, "html", p.replace(/^\/|\/$/g, "") || "_home", "index.html");
const load = (p) => {
	const f = htmlPath(p);
	return fs.existsSync(f) ? cheerio.load(fs.readFileSync(f, "utf8")) : null;
};
const isNewTheme = ($) => $ && $("body").attr("class")?.includes("wp-theme-rarchitecture");
const clean = (s) => (s ?? "").replace(/\u00a0/g, " ").replace(/[ \t\r\n]+/g, " ").trim();
const slugOf = (href) => {
	try {
		const u = new URL(href, SITE);
		if (!/architecturematters\.com\.au$/.test(u.hostname)) return null;
		return u.pathname.replace(/^\/|\/$/g, "");
	} catch {
		return null;
	}
};

// Internal links -> root-relative; uploads (PDFs etc.) -> $file placeholders resolved by importer.
function rewriteHref(href) {
	if (!href) return href;
	href = href.trim();
	const m = href.match(/^(?:https?:)?\/\/(?:www\.)?architecturematters\.com\.au(\/.*)?$/i);
	if (m) {
		const p = m[1] || "/";
		if (p.startsWith("/wp-content/uploads/")) return uploadRef(p) ?? href;
		return p;
	}
	if (href.startsWith("/wp-content/uploads/")) return uploadRef(href) ?? href;
	return href;
}

// ------------------------------------------------------------------ media
const manifest = JSON.parse(fs.readFileSync(path.join(ARCHIVE, "uploads-manifest.json"), "utf8"));
const SIZE_RE = /-(\d+)x(\d+)(\.\w+)$/;
const SCALED_RE = /-scaled(\.\w+)$/;

function uploadPath(url) {
	let p = url.replace(/^(?:https?:)?\/\/(?:www\.)?architecturematters\.com\.au/i, "").split("?")[0];
	try {
		p = decodeURI(p);
	} catch {}
	if (!p.startsWith("/wp-content/uploads/")) return null;
	const candidates = [p.replace(SIZE_RE, "$3"), p, p.replace(SCALED_RE, "$1")];
	for (const c of candidates) {
		const local = path.join(ARCHIVE, "uploads", c.replace("/wp-content/uploads/", ""));
		if (fs.existsSync(local) && fs.statSync(local).size > 0) return path.relative(ROOT, local);
	}
	return null;
}
function uploadRef(url) {
	const file = uploadPath(url);
	if (!file) {
		warn(`missing upload ${url}`);
		return null;
	}
	return `$file:${file}`;
}

function img($, el) {
	if (!el || !$(el).length) return null;
	const $el = $(el).is("img") ? $(el) : $(el).find("img").first();
	if (!$el.length) return null;
	// Prefer the largest srcset candidate's original, then src.
	const src = $el.attr("src") || $el.attr("data-src");
	const file = src && uploadPath(src);
	if (!file) {
		warn(`missing image ${src}`);
		return null;
	}
	let width, height;
	try {
		({ width, height } = imageSize(fs.readFileSync(path.join(ROOT, file))));
	} catch {}
	const alt = clean($el.attr("alt"));
	return { $file: file, alt: alt || undefined, width, height };
}

// --------------------------------------------------- HTML -> Portable Text
const INLINE_MARKS = { strong: "strong", b: "strong", em: "em", i: "em", u: "underline", s: "strike-through", del: "strike-through", code: "code" };
const BLOCK_STYLES = { p: "normal", h1: "h2", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6", blockquote: "blockquote" };

function htmlToPT($, root, { allowImages = false, baseStyle = "normal" } = {}) {
	const blocks = [];
	let current = null;

	const flush = () => {
		if (!current) return;
		// trim leading/trailing whitespace across spans, drop empty blocks
		const spans = current.children;
		while (spans.length && !spans[0].text.replace(/^\s+/, "")) spans.shift();
		while (spans.length && !spans[spans.length - 1].text.replace(/\s+$/, "")) spans.pop();
		if (spans.length) {
			spans[0].text = spans[0].text.replace(/^[ \t]+/, "");
			spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/\s+$/, "");
			for (const s of spans) s.text = s.text.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/[ \t]{2,}/g, " ");
			if (spans.some((s) => s.text.trim())) blocks.push(current);
		}
		current = null;
	};
	const start = (style, extra = {}) => {
		flush();
		current = { _type: "block", _key: key(), style, markDefs: [], children: [], ...extra };
	};
	const pushText = (text, marks) => {
		if (!current) start(baseStyle);
		text = text.replace(/\u00a0/g, " ").replace(/[\r\n\t ]+/g, " ");
		if (!text) return;
		const last = current.children[current.children.length - 1];
		if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += text;
		else current.children.push({ _type: "span", _key: key(), text, marks: [...marks] });
	};

	const walk = (node, marks, style, listInfo) => {
		if (node.type === "text") return pushText(node.data, marks);
		if (node.type !== "tag") return;
		const tag = node.name;
		const $n = $(node);
		if (["script", "style", "iframe", "svg", "noscript", "form", "button"].includes(tag)) return;
		if (/font-weight:\s*400\b/.test($n.attr("style") || "") && !marks.includes("regular")) marks = [...marks, "regular"];
		if (tag === "br") {
			if (!current) start(style);
			const last = current.children[current.children.length - 1];
			if (last) last.text += "\n";
			else current.children.push({ _type: "span", _key: key(), text: "\n", marks: [...marks] });
			return;
		}
		if (tag === "img") {
			if (!allowImages) return;
			const im = img($, node);
			if (im) {
				flush();
				blocks.push({ _type: "image", _key: key(), asset: { $file: im.$file }, alt: im.alt, width: im.width, height: im.height });
			}
			return;
		}
		if (INLINE_MARKS[tag] || (tag === "span" && /font-weight:\s*(bold|[6-9]00)/.test($n.attr("style") || ""))) {
			const m = INLINE_MARKS[tag] || "strong";
			$n.contents().each((_, c) => walk(c, marks.includes(m) ? marks : [...marks, m], style, listInfo));
			return;
		}
		if (tag === "a") {
			const href = rewriteHref($n.attr("href"));
			if (!href || href.startsWith("#")) {
				$n.contents().each((_, c) => walk(c, marks, style, listInfo));
				return;
			}
			if (!current) start(style);
			const def = { _type: "link", _key: key(), href };
			if ($n.attr("target") === "_blank") def.blank = true;
			current.markDefs.push(def);
			$n.contents().each((_, c) => walk(c, [...marks, def._key], style, listInfo));
			return;
		}
		if (tag === "ul" || tag === "ol") {
			flush();
			const listItem = tag === "ul" ? "bullet" : "number";
			const level = (listInfo?.level ?? 0) + 1;
			$n.children("li").each((_, li) => {
				start("normal", { listItem, level });
				$(li).contents().each((_, c) => {
					if (c.type === "tag" && (c.name === "ul" || c.name === "ol")) walk(c, marks, style, { level });
					else walk(c, marks, "normal", { level });
				});
				flush();
			});
			return;
		}
		if (BLOCK_STYLES[tag]) {
			const st = tag === "blockquote" ? "blockquote" : tag === "p" ? (style === "blockquote" ? "blockquote" : baseStyle) : BLOCK_STYLES[tag];
			if (tag === "blockquote") {
				flush();
				$n.contents().each((_, c) => walk(c, marks, "blockquote", listInfo));
				flush();
				return;
			}
			start(st);
			$n.contents().each((_, c) => walk(c, marks, st, listInfo));
			flush();
			return;
		}
		if (tag === "figure" || tag === "figcaption") {
			$n.contents().each((_, c) => walk(c, marks, style, listInfo));
			return;
		}
		// div, span, section, etc. -- transparent
		const isBlockish = ["div", "section", "article", "figure", "header", "footer", "main"].includes(tag);
		if (isBlockish) flush();
		$n.contents().each((_, c) => walk(c, marks, style, listInfo));
		if (isBlockish) flush();
	};

	$(root).contents().each((_, c) => walk(c, [], baseStyle, null));
	flush();
	return blocks;
}

// HTML -> plain text with [label](url) links and newlines (for repeater "text" sub-fields).
function htmlToMd($, root) {
	const out = [];
	const walk = (node, regular = false) => {
		if (node.type === "text") return out.push(node.data.replace(/\u00a0/g, " ").replace(/\s+/g, " "));
		if (node.type !== "tag") return;
		const $n = $(node);
		if (!regular && /font-weight:\s*400\b/.test($n.attr("style") || "")) {
			out.push("{% regular %}");
			$n.contents().each((_index, child) => walk(child, true));
			out.push("{% /regular %}");
			return;
		}
		if (node.name === "br") return out.push("\n");
		if (node.name === "a") {
			const href = rewriteHref($n.attr("href"));
			const text = clean($n.text());
			return out.push(href && text ? `[${text}](${href})` : text);
		}
		const block = ["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.name);
		if (block) out.push("\n\n");
		$n.contents().each((_, c) => walk(c, regular));
		if (block) out.push("\n\n");
	};
	$(root).contents().each((_, c) => walk(c));
	return out
		.join("")
		.split("\n")
		.map((l) => l.trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]+(\{% \/regular %\})(?=\n|$)/g, "$1")
		.trim();
}

// ------------------------------------------------------------ sections -> blocks
const blk = (type, data) => ({ _type: type, _version: 1, _key: key(), ...data });
const TYPE_PAGE_TO_TERM = {
	"community-architecture": "community",
	"education-architecture": "educational",
	"commercial-architecture": "specialised",
	"residential-architecture": "residential",
};
const projectOrder = new Map(); // project slug -> { order, types:Set }

function sectionToBlocks($, section, ctx) {
	const $s = $(section);
	const cls = ($s.attr("class") || "").split(/\s+/);
	const has = (c) => cls.includes(c);
	const texts = () => $s.find(".grid__text").toArray();

	if (has("share-post")) return [];
	if (has("project-info")) {
		const details = [];
		$s.find(".grid__details > div").each((_, d) => {
			const label = clean($(d).children("h5").text());
			const valueEl = $(d).children().not("h5");
			const value = valueEl
				.toArray()
				.map((v) => htmlToMd($, v))
				.join("\n")
				.trim();
			if (label && value) details.push({ label, value });
		});
		return [blk("project_info", { details, text: htmlToPT($, $s.find(".grid__text").first()) })];
	}
	if (has("full-width-image")) {
		const image = img($, $s.find("img").first());
		return image ? [blk("image_full", { image })] : [];
	}
	if (has("two-thirds-image") || has("two-thirds-image-right")) {
		const image = img($, $s.find("img").first());
		return image ? [blk("image_two_thirds", { image, align: has("two-thirds-image-right") ? "right" : "left" })] : [];
	}
	if (has("two-columns-image")) {
		const imgs = $s.find("img").toArray().map((i) => img($, i)).filter(Boolean);
		if (imgs.length >= 2) return [blk("image_pair", { image_left: imgs[0], image_right: imgs[1] })];
		return imgs.map((image) => blk("image_full", { image }));
	}
	if (has("two-columns-image-text") && $s.find(".swiper-text").length) {
		const slides = $s
			.find(".swiper-text .swiper-slide")
			.toArray()
			.map((sl) => ({ text: htmlToMd($, sl) }))
			.filter((x) => x.text);
		return [
			blk("story", {
				heading: clean($s.children("h2").first().text()) || undefined,
				image: img($, $s.find(".grid__image img").first()) ?? undefined,
				intro: clean($s.find(".grid__text > div").first().text()) || undefined,
				slides,
			}),
		];
	}
	if (has("two-columns-text-image") || has("two-columns-image-text")) {
		const grid = $s.find(".grid").first();
		const first = grid.children().first();
		const image = img($, $s.find(".grid__image img").first());
		const text = htmlToPT($, $s.find(".grid__text").first());
		if (!image) return text.length ? [blk("text_columns", { left: text, right: [] })] : [];
		return [blk("text_image", { text, image, image_side: first.hasClass("grid__image") ? "left" : "right" })];
	}
	if (has("block-quote")) {
		return [blk("quote", { text: htmlToPT($, $s.find("blockquote").first(), { baseStyle: "normal" }) })];
	}
	if (has("two-columns-text")) {
		const [l, r] = texts();
		const left = l ? htmlToPT($, l) : [];
		const right = r ? htmlToPT($, r) : [];
		if (!left.length && !right.length) return [];
		return [blk("text_columns", { left, right })];
	}
	if (has("project-carousel")) {
		const images = $s.find(".swiper-slide img").toArray().map((i) => img($, i)).filter(Boolean).map((image) => ({ image }));
		return images.length ? [blk("carousel", { images })] : [];
	}
	if (has("principals")) {
		const people = $s
			.find(".principals__wrapper > .grid")
			.toArray()
			.map((g) => ({
				image: img($, $(g).find(".principals__image img")) ?? undefined,
				name: clean($(g).find(".principals__name").text()),
				title: clean($(g).find(".principals__designation").text()) || undefined,
				bio: htmlToMd($, $(g).find(".principals__text")) || undefined,
			}))
			.filter((p) => p.name);
		return [blk("principals", { heading: clean($s.find("h2").first().text()) || undefined, people })];
	}
	if (has("our-team")) {
		const people = $s
			.find(".team__wrapper")
			.toArray()
			.map((w) => {
				const id = $(w).attr("data-id");
				const content = $s.find(`.team__content[data-target="${id}"]`);
				const bioEl = content.children("div").eq(1);
				return {
					image: img($, $(w).find(".team__image img")) ?? undefined,
					name: clean($(w).find(".team__name").first().text()),
					position: clean($(w).find(".team__position").first().text()) || undefined,
					bio: bioEl.length ? htmlToMd($, bioEl) || undefined : undefined,
				};
			})
			.filter((p) => p.name);
		return [blk("team", { heading: clean($s.find("h2").first().text()) || undefined, people })];
	}
	if (has("awards")) {
		const items = $s
			.find("a.awards__link, .awards__wrapper > div.awards__item")
			.toArray()
			.map((a) => ({
				award: clean($(a).find(".awards__award").text()),
				project: clean($(a).find(".awards__project").text()) || undefined,
				category: clean($(a).find(".awards__category").text()) || undefined,
				year: clean($(a).find(".awards__year").text()) || undefined,
				url: (() => {
					const href = $(a).attr("href");
					const m = href?.match(/[?&]projects=([a-z0-9-]+)/);
					return m ? `/project/${m[1]}/` : href ? rewriteHref(href) : undefined;
				})(),
			}))
			.filter((x) => x.award);
		return [blk("awards", { heading: clean($s.find("h2").first().text()) || undefined, items })];
	}
	if (has("accordion-section")) {
		const items = $s
			.find(".accordion__item")
			.toArray()
			.map((it) => {
				const id = $(it).find(".accordion__button").attr("data-id");
				return {
					title: clean($(it).find(".accordion__button span").first().text()),
					text: htmlToMd($, $(it).find(".accordion__content")) || undefined,
					image: img($, $s.find(`#accordion-image-${id} img`)) ?? undefined,
				};
			});
		return [blk("accordion", { heading: clean($s.children("h2").first().text()) || undefined, items })];
	}
	if (has("project-list")) {
		const term = TYPE_PAGE_TO_TERM[ctx.slug];
		$s.find("a.block-loop__link").each((i, a) => {
			const slug = slugOf($(a).attr("href"))?.replace(/^project\//, "");
			if (!slug) return;
			const entry = projectOrder.get(slug) ?? { order: i, types: new Set(), thumb: null };
			if (term) entry.types.add(term);
			entry.order = Math.min(entry.order, i);
			entry.thumb ??= $(a).find("img").attr("src");
			projectOrder.set(slug, entry);
		});
		if (!term) warn(`project-list on ${ctx.slug} without known type`);
		return term ? [blk("project_list", { project_type: term })] : [];
	}
	if (has("logos")) {
		const logos = $s
			.find(".swiper-slide img")
			.toArray()
			.map((i) => ({ image: img($, i), name: clean($(i).attr("alt")) || undefined }))
			.filter((l) => l.image);
		return logos.length ? [blk("logos", { logos })] : [];
	}
	if (has("related-news")) {
		return [blk("related_news", { heading: clean($s.find("h2").first().text()) || "Practice News", count: 3, category: TYPE_PAGE_TO_TERM[ctx.slug] })];
	}
	if (has("contact-form")) {
		const contact = $s.find(".grid__contact").first();
		const phone = clean(contact.find('a[href^="tel:"]').text());
		const email = clean(contact.find('a[href^="mailto:"]').text());
		const heads = $s.find(".grid__contact h5").toArray();
		const after = (label) => {
			const h = heads.find((h) => clean($(h).text()).toLowerCase().startsWith(label));
			return h ? htmlToMd($, $(h).next()) : undefined;
		};
		return [
			blk("contact", {
				phone,
				email,
				street_address: after("street"),
				mailing_address: after("mailing"),
				statement: clean($s.find("h3").first().text()) || undefined,
				show_form: $s.find("form").length > 0,
			}),
		];
	}
	if (has("text-editor")) {
		const pt = htmlToPT($, $s);
		return pt.length ? [blk("text_columns", { left: [], right: pt })] : [];
	}
	warn(`unhandled section ${cls.join(" ")} on ${ctx.slug}`);
	return [];
}

const sectionsOf = ($, scope, ctx) =>
	$(scope)
		.find("section.block")
		.filter((_, s) => !$(s).parents("section.block").length)
		.toArray()
		.flatMap((s) => sectionToBlocks($, s, ctx));

// -------------------------------------------------------------- JSON lookups
function readJsonDir(dir) {
	const d = path.join(ARCHIVE, "json", dir);
	if (!fs.existsSync(d)) return [];
	return fs
		.readdirSync(d)
		.filter((f) => f.endsWith(".json"))
		.map((f) => {
			try {
				return JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
			} catch {
				return null;
			}
		})
		.filter((x) => x && x.slug);
}
const bySlug = (arr) => new Map(arr.map((x) => [x.slug, x]));
const jsonPages = bySlug(readJsonDir("pages"));
const jsonPosts = bySlug(readJsonDir("posts"));
const jsonProjects = bySlug(readJsonDir("projects"));
const yoast = (j) => {
	const y = j?.yoast_head_json;
	if (!y) return undefined;
	const seo = {};
	if (y.title) seo.title = y.title.replace(/\s*[-|–]\s*Architecture Matters\s*$/, "").trim() || undefined;
	if (y.description) seo.description = y.description;
	return Object.keys(seo).length ? seo : undefined;
};

// ------------------------------------------------------------------- pages
const content = { pages: [], projects: [], posts: [] };

{
	const $ = load("/");
	const slides = $(".swiper-home__slide img").toArray().map((i) => ({ image: img($, i) })).filter((s) => s.image);
	content.pages.push({
		slug: "home",
		title: "Home",
		seo: { description: "Architecture Matters is a Melbourne-based architecture practice designing buildings that matter for people that matter." },
		layout: [
			blk("hero_slider", {
				title: clean($(".home-screen__title").text()) || "Buildings that matter for people that matter",
				link_url: rewriteHref($(".home-screen__arrow").attr("href")) || "/australian-architecture/",
				slides,
			}),
		],
	});
}

const PAGE_SLUGS = [
	"melbourne-based-architects",
	"architectural-services",
	"contact-us",
	"australian-architecture/community-architecture",
	"australian-architecture/education-architecture",
	"australian-architecture/commercial-architecture",
	"australian-architecture/residential-architecture",
];
for (const p of PAGE_SLUGS) {
	const $ = load(p);
	if (!isNewTheme($)) {
		warn(`page ${p} not in archive`);
		continue;
	}
	const slug = p.split("/").pop();
	content.pages.push({
		slug,
		title: clean($("h1.entry-title").first().text()),
		featured_image: img($, $(".entry-header > img, .entry-header img.wp-post-image").first()) ?? undefined,
		seo: yoast(jsonPages.get(slug)),
		layout: sectionsOf($, $(".entry-content").first(), { slug }),
	});
}

{
	const $ = load("australian-architecture");
	const items = $(".our-projects__item")
		.toArray()
		.map((it) => ({
			title: clean($(it).find(".our-projects__title").text()),
			url: rewriteHref($(it).find("a").attr("href")),
			image: img($, $(it).find("img")) ?? undefined,
		}));
	content.pages.push({
		slug: "australian-architecture",
		title: clean($(".our-projects h1").first().text()) || "Our Projects",
		seo: yoast(jsonPages.get("australian-architecture")),
		layout: [blk("project_types", { items })],
	});
}

{
	const $ = load("architectural-news");
	content.pages.push({
		slug: "architectural-news",
		title: clean($(".site-blog h1, main h1").first().text()) || "Practice News",
		seo: yoast(jsonPages.get("architectural-news")),
		layout: [],
	});
}

// ---------------------------------------------------------------- projects
const projectDirs = fs.readdirSync(path.join(ARCHIVE, "html", "project"));
// Duplicate of norwood-crescent-office-refurbishment (redirected in seed.json)
const SKIP_PROJECTS = new Set(["norwood-crescentoffice-refurbishment"]);
for (const slug of projectDirs) {
	if (SKIP_PROJECTS.has(slug)) continue;
	const $ = load(`project/${slug}`);
	if (!$) continue;
	const linked = projectOrder.has(slug);
	if (!isNewTheme($)) {
		if (linked) {
			const p = convertLegacyProject($, slug);
			if (p) content.projects.push(p);
		}
		continue;
	}
	const j = jsonProjects.get(slug);
	const article = $("article").first();
	const tagTypes = (article.attr("class") || "").match(/tag-([a-z-]+)/g)?.map((t) => t.slice(4)) ?? [];
	const order = projectOrder.get(slug);
	const types = new Set([...(order?.types ?? []), ...tagTypes]);
	content.projects.push({
		slug,
		title: clean($("h1.entry-title").first().text()),
		featured_image: img($, $(".entry-thumbnail img").first()) ?? undefined,
		thumbnail: order?.thumb ? (img($, cheerio.load(`<img src="${order.thumb}">`)("img")) ?? undefined) : undefined,
		sort_order: order ? order.order : (j?.menu_order ?? 100),
		types: [...types],
		date: j?.date,
		seo: yoast(j),
		layout: sectionsOf($, $(".entry-content").first(), { slug }),
	});
}
for (const slug of projectOrder.keys()) {
	if (!content.projects.some((p) => p.slug === slug)) warn(`project ${slug} linked but not archived`);
}

// Project pages whose HTML was only archived with the 2018 theme. Their WordPress
// REST JSON (captured 2025) holds the current block content, so build from that.
function convertLegacyProject(_$, slug) {
	const order = projectOrder.get(slug);
	const j = jsonProjects.get(slug);
	if (!j?.content?.rendered) {
		warn(`project ${slug} only archived with the 2018 theme and no JSON; skipped`);
		return null;
	}
	const $ = cheerio.load(`<div class="entry-content">${j.content.rendered}</div>`);
	const og = j.yoast_head_json?.og_image?.[0]?.url;
	return {
		slug,
		title: clean(cheerio.load(j.title.rendered).text()),
		featured_image: og ? (img($, cheerio.load(`<img src="${og}">`)("img")) ?? undefined) : undefined,
		thumbnail: order?.thumb ? (img($, cheerio.load(`<img src="${order.thumb}">`)("img")) ?? undefined) : undefined,
		sort_order: order?.order ?? j.menu_order ?? 100,
		types: [...(order?.types ?? [])],
		date: j.date,
		seo: yoast(j),
		layout: sectionsOf($, $(".entry-content").first(), { slug }),
	};
}

// -------------------------------------------------------------------- posts
const postMeta = new Map(); // slug -> { date, categories, thumb }
for (const listPage of ["architectural-news", "architectural-news/page/2"]) {
	const $ = load(listPage);
	if (!$) continue;
	$(".blog-post").each((_, bp) => {
		const a = $(bp).find("a.blog-post__link").first();
		const slug = slugOf(a.attr("href"));
		if (!slug) return;
		const [date, cats] = $(bp).find(".blog-post__meta span").toArray().map((s) => clean($(s).text()));
		postMeta.set(slug, { date, cats, thumb: $(bp).find(".blog-post__img img").attr("src") });
	});
}
const parseDmy = (s) => {
	const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
	return m ? `${m[3]}-${m[2]}-${m[1]}T09:00:00` : undefined;
};

for (const dir of fs.readdirSync(path.join(ARCHIVE, "html"))) {
	const $ = load(dir);
	if (!isNewTheme($) || !$("body").hasClass("single-post")) continue;
	const slug = dir;
	const j = jsonPosts.get(slug);
	const meta = postMeta.get(slug);
	const article = $("article").first();
	const categories = (article.attr("class") || "").match(/category-([a-z-]+)/g)?.map((c) => c.slice(9)) ?? [];
	const body = [];
	$(".single-post__content section.block").each((_, s) => {
		const $s = $(s);
		if ($s.hasClass("share-post")) return;
		if ($s.hasClass("news-image")) {
			const im = img($, $s.find("img").first());
			// "wide" marks the theme's offset (bleeds left) news image
			const alignment = $s.hasClass("news-image--offset") ? "wide" : undefined;
			if (im) body.push({ _type: "image", _key: key(), asset: { $file: im.$file }, alt: im.alt, width: im.width, height: im.height, alignment });
			return;
		}
		if ($s.hasClass("news-block-quote")) {
			for (const b of htmlToPT($, $s.find("blockquote").first())) body.push({ ...b, style: "blockquote" });
			return;
		}
		body.push(...htmlToPT($, $s, { allowImages: true }));
	});
	const firstPara = body.find((b) => b._type === "block" && b.style === "normal");
	const excerpt =
		yoast(j)?.description ||
		(firstPara ? firstPara.children.map((c) => c.text).join("").slice(0, 240) : undefined);
	content.posts.push({
		slug,
		title: clean($("h1.entry-title").first().text()),
		date: j?.date || parseDmy(meta?.date),
		featured_image: img($, $(".entry-thumbnail img").first()) ?? undefined,
		categories,
		excerpt,
		seo: yoast(j),
		content: body,
	});
}

// -------------------------------------------------------------------- write
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(content, null, 1));
const files = new Set(JSON.stringify(content).match(/archive\/uploads\/[^"]+/g));
console.log(
	`pages ${content.pages.length}, projects ${content.projects.length}, posts ${content.posts.length}, images/files ${files.size}`,
);
if (warnings.length) {
	console.log(`\n${warnings.length} warnings:`);
	for (const w of [...new Set(warnings)]) console.log("  - " + w);
}
