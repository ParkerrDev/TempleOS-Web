import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHost} from "../../holyc-wasm/src/runtime/host.js";
import {hemuFile} from "../../engine/compile.js";

const probe=readFileSync(new URL("./DevNative.HC",import.meta.url)),
  sources=Object.fromEntries(["Dev","time","keyboard"].map(name=>[name,hemuFile(name)])),
  hash=bytes=>createHash("sha256").update(bytes).digest("hex"),
  expand=s=>s.replace(/#include "([^"]+)"/g,(_,name)=>expand(sources[name])),
  source=expand(probe.toString("latin1")),file=new URL("./dev-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  const module=process.env.HOLYC_QEMU_ORACLE;
  if(!module)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
  const {QemuRun}=await import(pathToFileURL(module));
  const result=await QemuRun([Buffer.from('Option(OPTf_WARN_PAREN,ON);\n'+source,"latin1")],
    {timeout:180}),row=result.results[0];
  assert.equal(row.except,"");assert.match(row.out,/^[0-9A-F \n]+$/);
  assert.ok(row.out.trim().split("\n").length>400,row.out);
  writeFileSync(file,JSON.stringify({backend:result.backend,probeHash:hash(probe),
    sourceHash:hash(Buffer.from(source,"latin1")),out:row.out},null,2)+"\n");
  console.log("Native devices:",result.evidence);
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash(probe),expected.probeHash,"regenerate the native fixture after changing the probe");
assert.equal(hash(Buffer.from(source,"latin1")),expected.sourceHash,"regenerate the native fixture after changing a module");
const compiled=compileHolyC(probe.toString("latin1"),{filename:"DevNative.HC",lenient:false,
  includeResolver:name=>sources[name]});
assert.deepEqual(compiled.warnings,[]);
let output="";
const host=createHost({onText:text=>output+=text}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);instance.exports.__rt_init();instance.exports.__main();
assert.equal(output,expected.out);
console.log(`${output.trim().split("\n").length} device outputs match original V5.03: PIC vectors/EOI, CMOS, PS/2 commands, speaker, DAC, ATA widths/counts/commands and reset.`);
