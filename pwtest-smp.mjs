// pwtest-smp.mjs — headless verification of hemu-smp.html (browser real-parallel SMP).
// Serves the site with COOP/COEP (so SharedArrayBuffer works), loads the page in headless chromium,
// waits for the BSP to boot the SMP desktop, and checks the canvas actually rendered (non-black).
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const MIME = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".json":"application/json", ".wasm":"application/wasm", ".gz":"application/octet-stream", ".css":"text/css" };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/hemu-smp.html";
    const fp = join(ROOT, normalize(p));                 // follows symlinks (hemu-wasm/holyc-wasm -> ../)
    const buf = await readFile(fp);
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");      // + COEP => crossOriginIsolated => SharedArrayBuffer
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Content-Type", MIME[extname(fp)] || "application/octet-stream");
    res.end(buf);
  } catch (e) { res.statusCode = 404; res.end("404 " + req.url); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const GAME = process.env.GAME || "";
const url = process.env.PAGE ? `http://localhost:${port}/${process.env.PAGE}`
                            : `http://localhost:${port}/hemu-smp.html?smp=4${GAME ? "&game=" + GAME : ""}`;
console.log("serving", ROOT, "->", url);

const browser = await chromium.launch({ args: ["--enable-features=SharedArrayBuffer", "--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => console.log("  [page]", m.text()));
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(url, { waitUntil: "domcontentloaded" });

// poll the canvas for up to ~90s: the BSP decompresses a 10MB snapshot + boots + 220 warmup frames,
// then APs join; the desktop should fill the canvas (non-black).
let result = { nonblack: 0, status: "" };
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(2000);
  result = await page.evaluate(() => {
    const c = document.getElementById("canvas"); const x = c.getContext("2d");
    const d = x.getImageData(0, 0, c.width, c.height).data; let nz = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] || d[i+1] || d[i+2]) nz++;
    return { nonblack: 100 * nz / (d.length / 4), status: document.getElementById("status").textContent };
  });
  console.log(`  t=${(i+1)*2}s  canvas non-black ${result.nonblack.toFixed(1)}%  | ${result.status}`);
  if (result.nonblack > 15) break;
}
await page.screenshot({ path: "/tmp/smp_browser.png" });
console.log(result.nonblack > 15 ? `=== BROWSER SMP desktop rendered (${result.nonblack.toFixed(1)}% non-black) ===`
                                 : `=== BROWSER SMP FAIL: canvas ${result.nonblack.toFixed(1)}% non-black — ${result.status} ===`);

if (process.env.CTRLM && result.nonblack > 15) {                  // snap the Ctrl+M games menu (to locate sprites)
  await page.waitForTimeout(1500);
  await page.mouse.click(640, 320);                               // focus the OS canvas (center of the page canvas)
  await page.waitForTimeout(300);
  await page.keyboard.press("KeyN"); await page.waitForTimeout(800);          // dismiss "Take Tour(y or n)?"
  await page.keyboard.press("Escape"); await page.waitForTimeout(600);
  await page.keyboard.down("ControlLeft"); await page.keyboard.press("KeyM"); await page.keyboard.up("ControlLeft");
  await page.waitForTimeout(2000);
  for (let s = 0; s < (+process.env.SCROLL || 0); s++) { await page.mouse.move(640, 360); await page.mouse.wheel(0, 240); await page.waitForTimeout(500); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/smp_menu.png" });
  console.log("wrote /tmp/smp_menu.png (Ctrl+M menu, scroll=" + (+process.env.SCROLL||0) + ")");
  await browser.close(); server.close(); process.exit(0);
}
let gameOk = !GAME;
if (GAME && result.nonblack > 15) {
  console.log(`--- ${GAME} auto-launched by the BSP (?game=); watching for parallel init + terrain (~90s) ---`);
  let stableHi = 0;
  for (let i = 0; i < 50; i++) {                                 // watch the canvas for the Talons cyan sky (init done + rendering)
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => { const c = document.getElementById("canvas"); const d = c.getContext("2d").getImageData(0,0,c.width,c.height).data;
      let cyan = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120 && d[i+1] > 180 && d[i+2] > 180) cyan++;   // cyan = Talons sky
      return { cyan: 100 * cyan / (d.length / 4) }; });
    console.log(`  t=${(i+1)*2}s  cyan(sky) ${r.cyan.toFixed(1)}%`);
    if (r.cyan > 8) { stableHi++; if (stableHi >= 2) { gameOk = true; console.log("  >>> game terrain (cyan sky) rendered on the 4-core engine"); break; } } else stableHi = 0;
  }
  await page.screenshot({ path: "/tmp/smp_browser_game.png" });
  console.log(`  wrote /tmp/smp_browser_game.png`);
}
await browser.close(); server.close();
console.log(result.nonblack > 15 && gameOk ? "=== BROWSER SMP PASS ===" : "=== BROWSER SMP: desktop ok, game not confirmed ===");
process.exit(result.nonblack > 15 && gameOk ? 0 : 1);
