// f6real.mjs — drive the REAL site in headless Chromium: boot, click canvas to focus,
// press F6 (God Song), watch for page errors / freeze, and screenshot before+after.
import { chromium } from "playwright-core";
const EXE = process.env.HOME + "/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const BASE = "http://localhost:" + (process.env.PORT || 8099) + "/index.html";
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1300, height: 980 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { const t = m.text(); if (/BADOP|error|trap|exception|crash/i.test(t)) console.log("[console]", t.slice(0, 200)); });
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });

// Wait for the emulator canvas to exist and start animating.
await page.waitForSelector("canvas", { timeout: 60000 });
const canvasSel = "canvas";
// Give it time to boot the snapshot.
await page.waitForTimeout(8000);

// Hash the canvas to detect animation/freeze.
const hashCanvas = async () => page.evaluate(() => {
  const c = document.querySelector("canvas"); if (!c) return null;
  const g = c.getContext("2d") || c.getContext("webgl2") || c.getContext("webgl");
  try {
    const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
    const tx = t.getContext("2d"); tx.drawImage(c, 0, 0);
    const d = tx.getImageData(0, 0, c.width, c.height).data;
    let h = 0x811c9dc5, nz = 0;
    for (let i = 0; i < d.length; i += 16) { h = ((h ^ d[i]) * 16777619) >>> 0; if (d[i] | d[i+1] | d[i+2]) nz++; }
    return { h, nzFrac: nz / (d.length / 16), w: c.width, h2: c.height };
  } catch (e) { return { err: String(e) }; }
});

const sampleLiveliness = async (label, n = 8, gapMs = 250) => {
  const hs = [];
  for (let i = 0; i < n; i++) { hs.push(await hashCanvas()); await page.waitForTimeout(gapMs); }
  const distinct = new Set(hs.map(x => x && x.h)).size;
  const nz = hs[hs.length - 1] && hs[hs.length - 1].nzFrac;
  console.log(`${label}: ${distinct}/${n} distinct frames, last non-black ${(nz * 100 || 0).toFixed(0)}%`);
  return distinct;
};

await sampleLiveliness("BEFORE-F6");
await page.screenshot({ path: "/tmp/f6_before.png" });

// Focus the OS (click canvas), answer the boot "Take Tour(y or n)?" with 'n' + Enter to reach a clean
// Cmd line, then press F6 (GodSong -> PopUpForm).
const box = await page.$eval(canvasSel, (c) => { const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(box.x, box.y);
await page.waitForTimeout(300);
await page.keyboard.press("n"); await page.waitForTimeout(250);
await page.keyboard.press("Enter"); await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/f6_cleared.png" });
await page.keyboard.press("F6");
console.log("pressed F6 (GodSong -> PopUpForm)");

for (let i = 1; i <= 6; i++) { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/f6_t${i}.png` }); }
await sampleLiveliness("AFTER-F6");
// Try to interact with / dismiss the form to confirm it's alive and recovers.
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/f6_afteresc.png" });
await sampleLiveliness("AFTER-ESC");
await browser.close();
console.log("screenshots: /tmp/f6_before.png /tmp/f6_after1.png /tmp/f6_after2.png");
