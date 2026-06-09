// End-to-end deploy check in headless Chromium: load the REAL hemu.html (worker engine + JIT), auto-launch
// Varoom, read the HONEST #tb-fps (now distinct-frames/sec), confirm the JIT is active + no errors/fallback.
import { chromium } from "/Users/parkerh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const url = process.env.URL || "http://localhost:8080/hemu.html?autogame=225,325";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const logs = [], errs = [];
page.on("console", (m) => logs.push(m.text()));
page.on("pageerror", (e) => errs.push(String(e.message || e)));
await page.goto(url, { timeout: 60000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(11000);   // boot (~1-2s) + autoGame launch sequence (~3.5s) + run a few seconds
const fpsReads = [];
for (let i = 0; i < 5; i++) { fpsReads.push(await page.$eval("#tb-fps", (e) => e.textContent).catch(() => "?")); await sleep(600); }
const nonBlack = await page.evaluate(() => { const c = document.querySelector("canvas"); if (!c) return "no canvas"; const x = c.getContext("2d"); const d = x.getImageData(0, 0, c.width, c.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) nz++; return (100 * nz / (d.length / 4)).toFixed(1) + "%"; }).catch((e) => "readback failed: " + e.message);
console.log("URL:", url);
console.log("fps reads:", fpsReads.join(", "));
console.log("canvas non-black:", nonBlack);
console.log("JIT log:", logs.find((l) => l.includes("JIT")) || "NONE (interpreter or worker failed!)");
console.log("hemu logs:", logs.filter((l) => l.toLowerCase().includes("hemu") || l.toLowerCase().includes("fallback") || l.toLowerCase().includes("badop")).slice(0, 8).join(" | ") || "(none)");
console.log("page errors:", errs.length ? errs.slice(0, 5).join(" ;; ") : "none");
await page.screenshot({ path: process.env.SHOT || "/tmp/dc.png" });
console.log("screenshot:", process.env.SHOT || "/tmp/dc.png");
await browser.close();
