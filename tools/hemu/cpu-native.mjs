import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {hemuFile,compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
const adapter=readFileSync(new URL("./CpuNativeHost.HC",import.meta.url),"latin1"),
  expand=source=>source.replace(/#include "([^"]+)"/g,(_,name)=>
    name==="host.HC"?adapter:expand(hemuFile(name))),
  source=expand(hemuFile("test.HC")),
  hash=createHash("sha256").update(Buffer.from(source,"latin1")).digest("hex"),
  file=new URL("./cpu-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  const oracle=process.env.HOLYC_QEMU_ORACLE;
  if(!oracle)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
  const {QemuRun}=await import(pathToFileURL(oracle)),
    result=await QemuRun([Buffer.from(source,"latin1")],{timeout:180}),row=result.results[0];
  console.log("Native interpreter:",result.evidence);
  assert.equal(row.except,"");assert.doesNotMatch(row.out,/WARNING|ERROR|FAIL/);
  assert.match(row.out,/hemu: 31 passed, 0 failed .*badop=0/);
  writeFileSync(file,JSON.stringify({backend:result.backend,sourceHash:hash,out:row.out},null,2)+"\n");
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash,expected.sourceHash,"rerun original V5.03 after changing the interpreter or its native fixture");
const compiled=compileHemu({filename:"test.HC"});assert.deepEqual(compiled.warnings,[]);
let output="";
const host=createHemuHost({onText:text=>output+=text}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);instance.exports.__rt_init();instance.exports.__main();
assert.equal(output,expected.out);
const total=Number(expected.out.match(/total guest instr=(\d+)/)[1]);
console.log(`Full interpreter source compiles natively: 31 checks and ${total.toLocaleString()} executed guest instructions agree in original V5.03 and WASM; zero badops.`);
