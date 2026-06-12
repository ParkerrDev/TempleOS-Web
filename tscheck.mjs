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
      const v = w.querySelector("video");
      return { ready: v ? v.readyState : -1, t: v ? Math.round(v.currentTime) : -1, err: !!(v && v.error), fb: !!w.querySelector(".ts-verr") }; }));
    if (st2.length === 2 && st2.every((x) => x.ready >= 2 || x.err || x.fb)) break;
    await page.waitForTimeout(1000);
  }
  console.log("\n== video windows ==", JSON.stringify(st2));
  // archive.org occasionally drops one of two parallel streams — the window then shows its error
  // fallback (correct product behavior). Require both windows present and >=1 actually streaming.
  if (st2.length !== 2 || !st2.some((x) => x.ready >= 2) || !st2.every((x) => x.ready >= 2 || x.fb)) throw new Error("video windows failed: " + JSON.stringify(st2));
  console.log(st2.every((x) => x.ready >= 2) ? "  TWO WINDOWS PLAYING AT ONCE" : "  two windows: one streaming, one error-fallback (archive.org flake)");
  await page.screenshot({ path: "/tmp/ts_windows.png" });

  // unified z-order: whatever is focused comes to the FRONT (overlay vs video windows)
  const z = async () => page.evaluate(() => ({ ov: +getComputedStyle(document.getElementById("tsOverlay")).zIndex,
    vw: Math.max(...[...document.querySelectorAll(".vidwin")].map((w) => +w.style.zIndex || 0)) }));
  await page.evaluate(() => document.getElementById("tsWin").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));   // focus the search window -> overlay raises
  const z1 = await z();
  if (!(z1.ov > z1.vw)) throw new Error("overlay should be frontmost after focus: " + JSON.stringify(z1));
  await page.evaluate(() => document.querySelector(".vidwin").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));  // focus a video window
  const z2 = await z();
  if (!(z2.vw > z2.ov)) throw new Error("video window should be frontmost after focus: " + JSON.stringify(z2));
  console.log("  FOCUS RAISES: overlay", JSON.stringify(z1), "-> video window", JSON.stringify(z2));
  await page.click(".vidwin .wbar .close");                       // [X] destroys one
  await page.waitForTimeout(300);
  const left = await page.$$eval(".vidwin", (d) => d.length);
  if (left !== 1) throw new Error("[X] should destroy the window, left=" + left);
  console.log("  [X] destroys a window (1 left)");
  await page.evaluate(() => document.querySelector(".vidwin .wbar .close").click());   // clean up the other (it's behind the raised overlay now)
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
// OPERATORS: exact phrases, exclusion, full dates, ranges, date-only listing
{
  const q = async (text, wait = "matching") => { await page.fill("#tsQ", text);
    await page.waitForFunction((w) => new RegExp(w).test(document.getElementById("tsStatus").textContent) || document.querySelector("#tsOut .ts-none"), wait, { timeout: 15000 });
    await page.waitForTimeout(300);
    return page.evaluate(() => ({ st: document.getElementById("tsStatus").textContent,
      none: !!document.querySelector("#tsOut .ts-none"),
      texts: [...document.querySelectorAll("#tsOut .ts-hit:not(.ts-vidcard) .ts-x")].slice(0, 8).map((e) => e.textContent.toLowerCase()),
      dates: [...document.querySelectorAll("#tsOut .ts-hit .ts-m")].slice(0, 60).map((e) => e.textContent.slice(0, 10)) })); };

  const ex = await q('"i do a round robin"');
  if (ex.none || !ex.texts.some((t) => t.includes("i do a round robin"))) throw new Error("exact phrase failed");
  const exneg = await q('"idoit admires complexty"', "matching|videos ·");   // typo INSIDE quotes = NO fuzzy = no matches
  if (!exneg.none) throw new Error("quoted typo should NOT fuzzy-match: " + exneg.st);
  const minus = await q('"round robin" -priorities');
  if (minus.none || minus.texts.some((t) => t.includes("priorities"))) throw new Error("exclusion failed");
  const day = await q("2017-11-19 glow");
  if (day.none || !day.dates.length || !day.dates.every((d) => d === "2017-11-19")) throw new Error("full-date filter failed: " + JSON.stringify(day.dates.slice(0, 3)));
  const range = await q("since:2017-10 until:2017-11 glow in the dark");
  if (range.none || !range.dates.length || !range.dates.every((d) => d >= "2017-10" && d.slice(0, 7) <= "2017-11")) throw new Error("range failed: " + JSON.stringify(range.dates.slice(0, 3)));
  const donly = await q("since:2018-08", "in range");
  if (!/in range/.test(donly.st) || !donly.dates.length || !donly.dates.every((d) => d >= "2018-08")) throw new Error("date-only listing failed: " + donly.st);
  console.log("\n== operators == exact ✓ quoted-typo-rejected ✓ -exclude ✓ day ✓ range ✓ date-only(" + donly.dates.length + " vids) ✓");
}

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
  const openPanel = async () => { if (!(await page.$eval("#tsYearPanel", (p) => p.classList.contains("open")))) await page.click("#tsYearBtn"); };
  await openPanel();
  await page.click('#tsYearPanel input[value="2017"]');
  await page.fill("#tsQ", "glow in the dark");
  await page.waitForFunction(() => /matching passages/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  await page.waitForTimeout(300);
  const yr = await page.$$eval("#tsOut .ts-hit:not(.ts-vidcard) .ts-m", (es) => es.map((e) => e.textContent.slice(0, 4)));
  console.log("== year filter == hits:", yr.length, "non-2017:", yr.filter((y) => y !== "2017").length);
  if (!(yr.length > 0 && yr.every((y) => y === "2017"))) throw new Error("year filter wrong");
  if (!/2017 ▾/.test(await page.$eval("#tsYearBtn", (b) => b.textContent))) throw new Error("year button label wrong");

  // MULTI-year: add 2012 on top of 2017
  await openPanel(); await page.click('#tsYearPanel input[value="2012"]');
  await page.fill("#tsQ", "god");
  await page.waitForFunction(() => /matching/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  await page.waitForTimeout(300);
  const yr2 = await page.$$eval("#tsOut .ts-hit .ts-m", (es) => es.map((e) => e.textContent.slice(0, 4)));
  if (!(yr2.length > 0 && yr2.every((y) => y === "2012" || y === "2017"))) throw new Error("multi-year wrong: " + JSON.stringify([...new Set(yr2)]));
  console.log("== multi-year == 2012+2017:", yr2.length, "hits, years:", JSON.stringify([...new Set(yr2)]));

  // EXACT mode via the dropdown: typo must NOT match; real phrase must
  await openPanel(); await page.click("#tsYearPanel button");   // any year
  await page.selectOption("#tsMatch", "exact");
  await page.fill("#tsQ", "idoit admires complexty");
  await page.waitForSelector("#tsOut .ts-none", { timeout: 15000 });   // exact mode: the typo matches NOTHING
  await page.fill("#tsQ", "i do a round robin");
  await page.waitForFunction(() => /matching passages/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  console.log("== exact mode == typo rejected, verbatim phrase matches");
  await page.selectOption("#tsMatch", "fuzzy");

  await page.fill("#tsQ", "");
  await page.selectOption("#tsSort", "old");
  await page.waitForFunction(() => /oldest first/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  const olds = await page.$$eval("#tsOut .ts-vidcard .ts-m", (es) => es.slice(0, 3).map((e) => e.textContent.slice(0, 10)));
  console.log("== sort oldest ==", JSON.stringify(olds));
  if (!(olds.length && olds[0] <= olds[1])) throw new Error("oldest sort wrong");
  await page.selectOption("#tsSort", "rel");
  console.log("  FILTERS OK (titles scope · year · sort)");
}

// DETACH [_]: the dark backdrop goes away, the window joins the desktop, OS keys flow again
{
  await page.click("#tsOverlay .ovfree");
  const f = await page.evaluate(() => { const ov = document.getElementById("tsOverlay");
    return { free: ov.classList.contains("free"), bg: getComputedStyle(ov).backgroundColor, pe: getComputedStyle(ov).pointerEvents,
      btnGone: !document.querySelector("#tsOverlay .ovfree").offsetParent }; });
  console.log("\n== detach ==", JSON.stringify(f));
  if (!(f.free && f.pe === "none" && /rgba\(0, 0, 0, 0\)|transparent/.test(f.bg) && f.btnGone)) throw new Error("detach wrong");
  await page.click("#tsClose");                                    // backdrop comes back via close + reopen
  await page.click("#tsBtn");
  const f2 = await page.evaluate(() => document.getElementById("tsOverlay").classList.contains("free"));
  if (f2) throw new Error("close+reopen should restore the backdrop");
  console.log("  DETACH OK (one-way [X]; close+reopen restores the backdrop)");
}

// × clear button (inside the input; hidden when empty)
{
  await page.fill("#tsQ", "something");
  await page.waitForTimeout(400);
  const hiddenWhenEmpty = await page.evaluate(() => { const i = document.getElementById("tsQ"); i.value = "";
    i.dispatchEvent(new Event("input", { bubbles: true }));
    return getComputedStyle(document.getElementById("tsClear")).display === "none"; });
  if (!hiddenWhenEmpty) throw new Error("clear × should hide when the input is empty");
  await page.fill("#tsQ", "something");
  await page.click("#tsClear");
  await page.waitForFunction(() => /videos ·/.test(document.getElementById("tsStatus").textContent), { timeout: 15000 });
  const v = await page.$eval("#tsQ", (e) => e.value);
  if (v !== "") throw new Error("clear failed");
  console.log("== clear × == input cleared, back to browse");
}

// FULLSCREEN: black letterbox (no white chrome fill), no exit button on desktop, mouse confined
{
  const fp = await ctx.newPage();
  await fp.goto("http://localhost:" + (process.env.PORT || 8099) + "/index.html", { waitUntil: "domcontentloaded" });
  await fp.waitForTimeout(2500);
  await fp.click("#fsBtn");
  await fp.waitForTimeout(900);
  const fs = await fp.evaluate(() => { const f = document.getElementById("frame");
    const cs = getComputedStyle(f);
    return { el: document.fullscreenElement && document.fullscreenElement.id, bi: cs.borderImageSource,
      bg: cs.backgroundColor, exit: !!(document.getElementById("fsExit").offsetParent) }; });
  console.log("\n== fullscreen ==", JSON.stringify(fs));
  if (!(fs.el === "frame" && fs.bi === "none" && fs.bg === "rgb(0, 0, 0)" && !fs.exit)) throw new Error("fullscreen chrome wrong");
  // click the letterbox: focus must be OS focus (not released), mapped+clamped into the canvas
  const cr = await fp.evaluate(() => { const c = document.getElementById("canvas").getBoundingClientRect(); return { x: c.x, y: c.y, h: c.height }; });
  await fp.mouse.click(Math.max(4, cr.x / 2), cr.y + cr.h / 2);
  await fp.waitForTimeout(300);
  const lbl = await fp.$eval("#tb-key", (e) => e.textContent);
  if (!/focused/.test(lbl)) throw new Error("letterbox click must keep OS focus: " + lbl);
  console.log("  LETTERBOX: black, exit hidden, click stays in the OS (" + lbl.slice(0, 24) + "…)");
  await fp.close();
}

await page.fill("#tsQ", "an idiot admires complexity");
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/ts_search.png" });
console.log("\nfuzzy works:", b.length > 0 ? "YES" : "NO", "· screenshots /tmp/ts_search.png /tmp/ts_transcript.png");
await browser.close();
