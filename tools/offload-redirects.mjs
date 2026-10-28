// offload-redirects.mjs - write ./_redirects so the big downloads leave Netlify's bandwidth:
//   node tools/offload-redirects.mjs        (the Netlify build runs it last, see netlify.toml)
// Every visitor fetches the 43 MB disk image and a 10 MB RAM snapshot, which used up the whole
// month's Netlify bandwidth in October 2026. They are 302'd to the templeosweb-files Worker instead
// (cdn/worker.js: R2 behind it, filled from raw GitHub on first request, CORS and CORP set so COEP
// credentialless is happy), each pinned to a commit: the disk to the last commit that changed it, so
// unrelated commits reuse the copy already in R2, the snapshots to the HEMU commit cloned next to
// this build, so a snapshot always matches the engine compiled from that same HEMU (a mismatched
// pair is the BADOP crash).
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CDN = "https://templeosweb-files.parkerrhunt.workers.dev";
const DISK = "vendor/images/templeos-hd.qcow2.gz";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const site = git("log", "-1", "--format=%H", "--", DISK);   // a shallow clone gives its tip, still right
const hemu = git("-C", "hemu", "rev-parse", "HEAD");
// fail the build (the live deploy stays) rather than publish redirects to nowhere
for (const sha of [site, hemu]) if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`no commit to pin: "${sha}"`);
const rules = [
  [`/${DISK}`, `${CDN}/TempleOS-Web/${site}/${DISK}`],
  ["/hemu/live.bin.gz", `${CDN}/HEMU/${hemu}/live.bin.gz`],
  ["/hemu/live-smp.bin.gz", `${CDN}/HEMU/${hemu}/live-smp.bin.gz`],
];
// 302! forces the rule even though the file is also in the publish directory (Netlify shadowing).
writeFileSync("_redirects", rules.map(([from, to]) => `${from} ${to} 302!`).join("\n") + "\n");
console.log(`_redirects: disk @ ${site.slice(0, 7)}, snapshots @ HEMU ${hemu.slice(0, 7)}`);
