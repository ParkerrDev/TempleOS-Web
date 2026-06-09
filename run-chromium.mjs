// Headless-Chromium in-game fps measurement (the TARGET environment). Loads the standalone test page
// with the JIT on then off, reads the RESULT line.
import { chromium } from "/Users/parkerh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const BASE = "http://localhost:" + (process.env.PORT || 8077) + "/Users/parkerh/Dev/TempleOS-wasm/hemu-jit-test.html";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--max-old-space-size=4096"] });
async function measure(jit) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => { const t = m.text(); if (t.includes("BADOP") || t.toLowerCase().includes("error")) console.log("[page]", t); });
  await page.goto(`${BASE}?jit=${jit}&mw=${process.env.MW || 1000}&b=${process.env.B || 1500000}&gx=${process.env.GX || 108}&gy=${process.env.GY || 325}`, { timeout: 60000 });
  await page.waitForFunction(() => { const t = document.getElementById("result").textContent; return t.startsWith("RESULT") || t.startsWith("ERROR"); }, { timeout: 180000 });
  const r = await page.$eval("#result", (e) => e.textContent);
  console.log(`jit=${jit}: ${r}`);
  await page.close();
}
await measure(1);
await browser.close();
console.log("done");
