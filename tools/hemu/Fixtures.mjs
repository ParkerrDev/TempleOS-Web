import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {resolve} from "node:path";
import {HEMU_SRC,SITE_DIR} from "../../engine/compile.js";
import {makeDisk} from "../../engine/qcow2.js";

function SnapshotFile(smp)
{
  return process.env.LIVE?{path:process.env.LIVE,gzip:false}:
    {path:resolve(HEMU_SRC,"..",smp?"live-smp.bin.gz":"live.bin.gz"),gzip:true};
}

function DiskFile()
{
  return process.env.RAW?{path:process.env.RAW,gzip:false}:
    {path:resolve(SITE_DIR,"vendor/images/templeos-hd.qcow2.gz"),gzip:true};
}

function Bytes(file)
{
  const bytes=readFileSync(file.path);
  return file.gzip?gunzipSync(bytes):bytes;
}

export function SnapshotRead(smp=false)
{//Tracked RAM images, with LIVE available for an explicit alternate machine.
  return Bytes(SnapshotFile(smp));
}

export function DiskRead()
{//Each test has its own sector overlay; the bundled disk stays untouched.
  return makeDisk(Bytes(DiskFile()));
}

export function FixtureInputs(smp=false)
{
  return Object.fromEntries(Object.entries({snapshot:SnapshotFile(smp),disk:DiskFile()}).
    map(([name,file])=>[name,{gzip:file.gzip,
      sha256:createHash("sha256").update(readFileSync(file.path)).digest("hex")}]));
}
