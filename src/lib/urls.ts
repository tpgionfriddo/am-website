export function withBase(value: string): string {
	if (!value.startsWith("/") || value.startsWith("//")) return value;
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	if (!base || value === base || value.startsWith(`${base}/`)) return value;
	return `${base}${value}`;
}

export function withoutBase(value: string): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	return base && (value === base || value.startsWith(`${base}/`)) ? value.slice(base.length) || "/" : value;
}

export function sanitizeHref(value: string | null | undefined): string | null {
	if (!value) return null;
	const href = value.trim();
	if (/[\u0000-\u001f\u007f\\]/.test(href)) return null;
	if (/^(?:https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(href)) return href;
	return null;
}
