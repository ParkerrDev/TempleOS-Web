import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {gzipSync} from "node:zlib";
import {SnapshotInspect} from "../../engine/Snapshot.js";

const file=process.env.HEMU_NATIVE_FIXTURE;
assert.ok(file,"Set HEMU_NATIVE_FIXTURE to a complete one-core saved session");
const original=readFileSync(file),head=await SnapshotInspect(original),dir=mkdtempSync(join(tmpdir(),"hemu-native-format-")),
  binary=resolve("build/native/hemu-native");
function Pack(meta,engine=head.wasm,rawJson) {
  const json=rawJson||Buffer.from(JSON.stringify(meta)),lead=Buffer.alloc(12);
  lead.write("HEMUSNP1");lead.writeUInt32LE(json.length,8);
  return gzipSync(Buffer.concat([lead,json,engine]));
}
try {
  const crc=Buffer.from(original);crc[crc.length-5]^=1;
  const cases=[
    ["two-cores",Pack({...head.meta,cores:2}),/machine dimensions/],
    ["four-cores",Pack({...head.meta,cores:4}),/supports one CPU/],
    ["protocol",Pack({...head.meta,version:2,cores:4,requiredBusProtocol:1}),/requires shared RAM protocol/],
    ["huge-ram",Pack({...head.meta,memoryBytes:2**40}),/machine dimensions/],
    ["engine-hash",Pack({...head.meta,engineHash:"0".repeat(64)}),/engine checksum/],
    ["engine-truncated",Pack(head.meta,head.wasm.subarray(0,100)),/truncated data/],
    ["utf8",Pack(head.meta,head.wasm,Buffer.from([123,255,125])),/UTF-8/],
    ["ram-only",gzipSync(Buffer.alloc(128)),/raw RAM lacks CPU and disk state/],
    ["truncated-gzip",original.subarray(0,original.length-8),/Truncated gzip/],
    ["crc",crc,/Corrupt gzip/],
    ["trailing",Buffer.concat([original,Buffer.from("extra")]),/Corrupt gzip/]
  ];
  for(const [name,bytes,expected]of cases) {
    const path=join(dir,name+".hemu");writeFileSync(path,bytes);
    const result=spawnSync(binary,["check",path],{encoding:"utf8",timeout:30000});
    assert.equal(result.status,1,name+": "+result.stdout+result.stderr);assert.match(result.stderr,expected,name);
  }
  console.log(`${cases.length} actual JavaScriptCore full-reader refusals: unsupported topology/ownership, metadata, engine, UTF-8, raw RAM, gzip truncation/CRC/trailing bytes.`);
} finally {rmSync(dir,{recursive:true,force:true});}
