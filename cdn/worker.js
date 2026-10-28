// worker.js - templeosweb-files, the Cloudflare Worker that serves the site's heavy files from R2:
//   https://templeosweb-files.parkerhunt.me/<repo>/<commit>/<path>   (also on parkerrhunt.workers.dev)
// tools/offload-redirects.mjs points Netlify's _redirects here, pinned to the commits the build used.
// The first request for a pinned file copies it from raw.githubusercontent.com into the R2 bucket;
// later ones are served from R2, whose downloads cost nothing, and on the custom domain from
// Cloudflare's edge cache in front of it (the Cache API does nothing on workers.dev). A commit pins
// the bytes, so every response is immutable. Objects expire from the bucket 30 days after upload (an
// R2 lifecycle rule on the bucket, not in wrangler.toml), which drops old commits' copies; a live one
// is just fetched again. Only the files and folders below are served: this is no open proxy.
//   deploy: cd cdn && npx wrangler deploy
const FILES = new Set([
  "TempleOS-Web/vendor/images/templeos-hd.qcow2.gz",
  "TempleOS-Web/vendor/ffmpeg/core/ffmpeg-core.wasm",
  "TempleOS-Web/assets/terry-sprites.gr.gz",
  "HEMU/live.bin.gz",
  "HEMU/live-smp.bin.gz",
]);
const DIRS = ["TempleOS-Web/assets/transcripts/", "TempleOS-Web/games/upstream/"];
const TYPES = { wasm: "application/wasm", json: "application/json" };   // wasm streams-compiles only with its type
const CORS = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
const fail = (status, text) => new Response(text, { status, headers: CORS });
const served = (p) => !p.includes("..") && (FILES.has(p) || DIRS.some((d) => p.startsWith(d)));

// Copy the pinned file from GitHub into the bucket. Big binaries come uncompressed with a length and
// are streamed; text comes gzipped (fetch decodes it, so the length is unknown) and is small, so it is read whole.
async function fill(env, key) {
  const src = await fetch(`https://raw.githubusercontent.com/ParkerrDev/${key}`);
  if (!src.ok) { await src.body?.cancel(); return `github ${src.status}`; }
  const len = Number(src.headers.get("content-length"));
  if (src.headers.get("content-encoding") || !len) { await env.FILES.put(key, await src.arrayBuffer()); return null; }
  const { readable, writable } = new FixedLengthStream(len);
  await Promise.all([src.body.pipeTo(writable), env.FILES.put(key, readable)]);
  return null;
}

function headersFor(key, obj) {
  const h = new Headers(CORS);
  h.set("Content-Type", TYPES[key.split(".").pop()] || "application/octet-stream");
  h.set("Cache-Control", "public, max-age=31536000, immutable");
  h.set("ETag", obj.httpEtag);
  h.set("Content-Length", String(obj.size));
  return h;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, HEAD" } });
    if (req.method !== "GET" && req.method !== "HEAD") return fail(405, "method not allowed");
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/(TempleOS-Web|HEMU)\/([0-9a-f]{40})\/(.+)$/);
    if (!m || !served(`${m[1]}/${m[3]}`)) return fail(404, "not found");
    const key = `${m[1]}/${m[2]}/${m[3]}`;
    const edge = new Request(url.origin + url.pathname);           // cache key: no query, no conditional headers
    const cached = !url.hostname.endsWith(".workers.dev");
    const inm = req.headers.get("If-None-Match");
    const hit = cached && req.method === "GET" && await caches.default.match(edge);
    if (hit) {
      if (inm && inm === hit.headers.get("ETag")) { await hit.body?.cancel(); return new Response(null, { status: 304, headers: hit.headers }); }
      return hit;
    }
    // one R2 call on the usual path; onlyIf answers If-None-Match with a body-less object (a 304)
    const read = () => req.method === "HEAD" ? env.FILES.head(key) : env.FILES.get(key, { onlyIf: req.headers });
    let obj = await read();
    if (!obj) {
      const err = await fill(env, key);
      if (err) return fail(502, err);
      obj = await read();
      if (!obj) return fail(502, "missing after fill");
    }
    const headers = headersFor(key, obj);
    if (req.method === "HEAD") return new Response(null, { headers });
    if (!("body" in obj)) return new Response(null, { status: 304, headers });
    // a second read feeds the edge cache, so the visitor's stream is never teed and held in memory
    if (cached) ctx.waitUntil(env.FILES.get(key).then((o) => o && caches.default.put(edge, new Response(o.body, { headers }))));
    return new Response(obj.body, { headers });
  },
};
