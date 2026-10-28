// offload-redirects.mjs - write ./_redirects so the heavy files leave Netlify's bandwidth:
//   node tools/offload-redirects.mjs        (the Netlify build runs it last, see netlify.toml)
// Every visitor fetches the 43 MB disk image and a 10 MB RAM snapshot, which used up the whole
// month's Netlify bandwidth in October 2026; Terry Search (10 MB of shards), the games (38 MB) and
// ffmpeg (32 MB) are as heavy when used. They are 302'd to the templeosweb-files Worker instead
// (cdn/worker.js: R2 behind it, filled from raw GitHub on first request, CORS and CORP set so COEP
// credentialless is happy), each pinned to a commit: this repo's files to the last commit that
// changed them, so unrelated commits reuse the copies already in R2, and the snapshots to the HEMU
// commit cloned next to this build, so a snapshot always matches the engine compiled from that same
// HEMU (a mismatched pair is the BADOP crash). A folder is pinned as a whole, so Terry Search's
// manifest always matches its shards and every game file matches games/catalog.json's checksums.
// Before writing, it HEADs every file behind every rule and wants the local file's length back: that
// makes the Worker copy anything missing into R2 now, so no visitor waits on GitHub, and a wrong host,
// pin or allowlist fails the build (the live deploy stays) instead of breaking the site.
import { writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CDN = "https://templeosweb-files.parkerrhunt.workers.dev";
const OWN = [                       // [path, folder?] - keep in step with FILES and DIRS in cdn/worker.js
  ["vendor/images/templeos-hd.qcow2.gz", false],
  ["vendor/ffmpeg/core/ffmpeg-core.wasm", false],
  ["assets/terry-sprites.gr.gz", false],
  ["assets/transcripts", true],
  ["games/upstream", true],
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
// fail the build (the live deploy stays) rather than publish redirects to nowhere
const pinned = (sha) => { if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`no commit to pin: "${sha}"`); return sha; };

// a shallow clone gives its tip, still right
const pins = OWN.map(([path, dir]) => [path, dir, pinned(git("log", "-1", "--format=%H", "--", path))]);
const hemu = pinned(git("-C", "hemu", "rev-parse", "HEAD"));
const SNAPSHOTS = ["live.bin.gz", "live-smp.bin.gz"];
const rules = pins.map(([path, dir, sha]) =>
  dir ? [`/${path}/*`, `${CDN}/TempleOS-Web/${sha}/${path}/:splat`] : [`/${path}`, `${CDN}/TempleOS-Web/${sha}/${path}`]);
rules.push(...SNAPSHOTS.map((f) => [`/hemu/${f}`, `${CDN}/HEMU/${hemu}/${f}`]));

const targets = pins.flatMap(([path, dir, sha]) =>
  (dir ? git("ls-files", path).split("\n") : [path]).map((f) => [f, `${CDN}/TempleOS-Web/${sha}/${f}`]));
targets.push(...SNAPSHOTS.map((f) => [`hemu/${f}`, `${CDN}/HEMU/${hemu}/${f}`]));
// identity: Cloudflare compresses JSON for a client that accepts it, and then sends no length
async function check([file, url]) {
  let got = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: "HEAD", headers: { "Accept-Encoding": "identity" }, signal: AbortSignal.timeout(120000) }).catch((e) => ({ status: e.message, headers: new Headers() }));
    if (r.ok && Number(r.headers.get("content-length")) === statSync(file).size) return;
    got = `${r.status}, ${r.headers.get("content-length")} bytes`;
  }
  throw new Error(`CDN check failed: ${url} (${got}; ${file} is ${statSync(file).size} bytes)`);
}
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => { while (next < targets.length) await check(targets[next++]); }));
console.log(`CDN check: all ${targets.length} files answer with their length`);
// 302! forces the rule even though the file is also in the publish directory (Netlify shadowing).
writeFileSync("_redirects", rules.map(([from, to]) => `${from} ${to} 302!`).join("\n") + "\n");
console.log(rules.map(([from, to]) => `${from} -> ${to.slice(CDN.length + 1, CDN.length + 21)}...`).join("\n"));
