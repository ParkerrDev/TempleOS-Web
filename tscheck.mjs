// tscheck.mjs — drive the real site in headless Chromium: open Terry Search, wait for the shards,
// run an exact query and a typo'd query (fuzzy proof), verify hits + archive.org links + screenshot.
import { chromium } from "playwright-core";
const EXE = process.env.HOME + "/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const BASE = "http://localhost:" + (process.env.PORT || 8099) + "/index.html";
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 980 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { const t = m.text(); if (/error|failed/i.test(t)) console.log("[console]", t.slice(0, 160)); });
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#tsBtn", { timeout: 30000 });
await page.click("#tsBtn");
console.log("opened Terry Search; waiting for shards…");
await page.waitForFunction(() => /type to search/.test(document.getElementById("tsStatus").textContent), { timeout: 120000 });
console.log("ready:", await page.$eval("#tsStatus", (e) => e.textContent));

const ask = async (q, label) => {
  await page.fill("#tsQ", q);
  await page.waitForFunction(() => document.querySelectorAll("#tsOut .ts-hit").length > 0 || document.querySelector("#tsOut .ts-none"), { timeout: 20000 });
  await page.waitForTimeout(400);
  const hits = await page.$$eval("#tsOut .ts-hit", (as) => as.slice(0, 3).map((a) => ({
    title: a.querySelector(".ts-t").textContent, meta: a.querySelector(".ts-m").textContent,
    text: a.querySelector(".ts-x").textContent.slice(0, 110), href: a.href.slice(0, 130) })));
  const n = await page.$eval("#tsStatus", (e) => e.textContent);
  console.log(`\n== ${label}: "${q}" -> ${n}`);
  for (const h of hits) console.log(`  [${h.meta}] ${h.title}\n    ${h.text}\n    -> ${h.href}`);
  return hits;
};

const a = await ask("an idiot admires complexity", "exact");
const b = await ask("idoit admires complexty", "typo'd (fuzzy)");
await ask("CIA glow in the dark", "phrase");
await page.screenshot({ path: "/tmp/ts_search.png" });
console.log("\nfuzzy works:", b.length > 0 ? "YES" : "NO", "· screenshot /tmp/ts_search.png");
await browser.close();
