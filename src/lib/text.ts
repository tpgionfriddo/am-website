import { sanitizeHref } from "emdash";

const escape = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Render a plain-text CMS field that may contain `[label](https://url)` links
 * and line breaks. Everything else is escaped. Blank lines start new paragraphs.
 */
export function renderText(text: string | null | undefined, { paragraphs = true } = {}): string {
	if (!text) return "";
	const inline = (line: string) =>
		escape(line).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
			const safe = sanitizeHref(href.replace(/&amp;/g, "&"));
			if (!safe) return label;
			const external = /^https?:\/\//i.test(safe) && !/architecturematters\.com\.au/i.test(safe);
			return `<a href="${escape(safe)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
		});
	const paras = text.trim().split(/\n\s*\n/);
	const html = paras.map((p) => p.split("\n").map(inline).join("<br />"));
	return paragraphs ? html.map((p) => `<p>${p}</p>`).join("") : html.join("<br /><br />");
}

/** Format a date as the theme did: 15.03.2023 */
export function formatDate(d: Date | string | null | undefined): string {
	if (!d) return "";
	const date = typeof d === "string" ? new Date(d) : d;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}
