import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {compileHolyC} from "../../hemu/holyc-wasm/src/compiler.js";
import {createTaskHost} from "../../hemu/holyc-wasm/src/runtime/tasks.js";
import {gameProgram} from "./GameSrc.js";

const raw=(await readFile(new URL("../../holycraft/HolyCraft.HC",import.meta.url),"latin1")).replace(/HolyCraft;\s*$/,""),
  probe=await readFile(new URL("GameRender.HC",import.meta.url),"latin1"),
  source=gameProgram(raw)+"\n"+probe,
  native=JSON.parse(await readFile(new URL("GameRender.native.json",import.meta.url)));
assert.equal(createHash("sha256").update(source,"latin1").digest("hex"),native.sourceSha256);
assert.equal(native.backend.engine,"qemu");assert.equal(native.except,"");
let output="";
const compiled=compileHolyC(source,{lenient:false}),host=createTaskHost({
  jit:compiled.jit,ansi:false,onText:text=>output+=text,gfx:{palette(){}}}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);
try {await host.run();} finally {await host.dispose();}
assert.equal(output,native.output,"Three seeded 640×480 camera views match native TempleOS pixels");
console.log("HolyCraft: three full-resolution renderer fingerprints match QEMU/KVM TempleOS V5.03.");
