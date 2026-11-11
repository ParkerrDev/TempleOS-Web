import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {resolve} from "node:path";
import {compileHemu,HEMU_SRC,SITE_DIR} from "../../engine/compile.js";
import {makeDisk} from "../../engine/qcow2.js";
import {StockIdentify,StockInflate,StockManifestCheck,StockModuleCheck,StockOverlayApply} from "../../engine/Stock.js";
import {RegsRead,RegsSource} from "../snapshot/Regs.mjs";

const root=resolve(HEMU_SRC,".."),manifest=StockManifestCheck(JSON.parse(readFileSync(resolve(root,"stock.json")))),
  hash=b=>createHash("sha256").update(b).digest("hex"),
  base=readFileSync(resolve(SITE_DIR,"vendor/images/templeos-hd.qcow2.gz"));
assert.equal(hash(base),manifest.base.gzipSha256);
const decoded=gunzipSync(base),baseDisk=makeDisk(decoded),chunk=new Uint8Array(131072),baseHash=createHash("sha256");
for(let off=0;off<baseDisk.virtualSize;off+=chunk.length){baseDisk.readInto(off/512,chunk.length/512,chunk,0);baseHash.update(chunk);}
assert.equal(baseHash.digest("hex"),manifest.base.rawSha256);
for(const capture of manifest.captures) {
  const registers=readFileSync(resolve(root,capture.registers),"utf8"),
    source=readFileSync(resolve(HEMU_SRC,capture.cores===4?"snapregs-smp.HC":"snapregs.HC"),"utf8");
  assert.equal(hash(registers),capture.registerSha256);
  assert.equal(hash(source),capture.sourceSha256);
  assert.equal(RegsSource(RegsRead(registers,capture.cores)),source,"captured registers regenerate the compiled source exactly");
  const gz=readFileSync(resolve(root,capture.ram)),found=await StockIdentify(gz,capture.cores,manifest);
  assert.equal(found.capture,capture);assert.equal(found.ram,undefined,"known compression does not allocate a second RAM copy during preflight");
  assert.equal(hash(gunzipSync(gz)),capture.ramSha256);
  const module=new WebAssembly.Module(compileHemu({smp:capture.cores===4}).bytes);
  StockModuleCheck(module,capture,manifest);
  assert.throws(()=>StockModuleCheck(module,manifest.captures.find(c=>c!==capture),manifest),/does not match/);
  await assert.rejects(()=>StockIdentify(gz,capture.cores===1?4:1,manifest),/topology/);
  const patch=readFileSync(resolve(root,capture.overlay));
  assert.equal(hash(patch),capture.overlaySha256);
  const disk=makeDisk(decoded),bad=Buffer.from(patch);
  bad.writeUInt32LE(0xFFFFFFFF,0);
  assert.throws(()=>StockOverlayApply(disk,bad,capture),/out-of-range/);
  assert.equal(disk.overlay.size,0,"reject before applying even the first malformed sector");
  StockOverlayApply(disk,patch,capture);
  const actual=createHash("sha256");
  for(let off=0;off<disk.virtualSize;off+=chunk.length){disk.readInto(off/512,chunk.length/512,chunk,0);actual.update(chunk);}
  assert.equal(actual.digest("hex"),capture.diskSha256,"base plus tiny overlay reconstructs every captured disk byte");
}
assert.throws(()=>StockModuleCheck(new WebAssembly.Module(Uint8Array.of(0,97,115,109,1,0,0,0)),manifest.captures[0],manifest),/no matching captured CPU/);
await assert.rejects(()=>StockIdentify(gzipSync(new Uint8Array(64)),1,manifest),/truncated/);
await assert.rejects(()=>StockInflate(gzipSync(new Uint8Array(65)),64),/larger/);
await assert.rejects(()=>StockInflate(gzipSync(new Uint8Array(64)).subarray(0,12),64));
assert.throws(()=>StockManifestCheck({...manifest,version:2}),/unsupported/);
console.log("Stock capture identities: exact1/4 RAM and complete disk reconstruction, CPU-module pairing, topology and pre-mutation corruption refusal.");
