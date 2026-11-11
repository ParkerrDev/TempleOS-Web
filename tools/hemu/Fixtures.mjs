import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {resolve} from "node:path";
import {HEMU_SRC,SITE_DIR} from "../../engine/compile.js";
import {makeDisk} from "../../engine/qcow2.js";
import {StockManifestCheck,StockOverlayApply} from "../../engine/Stock.js";
const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function Stock(smp) {
  const path=resolve(HEMU_SRC,"../stock.json");
  if(!existsSync(path))return null;
  const manifest=StockManifestCheck(JSON.parse(readFileSync(path,"utf8")));
  return {manifest,capture:manifest.captures.find(c=>c.cores===(smp?4:1))};
}

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

export function SnapshotRead(smp=false)
{//Tracked RAM images, with LIVE available for an explicit alternate machine.
  const file=SnapshotFile(smp),raw=readFileSync(file.path),stock=Stock(smp);
  if(stock&&Hash(raw)!==(file.gzip?stock.capture.gzipSha256:stock.capture.ramSha256))
    throw Error("Snapshot fixture is missing matching captured CPU state");
  return file.gzip?gunzipSync(raw):raw;
}

export function DiskRead(smp=false)
{//Each test has its own sector overlay; the bundled disk stays untouched.
  const file=DiskFile(),raw=readFileSync(file.path),stock=Stock(smp);
  if(!stock||process.env.RAW)return makeDisk(file.gzip?gunzipSync(raw):raw);
  const {manifest,capture}=stock,patch=readFileSync(resolve(HEMU_SRC,"..",capture.overlay));
  if(Hash(raw)!==manifest.base.gzipSha256||Hash(patch)!==capture.overlaySha256)
    throw Error("Stock disk fixture checksum");
  return StockOverlayApply(makeDisk(gunzipSync(raw)),patch,capture);
}

export function FixtureInputs(smp=false)
{
  const inputs=Object.fromEntries(Object.entries({snapshot:SnapshotFile(smp),disk:DiskFile()}).
    map(([name,file])=>[name,{gzip:file.gzip,
      sha256:createHash("sha256").update(readFileSync(file.path)).digest("hex")}]));
  const stock=Stock(smp);
  if(stock)inputs.capture={ramSha256:stock.capture.ramSha256,registerSha256:stock.capture.registerSha256,
    diskSha256:stock.capture.diskSha256,overlaySha256:stock.capture.overlaySha256};
  return inputs;
}
