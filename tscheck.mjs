// tscheck.mjs — drive the real site in headless Chromium: open Terry Search, wait for the shards,
// run an exact query and a typo'd query (fuzzy proof), verify hits + archive.org links + screenshot.
import { chromium } from "playwright-core";
const EXE = process.env.HOME + "/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const BASE = "http://localhost:" + (process.env.PORT || 8099) + "/index.html";
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 980 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
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
    text: a.querySelector(".ts-x").textContent.slice(0, 110), href: a.querySelector(".ts-t").href.slice(0, 130) })));
  const n = await page.$eval("#tsStatus", (e) => e.textContent);
  console.log(`\n== ${label}: "${q}" -> ${n}`);
  for (const h of hits) console.log(`  [${h.meta}] ${h.title}\n    ${h.text}\n    -> ${h.href}`);
  return hits;
};

const a = await ask("an idiot admires complexity", "exact");
const b = await ask("idoit admires complexty", "typo'd (fuzzy)");
await ask("CIA glow in the dark", "phrase");

// link-form audit: /details/ links must use the player's double-decoded form (+ for spaces, %252B
// for '+', never %20); non-playlist videos must use /download/ instead of a bouncing /details/ link
const linkAudit = await page.$$eval("#tsOut a[href*='archive.org']", (as) => {
  let det = 0, dl = 0, bad = [];
  for (const a of as) {
    if (a.href.includes("/details/")) { det++; if (a.href.includes("%20") || !a.href.includes("?start=")) bad.push(a.href.slice(0, 120)); }
    else if (a.href.includes("/download/")) dl++;
  }
  return { det, dl, bad: bad.slice(0, 3) };
});
console.log(`\n== link audit == details:${linkAudit.det} download:${linkAudit.dl} malformed:${linkAudit.bad.length}`, linkAudit.bad);
if (linkAudit.bad.length) throw new Error("malformed details links");

// --- copy a single passage ---
await page.click("#tsOut .ts-hit .ts-cp");
await page.waitForTimeout(300);
let clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("\n== copy one passage ==\n" + clip.split("\n").map((l) => "  | " + l.slice(0, 100)).join("\n"));

// --- copy all results ---
await page.click("#tsCopyAll");
await page.waitForTimeout(300);
clip = await page.evaluate(() => navigator.clipboard.readText());
console.log(`\n== copy all results == ${clip.length} chars, ${clip.split("“").length - 1} passages; head:\n  | ` + clip.split("\n")[0]);

// --- full transcript view + copy ---
await page.click("#tsOut .ts-hit .ts-tr");
await page.waitForSelector("#tsCpTr", { timeout: 15000 });
const nLines = await page.$$eval("#tsOut .ts-line", (d) => d.length);
console.log(`\n== full transcript view == ${nLines} passages rendered; status: ` + await page.$eval("#tsStatus", (e) => e.textContent));
await page.click("#tsCpTr");
await page.waitForTimeout(400);
clip = await page.evaluate(() => navigator.clipboard.readText());
console.log(`  transcript copied: ${clip.length} chars; first lines:\n` + clip.split("\n").slice(0, 4).map((l) => "  | " + l.slice(0, 100)).join("\n"));
await page.screenshot({ path: "/tmp/ts_transcript.png" });
await page.click("#tsBack");
await page.waitForSelector("#tsOut .ts-hit", { timeout: 5000 });
console.log("  back to results OK");
await page.fill("#tsQ", "an idiot admires complexity");
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/ts_search.png" });
console.log("\nfuzzy works:", b.length > 0 ? "YES" : "NO", "· screenshots /tmp/ts_search.png /tmp/ts_transcript.png");
await browser.close();
