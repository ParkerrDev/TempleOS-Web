import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {GuestHarness} from "./GuestHarness.mjs";

const source=readFileSync(new URL("./RasterAlias.HC",import.meta.url)),
  hash=createHash("sha256").update(source).digest("hex"),
  file=new URL("./raster-alias.json",import.meta.url);
if(process.argv.includes("--record")) {
  assert.ok(process.env.HOLYC_QEMU_ORACLE,"Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),
    result=await QemuRun([source],{timeout:120}),row=result.results[0];
  assert.equal(row.except,"");
  assert.equal(row.out.trim().split("\n").length,30,row.out);
  writeFileSync(file,JSON.stringify({backend:result.backend,sourceHash:hash,out:row.out},null,2)+"\n");
  console.log("Native raster aliases:",result.evidence);
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash,expected.sourceHash,"regenerate original V5.03 evidence after changing the probe");
const h=await GuestHarness({exports:["RasterEnabled","RasterCount"],extraSource:`
U0 RasterEnabled(Bool on)
{
  if (on) {g_raster_n=2;g_poly3_hle=GuestFun("GrFillPoly3");}
  else {g_raster_n=0;g_poly3_hle=0;}
}
I64 RasterCount() {return g_raster_calls;}`}),{ex,gx,base,Name}=h;
let fast=0;
for(const enabled of [false,true]) {
  ex.RasterEnabled(enabled?1n:0n);
  const before=ex.RasterCount();
  await h.Exec(source.toString("latin1"));
  const ptr=Number(ex.GuestVar(Name("alias_res"))),
    cnt=gx.rd64(Number(ex.GuestVar(Name("alias_cnt")))),dv=new DataView(ex.memory.buffer),rows=[];
  assert.equal(cnt,30);
  for(let i=0;i<cnt;i++) {
    const values=[];
    for(let j=0;j<7;j++)values.push(dv.getBigUint64(base+ptr+(i*7+j)*8,true).toString(16).toUpperCase().padStart(16,"0"));
    rows.push(values.join(" ")+" ");
  }
  assert.equal(rows.join("\n")+"\n",expected.out,`original QEMU/KVM raster parity; acceleration=${enabled}`);
  if(!enabled)assert.equal(ex.RasterCount(),before,"native path must not call HLE");
  else {fast=Number(ex.RasterCount()-before);assert.ok(fast>0,"enabled run exercises raster acceleration");}
}
console.log(`Raster: 30 original QEMU/KVM cases match native and accelerated pixels, depth, changed/collision counts, probability and random seed (${fast} accelerated spans).`);
