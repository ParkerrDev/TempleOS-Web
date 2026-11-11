import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHost} from "../../holyc-wasm/src/runtime/host.js";
import {hemuFile} from "../../engine/compile.js";

const probe=readFileSync(new URL("./MemNative.HC",import.meta.url)),source=hemuFile("Mem.HC"),
  hash=bytes=>createHash("sha256").update(bytes).digest("hex"),
  file=new URL("./mem-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  const module=process.env.HOLYC_QEMU_ORACLE;
  if(!module)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
  const {QemuRun}=await import(pathToFileURL(module));
  // The native host implements the atomic import with TempleOS's LOCK XCHG.
  const code=Buffer.from('Option(OPTf_WARN_PAREN,ON);\n#define __a_xchg64 LXchgI64\n'+
    probe.toString("latin1").replace('#include "Mem"',source),"latin1");
  const result=await QemuRun([code],{timeout:120}),row=result.results[0];
  assert.equal(row.except,"");assert.match(row.out,/^[0-9A-F \n]+$/);
  assert.equal(row.out.trim().split("\n").length,324,row.out);
  writeFileSync(file,JSON.stringify({backend:result.backend,probeHash:hash(probe),
    sourceHash:hash(Buffer.from(source,"latin1")),out:row.out},null,2)+"\n");
  console.log("Native memory module:",result.evidence);
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash(probe),expected.probeHash,"regenerate the native fixture after changing the probe");
assert.equal(hash(Buffer.from(source,"latin1")),expected.sourceHash,"regenerate the native fixture after changing the module");
const compiled=compileHolyC(probe.toString("latin1"),{filename:"MemNative.HC",lenient:false,
  includeResolver:name=>name==="Mem"?source:null});
assert.deepEqual(compiled.warnings,[]);
let output="";
const host=createHost({onText:text=>output+=text}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);instance.exports.__rt_init();instance.exports.__main();
assert.equal(output,expected.out);
console.log("324 memory/module outputs match native V5.03: unaligned widths, RAM aliases, boundary padding, saved-device offsets and IPI destinations.");
