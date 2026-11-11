import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {MkvClip} from "../../clip/Mkv.js";
const oracle_root=process.env.HOLYC_WASM || new URL("../../holyc-wasm/",import.meta.url).pathname,
  {QemuRun}=await import(pathToFileURL(resolve(oracle_root,"tests/oracle/Qemu.mjs"))),
  root=new URL("../../",import.meta.url),source=await readFile(new URL("clip/Mkv.HC",root),"utf8"),
  files=[],expected=[];
globalThis.fetch=async url=>new Response(await readFile(url));
for (const name of ["source.mkv","source.webm"]) {
  const bytes=await readFile(new URL("tmp/clip/"+name,root)),r=await MkvClip({total:bytes.length,
    async Read(pos,size) {return bytes.subarray(pos,pos+size);}},7.15,10.65);
  let hash=0xcbf29ce484222325n;
  for (const byte of new Uint8Array(r.buf)) hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
  expected.push("MKV:"+r.buf.byteLength+":"+hash.toString(16).toUpperCase().padStart(16,"0"));
  files.push({name:name.toUpperCase().replace("WEBM","WEB"),bytes});
}
const run=source+String.raw`
U0 MkNativeCheck(U8 *file)
{
  I64 size,pos=0,n,id,i,hash=0xCBF29CE484222325;
  U8 *buf=FileRead(file,&size);
  MkReset;
  while (pos<size) {
    id=MkScan(buf+pos,MinI64(16,size-pos),pos,size);
    n=MkScanSize;
    if (id==0x18538067) pos+=MkScanHead;
    else {
      if (id==0x1A45DFA3 || id==0x114D9B74 || id==0x1549A966 ||
          id==0x1654AE6B || id==0x1C53BB6B)
        if (!MkMeta(buf+pos,n)) break;
      if (id<0) break;
      pos+=n;
    }
  }
  if (!mk_error && MkPlan(7.15,10.65)) {
    pos=MkReadStart;
    while (pos<MkReadEnd) {
      id=MkScan(buf+pos,MinI64(16,size-pos),pos,size);
      n=MkScanSize;
      if (id<0) break;
      if (id==0x1F43B675 && !MkClusterPut(buf+pos,n)) break;
      pos+=n;
    }
    if (!mk_error && MkFinish) {
      n=MkResultSize;
      for (i=0;i<n;i++) hash=(hash^mk_out[i])*0x100000001B3;
      "MKV:%d:%016X\n",n,hash;
    }
  }
  if (mk_error) "ERROR:%s\n",mk_error;
  MkReset;Free(buf);
}
MkNativeCheck("C:/ORACLE/SOURCE.MKV");
MkNativeCheck("C:/ORACLE/SOURCE.WEB");
`;
const result=await QemuRun([run],{files,timeout:90});
console.log(JSON.stringify(result));
for (const check of expected) assert(JSON.stringify(result).includes(check),check);
console.log("Matroska/WebM native V5.03 and WASM output lengths and FNV-1a hashes match.");
