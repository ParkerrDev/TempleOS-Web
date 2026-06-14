// whitecheck.mjs — reproduce the SMP white-screen / flicker: sample the canvas over a sustained
// parallel run and report white% (palette 15), non-bg%, and distinct frames (flicker).
import http from "node:http"; import { readFile } from "node:fs/promises"; import { extname, join, normalize } from "node:path"; import { chromium } from "playwright";
const ROOT = process.cwd();
const MIME = { ".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".json":"application/json",".wasm":"application/wasm",".gz":"application/octet-stream",".css":"text/css" };
const server = http.createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html"; const fp = join(ROOT, normalize(p)); const buf = await readFile(fp); res.setHeader("Cross-Origin-Opener-Policy","same-origin"); res.setHeader("Cross-Origin-Embedder-Policy","credentialless"); res.setHeader("Content-Type", MIME[extname(fp)]||"application/octet-stream"); res.end(buf); } catch { res.statusCode=404; res.end("404"); } });
await new Promise(r => server.listen(0, r)); const port = server.address().port;
const q = process.env.Q || "?smp=4";
const br = await chromium.launch({ args: ["--no-sandbox"] });
const pg = await br.newPage();
pg.on("console", m => { const t = m.text(); if (/SMP:|error|trap/i.test(t)) console.log("  [page]", t); });
await pg.goto(`http://localhost:${port}/index.html${q}`, { waitUntil: "domcontentloaded" });
const sample = () => pg.evaluate(() => { const c = document.getElementById("canvas"); const d = c.getContext("2d").getImageData(0,0,c.width,c.height).data;
  let white=0, nz=0, h=0; for (let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2]; if(r>240&&g>240&&b>240)white++; if(r||g||b)nz++; if((i%1024)===0)h=(h*31+r+g*7+b*13)>>>0; }
  return { white: 100*white/(d.length/4), nz: 100*nz/(d.length/4), h }; });
console.log(`index.html${q}: white% / nonbg% over 30s (white=broken):`);
const hashes = new Set();
for (let i = 0; i < 30; i++) { await pg.waitForTimeout(1000); const s = await sample(); hashes.add(s.h);
  console.log(`  t=${i+1}s  white=${s.white.toFixed(1)}%  nonbg=${s.nz.toFixed(1)}%`); }
console.log(`distinct frames over 30s: ${hashes.size}`);
await pg.screenshot({ path: "/tmp/smp_white.png" }); console.log("wrote /tmp/smp_white.png");
await br.close(); server.close(); process.exit(0);
