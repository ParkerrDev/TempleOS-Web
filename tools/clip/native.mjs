import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const oracle_root=process.env.HOLYC_WASM || new URL("../../holyc-wasm/",import.meta.url).pathname;
const {QemuRun}=await import(pathToFileURL(resolve(oracle_root,"tests/oracle/Qemu.mjs")));

const root=new URL("../../",import.meta.url),source=await readFile(new URL("clip/Mp4.HC",root),"utf8"),
  bytes=await readFile(new URL("tmp/clip/source.mp4",root)),
  result=await readFile(new URL("tmp/clip/cut.mp4",root));
let moov;
for (let pos=0;pos<bytes.length;pos+=bytes.readUInt32BE(pos))
  if (bytes.toString("ascii",pos+4,pos+8)=="moov") {
    moov=bytes.subarray(pos,pos+bytes.readUInt32BE(pos));break;
  }
let hash=0xcbf29ce484222325n;
for (const byte of result) hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
const run=source+String.raw`
U0 ClipNativeCheck()
{
  I64 size,n,pos,i,hash=0xCBF29CE484222325;
  U8 *moov=FileRead("C:/ORACLE/MOOV.BIN",&size),
        *src=FileRead("C:/ORACLE/SOURCE.MP4");
  if (!ClipPlan(moov,size,${bytes.length},7.15,10.65))
    "ERROR:%s\n",ClipError;
  else {
    while ((pos=ClipReadPos)>=0) ClipReadPut(src+pos,ClipReadSize);
    n=ClipResultSize;
    for (i=0;i<n;i++) hash=(hash^clip_out[i])*0x100000001B3;
    "CLIP:%d:%016X\n",n,hash;
  }
  ClipDel;
  Free(moov);Free(src);
}
ClipNativeCheck;
`;
const oracle=await QemuRun([run],{files:[{name:"MOOV.BIN",bytes:moov},
  {name:"SOURCE.MP4",bytes}],timeout:60});
console.log(JSON.stringify(oracle));
assert(JSON.stringify(oracle).includes("CLIP:"+result.length+":"+hash.toString(16).toUpperCase().padStart(16,"0")));
console.log("MP4 native V5.03 and WASM outputs have matching lengths and FNV-1a hashes.");
