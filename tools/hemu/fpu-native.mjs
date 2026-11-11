import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHost} from "../../holyc-wasm/src/runtime/host.js";
import {hemuFile} from "../../engine/compile.js";

const native=process.argv.includes("--record"),
  probe=readFileSync(new URL("./FpuNative.HC",import.meta.url)),source=hemuFile("Fpu.HC"),
  hash=bytes=>createHash("sha256").update(bytes).digest("hex"),
  file=new URL("./fpu-native.json",import.meta.url);
if(native) {
  const module=process.env.HOLYC_QEMU_ORACLE;
  if(!module)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
  const {QemuRun}=await import(pathToFileURL(module)),
    code=Buffer.from('Option(OPTf_WARN_PAREN,ON);\n'+probe.toString("latin1").replace('#include "Fpu"',source),"latin1"),
    result=await QemuRun([code],{timeout:120}),row=result.results[0];
  assert.equal(row.except,"");
  assert.equal(row.out.trim().split("\n").length,484,row.out);
  writeFileSync(file,JSON.stringify({backend:result.backend,probeHash:hash(probe),
    sourceHash:hash(Buffer.from(source,"latin1")),out:row.out},null,2)+"\n");
  console.log("Native FPU module:",result.evidence);
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash(probe),expected.probeHash,"regenerate the native fixture after changing the probe");
assert.equal(hash(Buffer.from(source,"latin1")),expected.sourceHash,"regenerate the native fixture after changing the module");
let output="";
const compiled=compileHolyC(probe.toString("latin1"),{filename:"FpuNative.HC",lenient:false,
  includeResolver:name=>name==="Fpu"?source:null});
assert.deepEqual(compiled.warnings,[]);
const host=createHost({onText:text=>output+=text}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);instance.exports.__rt_init();instance.exports.__main();
assert.equal(output,expected.out);
console.log("484 FPU module outputs match original V5.03 compilation: bit casts, sign operations, arithmetic, rounding, stores, constants and polar angle.");
