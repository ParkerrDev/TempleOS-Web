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
import { writeFileSync } from "node:fs";
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

const rules = OWN.map(([path, dir]) => {
  const sha = pinned(git("log", "-1", "--format=%H", "--", path));   // a shallow clone gives its tip, still right
  return dir ? [`/${path}/*`, `${CDN}/TempleOS-Web/${sha}/${path}/:splat`] : [`/${path}`, `${CDN}/TempleOS-Web/${sha}/${path}`];
});
const hemu = pinned(git("-C", "hemu", "rev-parse", "HEAD"));
rules.push(["/hemu/live.bin.gz", `${CDN}/HEMU/${hemu}/live.bin.gz`], ["/hemu/live-smp.bin.gz", `${CDN}/HEMU/${hemu}/live-smp.bin.gz`]);
// 302! forces the rule even though the file is also in the publish directory (Netlify shadowing).
writeFileSync("_redirects", rules.map(([from, to]) => `${from} ${to} 302!`).join("\n") + "\n");
console.log(rules.map(([from, to]) => `${from} -> ${to.slice(CDN.length + 1, CDN.length + 21)}...`).join("\n"));
