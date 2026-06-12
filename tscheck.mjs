// tscheck.mjs — drive the real site in headless Chromium: open Terry Search, wait for the shards,
// run an exact query and a typo'd query (fuzzy proof), verify hits + archive.org links + screenshot.
import { chromium } from "playwright-core";
const EXE = process.env.HOME + "/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const BASE = "http://localhost:" + (process.env.PORT || 8099) + "/index.html";
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
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

// DEFAULT VIEW: no query -> the latest videos, newest first
await page.waitForSelector("#tsOut .ts-vidcard", { timeout: 15000 });
{
  const b = await page.evaluate(() => ({
    cards: document.querySelectorAll("#tsOut .ts-vidcard").length,
    dates: [...document.querySelectorAll("#tsOut .ts-vidcard .ts-m")].slice(0, 5).map((e) => e.textContent.slice(0, 10)),
    status: document.getElementById("tsStatus").textContent }));
  console.log("\n== default browse ==", JSON.stringify(b));
  if (!(b.cards > 10 && b.dates[0] >= b.dates[1] && /newest first/.test(b.status))) throw new Error("default browse wrong");
  console.log("  LATEST VIDEOS BY DEFAULT (newest first)");
}

const ask = async (q, label) => {
  await page.fill("#tsQ", q);
  await page.waitForFunction(() => /matching/.test(document.getElementById("tsStatus").textContent) || document.querySelector("#tsOut .ts-none"), { timeout: 20000 });
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
// for '+', never %20); non-playlist videos must route through our mini-player (player.html)
const linkAudit = await page.$$eval("#tsOut a[href*='archive.org'], #tsOut a[href*='player.html']", (as) => {
  let det = 0, mini = 0, bad = [];
  for (const a of as) {
    if (a.href.includes("/details/")) { det++; if (a.href.includes("%20") || !a.href.includes("?start=")) bad.push(a.href.slice(0, 120)); }
    else if (a.href.includes("player.html?f=")) mini++;
    else bad.push("unexpected: " + a.href.slice(0, 120));
  }
  return { det, mini, bad: bad.slice(0, 3) };
});
console.log(`\n== link audit == details:${linkAudit.det} mini-player:${linkAudit.mini} malformed:${linkAudit.bad.length}`, linkAudit.bad);
if (linkAudit.bad.length) throw new Error("malformed links");

// VIDEO WINDOWS: ▶ opens a draggable TempleOS window; multiple play at once; [X] destroys
{
  await page.click("#tsOut .ts-hit:nth-of-type(1) .ts-pl");
  await page.click("#tsOut .ts-hit:nth-of-type(4) .ts-pl");
  let st2 = null;
  for (let i = 0; i < 60; i++) {
    st2 = await page.evaluate(() => [...document.querySelectorAll(".vidwin")].map((w) => {
      const v = w.querySelector("video"); return { ready: v ? v.readyState : -1, t: v ? Math.round(v.currentTime) : -1, err: !!(v && v.error) }; }));
    if (st2.length === 2 && st2.every((x) => x.ready >= 2 || x.err)) break;
    await page.waitForTimeout(1000);
  }
  console.log("\n== video windows ==", JSON.stringify(st2));
  if (st2.length !== 2 || !st2.every((x) => x.ready >= 2)) throw new Error("video windows failed: " + JSON.stringify(st2));
  console.log("  TWO WINDOWS PLAYING AT ONCE");
  await page.screenshot({ path: "/tmp/ts_windows.png" });
  await page.click(".vidwin .wbar .close");                       // [X] destroys one
  await page.waitForTimeout(300);
  const left = await page.$$eval(".vidwin", (d) => d.length);
  if (left !== 1) throw new Error("[X] should destroy the window, left=" + left);
  console.log("  [X] destroys a window (1 left)");
  await page.click(".vidwin .wbar .close");                       // clean up the other
}

// mini-player: actually STREAM a .mkv original from archive.org (Chromium demuxes Matroska natively)
{
  const mini = await page.$eval("#tsOut a[href*='player.html']", (a) => a.href).catch(() => null);
  const pp = await browser.newPage();
  const target = mini || "http://localhost:" + (process.env.PORT || 8099) + "/player.html?f=" +
    encodeURIComponent("videos/2007/2007-09-30T07:00:00+00:00 - Songs by God #1 (9i0pMO697Zk).mkv") + "&t=30&n=test";
  console.log("\n== mini-player == " + decodeURIComponent(target).slice(0, 130));
  await pp.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
  let state = null;
  for (let i = 0; i < 45; i++) {
    state = await pp.evaluate(() => { const v = document.querySelector("video");
      return { ready: v ? v.readyState : -1, t: v ? Math.round(v.currentTime) : -1, err: !!(v && v.error), msg: document.getElementById("msg").style.display === "block" }; });
    if (state.ready >= 2 || state.err || state.msg) break;
    await pp.waitForTimeout(1000);
  }
  console.log("  video state:", JSON.stringify(state));
  if (!(state.ready >= 2)) throw new Error("mini-player did not reach playable state: " + JSON.stringify(state));
  const bar = await pp.evaluate(() => { const b = document.getElementById("bar");
    return { first: b.firstElementChild.id, last: b.lastElementChild.id, back: document.getElementById("back").textContent.trim(),
             dlText: document.getElementById("dl").textContent.trim(), barIsFirst: document.body.firstElementChild.id === "bar" }; });
  console.log("  bar:", JSON.stringify(bar));
  if (!(bar.first === "back" && bar.last === "dl" && bar.barIsFirst && bar.back === "←")) throw new Error("player bar layout wrong");
  console.log("  STREAMS — bar on top: [←] … [↓ Download video]");
  await pp.close();
}

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
await page.click("#tsOut .ts-hit .ts-x");          // clicking the card EXPANDS the full transcript
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
// FILTERS: titles scope, year filter, sort
{
  await page.click('.ts-seg button[data-sc="title"]');
  await page.fill("#tsQ", "god song");
  await page.waitForFunction(() => /matching title/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  const t = await page.evaluate(() => ({ vids: document.querySelectorAll("#tsOut .ts-vidcard").length,
    nonVids: document.querySelectorAll("#tsOut .ts-hit:not(.ts-vidcard)").length }));
  console.log("\n== titles scope ==", JSON.stringify(t));
  if (!(t.vids > 0 && t.nonVids === 0)) throw new Error("titles scope wrong");

  await page.click('.ts-seg button[data-sc="all"]');
  await page.selectOption("#tsYear", "2017");
  await page.fill("#tsQ", "glow in the dark");
  await page.waitForFunction(() => /matching passages/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  await page.waitForTimeout(300);
  const yr = await page.$$eval("#tsOut .ts-hit:not(.ts-vidcard) .ts-m", (es) => es.map((e) => e.textContent.slice(0, 4)));
  console.log("== year filter == hits:", yr.length, "non-2017:", yr.filter((y) => y !== "2017").length);
  if (!(yr.length > 0 && yr.every((y) => y === "2017"))) throw new Error("year filter wrong");

  await page.selectOption("#tsYear", "");
  await page.fill("#tsQ", "");
  await page.selectOption("#tsSort", "old");
  await page.waitForFunction(() => /oldest first/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  const olds = await page.$$eval("#tsOut .ts-vidcard .ts-m", (es) => es.slice(0, 3).map((e) => e.textContent.slice(0, 10)));
  console.log("== sort oldest ==", JSON.stringify(olds));
  if (!(olds.length && olds[0] <= olds[1])) throw new Error("oldest sort wrong");
  await page.selectOption("#tsSort", "rel");
  console.log("  FILTERS OK (titles scope · year · sort)");
}

await page.fill("#tsQ", "an idiot admires complexity");
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/ts_search.png" });
console.log("\nfuzzy works:", b.length > 0 ? "YES" : "NO", "· screenshots /tmp/ts_search.png /tmp/ts_transcript.png");
await browser.close();
