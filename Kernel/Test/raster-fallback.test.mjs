import assert from "node:assert/strict";
import {GuestHarness} from "./GuestHarness.mjs";

const h=await GuestHarness({exports:["RasterEnabled","RasterCount"],extraSource:`
U0 RasterEnabled(Bool on)
{
  if (on) {g_raster_n=2;g_poly3_hle=GuestFun("GrFillPoly3");}
  else {g_raster_n=0;g_poly3_hle=0;}
}
I64 RasterCount() {return g_raster_calls;}`}),
  {ex,gx,base,Name}=h,slot=gx.scratch.base+0x6000;
await h.Exec(`CDC *fallback_dc=DCNew(5000,1);
fallback_dc->depth_buf=MAlloc(5000*4);
*(${slot})(I64 *)=fallback_dc;
U64 FallbackLine(CDC *dc,Bool polygon)
{
  U64 old_flags=Fs->task_flags,old_seed=Fs->rand_seed,res;
  I32 poly[9];
  Bts(&Fs->task_flags,TASKf_NONTIMER_RAND);
  Fs->rand_seed=0x123456789ABCDEF0;
  if (polygon) {
    poly[0]=0;poly[1]=0;poly[2]=40;
    poly[3]=4999;poly[4]=0;poly[5]=100;
    poly[6]=4999;poly[7]=1;poly[8]=200;
    res=GrFillPoly3(dc,3,poly);
  } else
    res=GrHLine(dc,0,4999,0,40,400);
  *(${slot+8})(U64 *)=Fs->rand_seed;
  Fs->task_flags=old_flags;Fs->rand_seed=old_seed;
  return res;
}`);
const dc=gx.rd64(slot),bytes=new Uint8Array(ex.memory.buffer),dv=new DataView(bytes.buffer),
  Member=n=>Number(ex.GuestMember(Name("CDC"),Name(n,0x7100))),
  body=gx.rd64(dc+Member("body")),depth=gx.rd64(dc+Member("depth_buf")),
  fn=Number(ex.GuestFun(Name("FallbackLine")));
async function Draw(enabled,polygon) {
  ex.RasterEnabled(enabled?1n:0n);
  bytes.fill(7,base+body,base+body+5000);
  new Int32Array(bytes.buffer,base+depth,5000).fill(0x7FFFFFFF);
  dv.setUint32(base+dc+Member("color"),0x8004000C,true);
  gx.wr64(dc+Member("dither_probability_u16"),25123);
  const before=ex.RasterCount(),count=await h.Call(fn,[dc,polygon?1:0],10000000);
  if(!enabled)assert.equal(ex.RasterCount(),before,"reference must use the original guest path");
  return {count,seed:dv.getBigUint64(base+slot+8,true),pixels:bytes.slice(base+body,base+body+5000),
    depth:bytes.slice(base+depth,base+depth+20000)};
}
for(const polygon of [false,true]) {
  const native=await Draw(false,polygon),fallback=await Draw(true,polygon);
  assert.deepEqual(fallback,native,`rejected raster acceleration preserves native drawing; polygon=${polygon}`);
}
await h.Exec("DCDel(fallback_dc);");
console.log("Raster fallback: native oversized span pixels, depth, count and random seed survive rejection unchanged.");
