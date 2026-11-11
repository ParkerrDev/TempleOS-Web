import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {resolve} from "node:path";
import {HEMU_SRC,SITE_DIR} from "../../engine/compile.js";
import {makeDisk} from "../../engine/qcow2.js";

export function SnapshotRead(smp=false)
{//Tracked RAM images, with LIVE available for an explicit alternate machine.
  if (process.env.LIVE)
    return readFileSync(process.env.LIVE);
  return gunzipSync(readFileSync(resolve(HEMU_SRC,"..",
        smp?"live-smp.bin.gz":"live.bin.gz")));
}

export function DiskRead()
{//Each test has its own sector overlay; the bundled disk stays untouched.
  let bytes;
  if (process.env.RAW)
    bytes=readFileSync(process.env.RAW);
  else
    bytes=gunzipSync(readFileSync(resolve(SITE_DIR,
          "vendor/images/templeos-hd.qcow2.gz")));
  return makeDisk(bytes);
}
