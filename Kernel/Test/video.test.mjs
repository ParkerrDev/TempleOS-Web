import assert from "node:assert/strict";
import {GuestHarness} from "./GuestHarness.mjs";

const h=await GuestHarness({exports:["VideoBlot4","VideoLine","VideoOff","VideoOn","VideoCount","DeskAddr","VideoCapture","VideoRegs"],
  extraSource:`U0 VideoOff(){video_blot=0;video_line=0;video_flush=0;}
U0 VideoOn(){HooksArm;}
I64 VideoCount(){return video_calls;}
U64 DeskAddr(){return g_desk;}
U0 VideoRegs(U64 fn,U64 stack,U64 output) {
  CCpuState saved;
  I64 i;
  MemCpy(&saved,&g_cpu_st[0],sizeof(CCpuState));
  for(i=0;i<16;i++) reg[i]=0x1234567800000000+i;
  reg[4]=stack;rip=fn;rfl=0x202;halted=0;
  WrMem(stack,8,0x7FF0);
  RunTo(0x7FF0,10000000);
  MemCpy(mem+output,&reg[0],128);
  WrMem(output+128,8,rfl);
  MemCpy(&g_cpu_st[0],&saved,sizeof(CCpuState));
}`});
const {ex,gx,base,Name}=h,u8=new Uint8Array(ex.memory.buffer),area=gx.scratch.base+0x800000,
  src=area,dst=area+0x10000,cache=area+0x20000,vga=area+0x30000,args=area+0x40000,
  blot=Number(ex.GuestFun(Name("DCBlotColor4"))),line=Number(ex.GuestFun(Name("GrUpdateLine64"))),
  flush=Number(ex.GuestFun(Name("GrUpdateLine64FlushCache")));
ex.VideoOff();
let seed=0x7C14A22,cases=0;
const Rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
function Init(count,pattern) {
  for(let i=0;i<count*8;i++) u8[base+src+i]=pattern===0?i&15:pattern===1?Rand()&15:Rand();
  u8.fill(0xA7,base+dst,base+dst+count*8+16);
  u8.fill(0x34,base+cache,base+cache+count*8+16);
  u8.fill(0x71,base+vga,base+vga+count*8+16);
  if(pattern===3)for(let i=0;i<count;i+=2)u8.copyWithin(base+cache+i*8,base+src+i*8,base+src+i*8+8);
}
async function Native(fn,params) {
  const before=ex.VideoCount();await h.Call(fn,params,10000000);
  assert.equal(ex.VideoCount(),before,"native video oracle cannot call HLE");
}
for(const count of [1,2,7,80,512])for(let pattern=0;pattern<4;pattern++) {
  Init(count,pattern);const initial=u8.slice(base+area,base+area+0x50000);
  await Native(blot,[dst,src,cache,count]);
  const expected=u8.slice(base+area,base+area+0x50000);
  u8.set(initial,base+area);ex.VideoBlot4(BigInt(dst),BigInt(src),BigInt(cache),BigInt(count));
  assert.deepEqual(u8.slice(base+area,base+area+0x50000),expected,"planar conversion/cache guards");
  u8.set(initial,base+area);ex.VideoOn();let calls=ex.VideoCount();
  await h.Call(blot,[dst,src,cache,count]);
  assert.ok(ex.VideoCount()>calls);ex.VideoOff();
  assert.deepEqual(u8.slice(base+area,base+area+0x50000),expected,"named planar HLE dispatch");cases++;
  for(const doFlush of [0,1]) {
    Init(count,pattern);if(pattern===3)u8.copyWithin(base+dst,base+cache,base+cache+count*8);
    gx.wr64(args,vga);gx.wr64(args+8,src);gx.wr64(args+16,dst);
    const before=u8.slice(base+area,base+area+0x50000);
    await Native(doFlush?flush:line,[args,args+8,count,args+16]);
    const after=u8.slice(base+area,base+area+0x50000);
    u8.set(before,base+area);ex.VideoLine(BigInt(args),BigInt(args+8),BigInt(count),BigInt(args+16),BigInt(doFlush));
    assert.deepEqual(u8.slice(base+area,base+area+0x50000),after,"screen image, bit lookup, VGA writes and pointer increments");
    u8.set(before,base+area);ex.VideoOn();calls=ex.VideoCount();
    await h.Call(doFlush?flush:line,[args,args+8,count,args+16]);
    assert.ok(ex.VideoCount()>calls);ex.VideoOff();
    assert.deepEqual(u8.slice(base+area,base+area+0x50000),after,"named line HLE dispatch");cases++;
  }
}
//Instruction-level register and flag results must match the original assembly.
for(const fn of [blot,line,flush])for(let pattern=0;pattern<4;pattern++) {
  const count=7,stack=area+0x180000,out=stack+0x100;
  Init(count,pattern);if(pattern===3)u8.copyWithin(base+dst,base+cache,base+cache+count*8);
  gx.wr64(args,vga);gx.wr64(args+8,src);gx.wr64(args+16,dst);
  const params=fn===blot?[dst,src,cache,count]:[args,args+8,count,args+16];
  params.forEach((v,i)=>gx.wr64(stack+8+i*8,v));
  const before=u8.slice(base+area,base+area+0x50000);
  ex.VideoOff();ex.VideoRegs(BigInt(fn),BigInt(stack),BigInt(out));
  const expected=u8.slice(base+out,base+out+136);
  u8.set(before,base+area);ex.VideoOn();ex.VideoRegs(BigInt(fn),BigInt(stack),BigInt(out));
  assert.deepEqual(u8.slice(base+out,base+out+136),expected,"native registers and flags: "+fn+" pattern "+pattern);
}
//Aliased compositor buffers retain the exact native access order.
for(const aliasDst of [src,src+1,cache+8]) {
  const count=7,stack=area+0x180000,out=stack+0x100;
  Init(count,2);[aliasDst,src,cache,count].forEach((v,i)=>gx.wr64(stack+8+i*8,v));
  const before=u8.slice(base+area,base+area+0x50000);
  ex.VideoOff();ex.VideoRegs(BigInt(blot),BigInt(stack),BigInt(out));
  const expected=u8.slice(base+area,base+area+0x50000);
  u8.set(before,base+area);ex.VideoOn();const calls=ex.VideoCount();
  ex.VideoRegs(BigInt(blot),BigInt(stack),BigInt(out));
  assert.equal(ex.VideoCount(),calls,"overlapping buffers run their native implementation");
  assert.deepEqual(u8.slice(base+area,base+area+0x50000),expected);
}
ex.VideoOff();
//Compare the captured pixels against the guest's own planar decoder.
const dv=new DataView(ex.memory.buffer),hostImage=Number(h.compiled.globals.get("video_image").addr),
  imageSlot=Number(dv.getBigUint64(hostImage,true)),fake=area+0x60000,planes=area+0x70000,
  output=area+0xA0000,member=n=>Number(ex.GuestMember(Name("CDC"),Name(n,0x7100)));
{
  gx.wr64(fake+member("body"),planes);
  dv.setUint32(base+fake+member("width_internal"),640,true);
  dv.setUint32(base+fake+member("height"),480,true);
  gx.wr64(args,fake);
  for(let i=0;i<153600;i++)u8[base+planes+i]=Rand();
  dv.setBigUint64(hostImage,BigInt(args),true);ex.VideoCapture();
  const captured=u8.slice(Number(ex.DeskAddr()),Number(ex.DeskAddr())+307200);
  dv.setBigUint64(hostImage,BigInt(imageSlot),true);
  await Native(Number(ex.GuestFun(Name("GrBitMap4ToBitMap8"))),[output,planes,153600,-1]);
  assert.deepEqual(captured,u8.slice(base+output,base+output+307200),"captured frame equals native planar decoder");
}
ex.VideoOn();
await h.Exec(`U0 VideoZoomCheck(U8 *source,U8 *output) {
  I64 zoom=gr.scrn_zoom,sx=gr.sx,sy=gr.sy;
  U8 *old=gr.dc1->body;
  gr.dc1->body=source;gr.scrn_zoom=2;gr.sx=gr.sy=0;
  GrUpdateVGAGraphics;
  MemCpy(output,gr.scrn_image->body,153600);
  gr.dc1->body=old;gr.scrn_zoom=zoom;gr.sx=sx;gr.sy=sy;
}`);
await h.Call(Number(ex.GuestFun(Name("VideoZoomCheck"))),[planes,output],20000000);
for(let plane=0;plane<4;plane++)for(let y=0;y<480;y++)for(let x=0;x<640;x++) {
  const from=base+planes+plane*38400+(y>>1)*80+(x>>4),
    to=base+output+plane*38400+y*80+(x>>3);
  assert.equal(u8[to]>>(x&7)&1,u8[from]>>((x>>1)&7)&1,"native 2x screen zoom");
}
await h.Run(5);
const slot=gx.scratch.base+0x7000;
await h.Exec(`CDC *video_capture=DCScrnCapture;*(${slot})(I64*)=video_capture;`);
const dc=gx.rd64(slot),bodyOff=Number(ex.GuestMember(Name("CDC"),Name("body",0x7100))),body=gx.rd64(dc+bodyOff),
  pixels=u8.slice(base+body,base+body+307200);
assert.ok(new Set(pixels).size>=8,"native screenshots contain the actual desktop colors");
assert.ok(pixels.some(v=>v!==pixels[0]),"native screenshot is not blank");
await h.Exec("DCDel(video_capture);");
console.log(`${cases} native video comparisons: four planes/cache, line pointers, native bit table, changed/flush writes; capture equals native planar decoding, 2x zoom and DCScrnCapture preserve desktop pixels.`);
