// Minimal zero-dependency static server for local testing.
// Sets COOP/COEP so SharedArrayBuffer (and thus QEMU-WASM threads) work, and serves
// .gz assets as raw bytes (the loader decompresses them itself). Node 18+.
//   node server.mjs   →   http://localhost:8080
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".gz": "application/octet-stream",   // served raw; the page gunzips client-side
  ".bin": "application/octet-stream",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

createServer(async (req, res) => {
  // cross-origin isolation — the whole point of needing a special server
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  let path = decodeURIComponent((req.url || "/").split("?")[0]);
  if (path === "/") path = "/index.html";
  // contain to ROOT (no path traversal)
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }

  try {
    const s = await stat(file);
    if (s.isDirectory()) { res.writeHead(404).end("not found"); return; }
    const body = await readFile(file);
    res.setHeader("Content-Type", MIME[extname(file)] || "application/octet-stream");
    res.setHeader("Content-Length", body.length);
    res.writeHead(200).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`TempleOS-wasm → http://localhost:${PORT}`));
