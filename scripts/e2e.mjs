/**
 * End-to-end test: drive the real app in headless Chrome, upload the
 * test-photos folder via the local-folder picker, and report the stacks
 * the UI actually produced (plus any console errors).
 */
import puppeteer from "puppeteer";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || "test-photos";
const files = readdirSync(dir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .map((f) => join(process.cwd(), dir, f));

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));

await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 60000 });

// Chrome's DOM.setFileInputFiles ignores webkitdirectory inputs, so strip the
// attribute first (the app only uses it to open a folder picker in the UI).
await page.evaluate(() => {
  const i = document.querySelector('input[type="file"]');
  i.removeAttribute("webkitdirectory");
  i.removeAttribute("directory");
});
const client = await page.createCDPSession();
const { root } = await client.send("DOM.getDocument");
const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
await client.send("DOM.setFileInputFiles", { files, nodeId });
await page.evaluate(() => {
  const i = document.querySelector('input[type="file"]');
  i.dispatchEvent(new Event("change", { bubbles: true }));
});
console.log(`Uploaded ${files.length} files. Scanning (model download may take a bit)…`);

// Wait for scan to finish: the results panel appears ("Matching sensitivity")
let done = false;
try {
  for (let t = 0; t < 60 && !done; t++) {
    try {
      await page.waitForSelector("#lvl", { timeout: 5000 });
      done = true;
    } catch {
      const progress = await page.evaluate(() =>
        [...document.querySelectorAll(".muted")].map((e) => e.textContent).join(" | ").slice(0, 200)
      );
      console.log(`[${(t + 1) * 5}s] still scanning: ${progress}`);
    }
  }
} catch { }
if (done) {
  // fall through to results below
}
if (!done) {
  console.log("FAIL: scan never finished (no results panel).");
  const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("Body text:\n" + body);
  console.log("Console errors:\n" + errors.join("\n"));
  await browser.close();
  process.exit(1);
}

const result = await page.evaluate(() => {
  const warn = document.querySelector(".error")?.textContent || null;
  const sections = [...document.querySelectorAll(".solo")].map((sEl) => {
    const cards = [...sEl.parentElement.querySelectorAll(".grid .card")];
    return {
      heading: sEl.textContent,
      // run before next .solo... approximate: gather from sibling grid after heading
    };
  });
  // Simpler: read every card in DOM order with its heading context
  const out = [];
  let heading = "";
  for (const el of document.querySelector(".app").children) {
    if (el.classList.contains("solo")) heading = el.textContent;
    if (el.classList.contains("grid")) {
      for (const card of el.querySelectorAll(".card")) {
        out.push({
          heading,
          count: card.querySelector(".count")?.textContent,
          label: card.querySelector(".meta strong")?.textContent,
        });
      }
    }
  }
  return { warn, cards: out };
});

console.log("\nDetection warning:", result.warn || "(none)");
console.log("\nUI stacks:");
for (const c of result.cards) console.log(`  [${c.heading}] count=${c.count} ${c.label}`);
console.log("\nConsole errors:", errors.length ? errors.join("\n") : "(none)");

await browser.close();
