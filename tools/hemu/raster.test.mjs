import assert from "node:assert/strict";
import {GuestHarness} from "./GuestHarness.mjs";

const h=await GuestHarness({exports:["PolyTri","SpanFill","RasterOff","RasterCount"],
  extraSource:`U0 RasterOff() {g_poly3_hle=0;g_raster_n=0;}
I64 RasterCount() {return g_raster_calls+g_poly3_calls;}`}),
      {ex,gx,base,Name}=h,slot=gx.scratch.base+0x6000;
ex.RasterOff();
await h.Exec(`CDC *raster_dc=DCNew(64,48);
raster_dc->depth_buf=MAlloc(64*48*4);
*(${slot})(I64*)=raster_dc;`);
const dc=gx.rd64(slot),dv=new DataView(ex.memory.buffer),
      u8=new Uint8Array(ex.memory.buffer),
      Member=n=>Number(ex.GuestMember(Name("CDC"),Name(n,0x7100))),
      body=gx.rd64(dc+Member("body")),depth=gx.rd64(dc+Member("depth_buf")),
      flags=dc+Member("flags"),color=dc+Member("color"),
      collision=dc+Member("collision_cnt"),nearest=dc+Member("nearest_dist"),
      poly=slot+0x100,fn=Number(ex.GuestFun(Name("GrFillPoly3"))),
      line=Number(ex.GuestFun(Name("GrHLine"))),
      vline=Number(ex.GuestFun(Name("GrVLine")));
assert.ok(fn && line && vline);
let seed=0x36AF9812,cases=0;
function Rand(n)
{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed%n;
}
function Reset(col)
{
  u8.fill(7,base+body,base+body+64*48);
  new Int32Array(ex.memory.buffer,base+depth,64*48).fill(0x7FFFFFFF);
  dv.setUint32(base+flags,0,true);
  dv.setUint32(base+color,col,true);
  gx.wr64(collision,0);
  gx.wr64(nearest,0x7FFFFFFF);
}
async function Native(fn,args)
{
  const before=ex.RasterCount(),res=await h.Call(fn,args,10000000);
  assert.equal(ex.RasterCount(),before,"native oracle cannot call an accelerated primitive");
  return res;
}
function Result(count)
{
  return {count,body:u8.slice(base+body,base+body+64*48),
    depth:u8.slice(base+depth,base+depth+64*48*4),
    collision:gx.rd64(collision),nearest:gx.rd64(nearest)};
}
const triangles=[
  [-20,4,100,80,17,900,23,60,400],
  [0,0,0,63,0,1000,0,47,50],
  [0,0,1000,63,0,0,63,47,50],
  [2,2,12,2,2,12,2,2,12],
  [4,20,100,19,20,180,53,20,300],
  [20,4,100,20,19,180,20,43,300]
];
for (let n=0;n<160;n++)
  triangles.push(Array.from({length:9},(_,i)=>i%3==2?Rand(4096)-300:Rand(192)-64));
for (const col of [12,0x10C,0x20C,0x4004000C])
  for (const tri of triangles) {
    for (let i=0;i<9;i++)
      dv.setInt32(base+poly+i*4,tri[i],true);
    Reset(col);
    const expected=Result(await Native(fn,[dc,3,poly]));
    Reset(col);
    const got=Result(ex.PolyTri(BigInt(dc),...tri.map(BigInt)));
    assert.deepEqual(got,expected,"GrFillTri0 parity: "+col+" "+tri);
    cases++;
  }
for (let vert=0;vert<2;vert++)
  for (const span of [[-30,90,12,100,1500],[50,-20,23,1200,20],
      [2,2,9,40,100],[3,40,-2,0,100],[3,40,55,0,100]]) {
    const [x1,x2,y,z1,z2]=span;
    Reset(12);
    const args=vert?[dc,y,x1,x2,z1,z2]:[dc,x1,x2,y,z1,z2],
          expected=Result(await Native(vert?vline:line,args));
    Reset(12);
    const got=Result(ex.SpanFill(BigInt(dc),BigInt(vert),...span.map(BigInt)));
    assert.deepEqual(got,expected,"line clipping/depth parity: "+vert+" "+span);
    cases++;
  }
await h.Exec(`DCDel(raster_dc);`);
console.log("Raster: "+cases+" native TempleOS comparisons; pixels, depth, changed count and collision state agree.");
