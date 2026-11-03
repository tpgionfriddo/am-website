// Side-by-side composites of orig-* and new-* screenshots (dev tool).
import { chromium } from "playwright";
import fs from "node:fs";
const dir = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith("orig-"))) {
	const n = f.replace("orig-", "new-");
	if (!fs.existsSync(`${dir}/${n}`)) continue;
	const w = f.includes("-mob-") ? 340 : 690;
	const b64 = (x) => "data:image/png;base64," + fs.readFileSync(`${dir}/${x}`).toString("base64");
	await page.setContent(`<body style="margin:0;display:flex;gap:10px;background:#c00;align-items:flex-start"><img src="${b64(f)}" style="width:${w}px"><img src="${b64(n)}" style="width:${w}px"></body>`);
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${dir}/cmp-${f.slice(5)}`, fullPage: true });
}
await browser.close();
