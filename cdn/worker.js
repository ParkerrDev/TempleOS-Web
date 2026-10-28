// worker.js - templeosweb-files, the Cloudflare Worker that serves the site's big downloads from R2:
//   https://templeosweb-files.parkerrhunt.workers.dev/<repo>/<commit>/<path>
// tools/offload-redirects.mjs points Netlify's _redirects here, pinned to the commits the build used.
// The first request for a pinned file copies it from raw.githubusercontent.com into the R2 bucket;
// every later one is served from R2, whose downloads cost nothing. A commit pins the bytes, so the
// response is immutable. Objects expire from the bucket 30 days after upload (an R2 lifecycle rule on
// the bucket, not in wrangler.toml), which drops old commits' copies; a live one is just fetched again.
// Only the files below are served, so this is no open proxy onto GitHub.
//   deploy: cd cdn && npx wrangler deploy
const FILES = new Set([
  "TempleOS-Web/vendor/images/templeos-hd.qcow2.gz",
  "HEMU/live.bin.gz",
  "HEMU/live-smp.bin.gz",
]);
const CORS = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
const fail = (status, text) => new Response(text, { status, headers: CORS });

// Stream the pinned file from GitHub into the bucket (raw GitHub sends these uncompressed, with a length).
async function fill(env, key) {
  const src = await fetch(`https://raw.githubusercontent.com/ParkerrDev/${key}`);
  const len = Number(src.headers.get("content-length"));
  if (!src.ok || !len) { await src.body?.cancel(); return `github ${src.status}`; }
  const { readable, writable } = new FixedLengthStream(len);
  await Promise.all([src.body.pipeTo(writable), env.FILES.put(key, readable)]);
  return null;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, HEAD" } });
    if (req.method !== "GET" && req.method !== "HEAD") return fail(405, "method not allowed");
    const m = new URL(req.url).pathname.match(/^\/(TempleOS-Web|HEMU)\/([0-9a-f]{40})\/(.+)$/);
    if (!m || !FILES.has(`${m[1]}/${m[3]}`)) return fail(404, "not found");
    const key = `${m[1]}/${m[2]}/${m[3]}`;
    if (!(await env.FILES.head(key))) {
      const err = await fill(env, key);
      if (err) return fail(502, err);
    }
    const obj = req.method === "HEAD" ? await env.FILES.head(key) : await env.FILES.get(key, { onlyIf: req.headers });
    if (!obj) return fail(502, "missing after fill");
    const headers = new Headers(CORS);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("ETag", obj.httpEtag);
    if (req.method === "GET" && !("body" in obj)) return new Response(null, { status: 304, headers });
    headers.set("Content-Length", String(obj.size));
    return new Response(req.method === "HEAD" ? null : obj.body, { headers });
  },
};
