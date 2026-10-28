// offload-redirects.mjs - write ./_redirects so the big downloads leave Netlify's bandwidth:
//   node tools/offload-redirects.mjs        (the Netlify build runs it last, see netlify.toml)
// Every visitor fetches the 43 MB disk image and a 10 MB RAM snapshot, which used up the whole
// month's Netlify bandwidth in October 2026. They are 302'd to raw.githubusercontent.com instead
// (it sends Access-Control-Allow-Origin: * and CORP cross-origin, so COEP credentialless is happy),
// each pinned to the exact commit this build uses: the disk to the commit being built
// ($COMMIT_REF), the snapshots to the HEMU commit cloned next to it, so a snapshot always matches
// the engine compiled from that same HEMU (a mismatched pair is the BADOP crash).
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const RAW = "https://raw.githubusercontent.com/ParkerrDev";
const rev = (dir) => execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const site = process.env.COMMIT_REF || rev(".");
const hemu = rev("hemu");
const rules = [
  ["/vendor/images/templeos-hd.qcow2.gz", `${RAW}/TempleOS-Web/${site}/vendor/images/templeos-hd.qcow2.gz`],
  ["/hemu/live.bin.gz", `${RAW}/HEMU/${hemu}/live.bin.gz`],
  ["/hemu/live-smp.bin.gz", `${RAW}/HEMU/${hemu}/live-smp.bin.gz`],
];
// 302! forces the rule even though the file is also in the publish directory (Netlify shadowing).
writeFileSync("_redirects", rules.map(([from, to]) => `${from} ${to} 302!`).join("\n") + "\n");
console.log(`_redirects: disk @ ${site.slice(0, 7)}, snapshots @ HEMU ${hemu.slice(0, 7)}`);
