import puppeteer from "puppeteer";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || "test-photos";
const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).map((f) => join(process.cwd(), dir, f));

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 120), r.failure()?.errorText));
page.on("response", (r) => { if (r.url().includes("tfjs") || r.url().includes("model")) console.log("[resp]", r.status(), r.url().slice(0, 120)); });

await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 60000 });

const input = await page.$('input[type="file"]');
await input.uploadFile(...files);
console.log("uploaded");
await new Promise((r) => setTimeout(r, 8000));
console.log("body:\n" + await page.evaluate(() => document.body.innerText.slice(0, 600)));
await browser.close();
