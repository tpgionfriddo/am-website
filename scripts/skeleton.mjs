// Dev tool: print the tag/class skeleton of each top-level section, for comparing
// the archived original with the rebuild.  node scripts/skeleton.mjs <file-or-url> [selector]
import * as cheerio from "cheerio";
import fs from "node:fs";
const [src, scope = "main"] = process.argv.slice(2);
const html = /^https?:/.test(src) ? await (await fetch(src)).text() : fs.readFileSync(src, "utf8");
const $ = cheerio.load(html);
const skel = (el, depth) => {
	if (depth > 5) return "";
	const kids = $(el).children().toArray().filter((c) => !["svg", "script", "style", "br", "span", "strong", "b", "em", "a", "p"].includes(c.tagName) || c.tagName === "a");
	const cls = ($(el).attr("class") || "").split(/\s+/).filter((c) => c && !/^(attachment|size-|wp-|post-|type-|status-|hentry|has-post|tag-|category-|projects$|format)/.test(c)).join(".");
	const self = `${el.tagName}${cls ? "." + cls : ""}`;
	const uniq = [];
	for (const k of kids.map((k) => skel(k, depth + 1))) if (uniq[uniq.length - 1] !== k) uniq.push(k);
	return uniq.length ? `${self}{${uniq.join(" ")}}` : self;
};
$(scope).find("section").filter((_, s) => !$(s).parents("section").length).each((_, s) => console.log(skel(s, 0)));
