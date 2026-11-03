import { chromium } from "playwright";
const [, , mode, outDir, ...pages] = process.argv;
const browser = await chromium.launch({ channel: "chrome" });
for (const vp of [{ name: "desk", width: 1440, height: 900 }, { name: "mob", width: 390, height: 844, isMobile: true }]) {
	const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile });
	await ctx.addInitScript(() => { try { sessionStorage.setItem("ack-dismissed", "1"); } catch {} });
	const page = await ctx.newPage();
	for (const p of pages) {
		const url = mode === "orig" ? `https://web.archive.org/web/20260713id_/https://architecturematters.com.au${p}`.replace("id_", "if_") : `http://localhost:4321${p}`;
		try {
			await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
		} catch (e) { console.log("timeout", url); }
		await page.addStyleTag({ content: ".modal{display:none!important} #wm-ipp-base,#wm-ipp,#donato{display:none!important} .block-animate{opacity:1!important;transform:none!important}" });
		await page.evaluate(async () => {
			document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager"));
			for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
			window.scrollTo(0, 0);
			await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
		});
		await page.waitForTimeout(1500);
		const name = `${mode}-${vp.name}-${p.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "home"}.png`;
		await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
		console.log(name);
	}
	await ctx.close();
}
await browser.close();
