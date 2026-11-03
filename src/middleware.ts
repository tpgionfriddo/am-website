/**
 * Setup-wizard guard.
 *
 * Until an admin exists, EmDash lets the first visitor to the setup wizard
 * become the administrator. On a public URL that's a race, so the wizard and
 * its API only respond to a browser that has presented the SETUP_KEY secret:
 *
 *   https://<site>/_emdash/admin/setup?setup_key=<SETUP_KEY>
 *
 * Without SETUP_KEY configured the wizard is unreachable (fail closed), so after
 * setup the secret can be deleted: `wrangler secret delete SETUP_KEY`.
 * Skipped in local development (the dev-bypass route needs it open).
 */
import { defineMiddleware } from "astro:middleware";

const COOKIE = "am_setup_key";
const GUARDED = ["/_emdash/admin/setup", "/_emdash/api/setup"];

async function setupKey(): Promise<string | undefined> {
	try {
		const { env } = await import("cloudflare:workers");
		return (env as Record<string, unknown>).SETUP_KEY as string | undefined;
	} catch {
		return undefined;
	}
}

function equal(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname, searchParams } = context.url;
	if (import.meta.env.DEV || !GUARDED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
		return next();
	}

	const key = await setupKey();
	const offered = searchParams.get("setup_key") ?? context.cookies.get(COOKIE)?.value ?? "";
	if (!key || key.length < 16 || !equal(offered, key)) {
		return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
	}
	if (searchParams.has("setup_key")) {
		context.cookies.set(COOKIE, key, { path: "/_emdash", httpOnly: true, secure: true, sameSite: "strict", maxAge: 3600 });
	}
	return next();
});
