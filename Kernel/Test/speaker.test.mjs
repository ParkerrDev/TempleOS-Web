import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {GuestHarness} from "./GuestHarness.mjs";

const source=readFileSync(new URL("./SpeakerNative.HC",import.meta.url)),
  hash=bytes=>createHash("sha256").update(bytes).digest("hex"),
  fixture=new URL("./speaker-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  if(!process.env.HOLYC_QEMU_ORACLE)throw Error("Set HOLYC_QEMU_ORACLE to the native Qemu.mjs runner");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),
    result=await QemuRun([source],{timeout:180}),row=result.results[0];
  assert.equal(row.except,"");
  const values=row.out.trim().split(/\s+/).map(Number);
  assert.equal(values.length,275);assert.ok(values.every(x=>Number.isInteger(x)&&x>=0&&x<4));
  writeFileSync(fixture,JSON.stringify({backend:result.backend,sourceHash:hash(source),values},null,2)+"\n");
  console.log("Native speaker gates:",result.evidence);
}
const expected=JSON.parse(readFileSync(fixture)),h=await GuestHarness({exports:["IoIn","DevRst"]});
assert.equal(hash(source),expected.sourceHash);
await h.Exec(source.toString("latin1"));
const address=name=>Number(h.ex.GuestVar(h.Name(name))),base=address("speaker_read"),count=address("speaker_count");
assert.ok(base>0&&count>0);assert.equal(h.gx.rd64(count),expected.values.length);
assert.deepEqual(expected.values.map((_,i)=>h.gx.rd64(base+i*8)),expected.values,
  "actual guest IN/OUT and native Snd read-modify-write match original QEMU");
assert.equal(h.ex.IoIn(0x61n)&3n,0n,"Snd stops both gates");
h.ex.DevRst();assert.equal(h.ex.IoIn(0x61n)&3n,0n,"reset clears both gates");
console.log(`${expected.values.length} original-QEMU port0x61 gate reads match HEMU, including native Snd stop/restart and reset.`);
