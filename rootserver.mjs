// Minimal static server rooted at the FILESYSTEM ROOT, with COOP/COEP (for SharedArrayBuffer) and
// no-cache. Serving from "/" means jit.js's absolute import paths (/Users/.../emitter.js) resolve as
// URLs in the browser exactly as they do in node — so the SAME proven code runs in Chromium unchanged.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
const PORT = Number(process.env.PORT) || 8077;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".gz": "application/octet-stream", ".bin": "application/octet-stream", ".HC": "text/plain", ".json": "application/json" };
createServer(async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-cache");
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const body = await readFile(path);
    res.setHeader("Content-Type", MIME[extname(path)] || "application/octet-stream");
    res.end(body);
  } catch (e) { res.statusCode = 404; res.end("404 " + e.message); }
}).listen(PORT, () => console.log("rootserver on " + PORT));
