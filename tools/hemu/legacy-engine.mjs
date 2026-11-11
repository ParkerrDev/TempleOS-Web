//Explicit fixture generation: keep an old engine independent of current sources.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {dirname,extname} from "node:path";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {HEMU_SRC} from "../../engine/compile.js";
const [ref,compilerRef]=process.argv.slice(2);
if(!ref||!compilerRef)throw new Error("Usage: node tools/hemu/legacy-engine.mjs ENGINE_REF COMPILER_REF (use the matching compiler checkout)");
const old=new Map(),cwd=dirname(HEMU_SRC),git=(...args)=>execFileSync("git",args,{cwd,encoding:"latin1"});
function Read(name) {
  if(!extname(name))name+=".HC";
  if(!old.has(name))old.set(name,git("show",ref+":src/"+name));
  return old.get(name);
}
//This is the historical host interface, not the current export list.
const exports=["RdMem","WrMem","Step","RasterHLE","RunCore","GuestCallPost","GuestCallTry",
  "GuestCallState","GuestCallRes","GuestCallAck","GuestInfo","GuestPatchJump","GuestFun",
  "GuestArgCnt","GuestVar","GuestMember","RamBase","CoreAttach","KbdRptSet","WinRateSet","SnapshotResume"],
  c=compileHolyC(Read("snapshot.HC"),{filename:"snapshot.HC",lenient:false,sharedMemory:true,
    defines:{SMP_SNAP:"1"},exports,includeResolver:Read});
assert.deepEqual(c.warnings,[]);
const module=new WebAssembly.Module(c.bytes);
assert.ok(!WebAssembly.Module.exports(module).some(x=>x.name==="CpuFault"));
const ram=execFileSync("git",["show",ref+":live-smp.bin.gz"],{cwd,maxBuffer:32*1024*1024});
const hash=createHash("sha256").update(c.bytes).digest("hex"),
  meta={engineRef:git("rev-parse",ref).trim(),compilerRef,sha256:hash,bytes:c.bytes.length,
    ramSha256:createHash("sha256").update(ram).digest("hex"),ramBytes:ram.byteLength,ramRef:ref+":live-smp.bin.gz",
    diskSha256:createHash("sha256").update(readFileSync(new URL("../../vendor/images/templeos-hd.qcow2.gz",import.meta.url))).digest("hex"),
    heapAbi:1,globals:{g_ipi_pending:Number(c.globals.get("g_ipi_pending").addr)}};
writeFileSync(new URL("./fixtures/legacy-smp.wasm",import.meta.url),c.bytes);
writeFileSync(new URL("./fixtures/legacy-smp.ram.gz",import.meta.url),ram);
writeFileSync(new URL("./fixtures/legacy-smp.json",import.meta.url),JSON.stringify(meta,null,2)+"\n");
console.log(meta);
