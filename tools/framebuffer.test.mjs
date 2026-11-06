import assert from 'node:assert/strict';
import {createFrameBlitter,screenFit} from '../framebuffer.js';
let puts=0,last,lastRect;
const ctx={canvas:{},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(i,x,y,dx,dy,dw,dh)=>{puts++;last=new Uint32Array(i.data.buffer).slice();lastRect=[dx,dy,dw,dh];}};
const palette=Uint32Array.from({length:16},(_,i)=>0xff000000+i),draw=createFrameBlitter(ctx,palette,32,16),frame=new Uint8Array(512);
assert.equal(draw(frame,32,16),true);assert.equal(puts,1);
assert.equal(draw(frame,32,16),false);assert.equal(puts,1);
frame[1]=3;assert.equal(draw(frame,32,16),true);assert.equal(puts,2);assert.equal(last[1],palette[3]);
assert.deepEqual(lastRect,[0,0,32,1]); // Only the row that changed goes to the canvas.
frame[1]=19;assert.equal(draw(frame,32,16),false); // High bits are not part of the displayed palette.
frame[511]=15;assert.equal(draw(frame,32,16),true);assert.equal(last[511],palette[15]);
assert.deepEqual(lastRect,[0,15,32,1]);
frame[0]=1;frame[500]=2;puts=0;assert.equal(draw(frame,32,16),true);assert.equal(puts,2); // Two runs of rows, two uploads.
assert.throws(()=>draw(frame,31,16),/dimensions/);
console.log('Framebuffer: identical frames skipped; first, last and unsampled pixel changes rendered exactly.');

const odd=createFrameBlitter(ctx,palette,3,3),unaligned=new Uint8Array(12).subarray(1,10);
assert.equal(odd(unaligned,3,3,true),true);
assert.equal(odd(unaligned.slice(),3,3,true),false);
const changed=unaligned.slice();changed[8]=7;
assert.equal(odd(changed,3,3,true),true);assert.equal(last[8],palette[7]);
const mutable=changed.slice();mutable[0]=2;
assert.equal(odd(mutable,3,3),true);mutable[0]=4;
assert.equal(odd(mutable,3,3),true);assert.equal(last[0],palette[4]);

palette[4]=0xffaa0088;assert.equal(odd(mutable,3,3),true);assert.equal(last[0],palette[4]);

// Each backing scale: every guest pixel must come out as one uniform k x k block, so one glyph repeated over
// the whole screen has the same shape in every cell.
const glyph=[0x3c,0x66,0x6e,0x6e,0x60,0x62,0x3c,0x00],screen=new Uint8Array(640*480);
for(let y=0;y<480;y++)for(let x=0;x<640;x++)screen[y*640+x]=(glyph[y&7]>>(7-(x&7)))&1?15:0;
const full=createFrameBlitter(ctx,palette);
assert.equal(full(screen,640,480),true);
for(const k of [2,1]){
  full.resize(640*k,480*k); // The last frame comes back without a new one arriving.
  assert.equal(ctx.canvas.width,640*k);assert.equal(ctx.canvas.height,480*k);
  const width=640*k;
  for(let y=0;y<480*k;y++)for(let x=0;x<width;x++)
    assert.equal(last[y*width+x],palette[screen[Math.floor(y/k)*640+Math.floor(x/k)]],`pixel ${x},${y} at k=${k}`);
}
puts=0;full.resize(640,480);assert.equal(puts,0); // Same size: the canvas is left alone.
screen[0]=1;assert.equal(full(screen,640,480),true);assert.equal(last[0],palette[1]);
full.resize(1280,960);screen[641]=2;assert.equal(full(screen,640,480),true);
assert.deepEqual(lastRect,[0,2,1280,2]);   // At k=2 a changed guest row uploads its two device rows only.
assert.equal(last[2*1280+2],palette[2]);assert.equal(last[3*1280+3],palette[2]);assert.equal(last[2*1280+4],palette[screen[642]]);
console.log('Framebuffer: every guest pixel is one uniform block at k=1 and k=2; a resize keeps the last frame.');

const fit=(...room)=>{const f=screenFit(...room);return [f.width,f.height,f.cssWidth,f.cssHeight,f.smooth];};
assert.deepEqual(fit(800,600,1),[1280,960,800,600,true]);       // The 1080p desktop: 1.25x, smoothed from 2x.
assert.deepEqual(fit(800,600,1.6),[640,480,800,600,false]);     // The same box on a 1.6 scale laptop: an exact 2x.
assert.deepEqual(fit(799.9,600,1),[1280,960,796,597,true]);     // Never larger than the room.
assert.deepEqual(fit(1440,1080,1),[1280,960,1440,1080,true]);   // Fullscreen at 1080p fills the height now.
assert.deepEqual(fit(1280,960,1),[640,480,1280,960,false]);     // Exactly 2x: the browser doubles with hard edges.
assert.deepEqual(fit(1920,1080,2),[1280,960,1440,1080,true]);   // Fullscreen on a 4K screen: 4.5x, smoothed from 2x.
assert.deepEqual(fit(5120,2880,1),[640,480,3840,2880,false]);   // 6x exactly: the browser multiplies, hard edges.
assert.deepEqual(fit(360,270,3),[1280,960,360,270,true]);       // A phone.
assert.deepEqual(fit(500,375,1),[640,480,500,375,true]);        // Smaller than the guest: smoothed down.
assert.deepEqual(fit(1920,993,1),[640,480,1280,960,false]);     // 2x fills 97% of the room: hard edges win.
assert.deepEqual(fit(660,495,1),[640,480,640,480,false]);       // Within 5% of 1x: shown 1:1.
for(const dpr of [1,1.25,1.5,1.6,2,3])for(let room=300;room<2400;room+=37)for(const tall of [0.6,0.75,1]){
  const f=screenFit(room,room*tall,dpr),device=Math.round(f.cssWidth*dpr);
  assert.ok((f.width===640&&f.height===480)||(f.width===1280&&f.height===960));
  assert.ok(f.cssWidth<=room+0.01&&f.cssHeight<=room*tall+0.01);
  assert.ok(Math.abs(f.cssWidth*3/4-f.cssHeight)<1e-9&&device%4===0&&device>=room*Math.min(1,tall*4/3)*dpr*0.95-4.01);
  assert.equal(f.smooth,device%f.width!==0);   // Hard edges only where the browser's scale is a whole number.
}
console.log('Framebuffer: the screen fills its room at 4:3 from a backing of at most 1280x960.');
