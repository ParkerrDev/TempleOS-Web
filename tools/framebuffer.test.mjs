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

// Every whole-cell scale: one glyph repeated over the whole screen must come out the same in every cell.
const glyph=[0x3c,0x66,0x6e,0x6e,0x60,0x62,0x3c,0x00],screen=new Uint8Array(640*480);
for(let y=0;y<480;y++)for(let x=0;x<640;x++)screen[y*640+x]=(glyph[y&7]>>(7-(x&7)))&1?15:0;
const full=createFrameBlitter(ctx,palette);
assert.equal(full(screen,640,480),true);
for(let cell=8;cell<=15;cell++){
  full.resize(80*cell,60*cell); // The last frame comes back without a new one arriving.
  assert.equal(ctx.canvas.width,80*cell);assert.equal(ctx.canvas.height,60*cell);
  const width=80*cell,first=[];
  for(let y=0;y<cell;y++)first.push(...last.subarray(y*width,y*width+cell));
  for(let row=0;row<60;row++)for(let col=0;col<80;col++)for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)
    assert.equal(last[(row*cell+y)*width+col*cell+x],first[y*cell+x],`cell ${col},${row} at ${cell} pixels per cell`);
}
puts=0;full.resize(80*15,60*15);assert.equal(puts,0); // Same size: the canvas is left alone.
screen[0]=1;assert.equal(full(screen,640,480),true);assert.equal(last[0],palette[1]);
console.log('Framebuffer: one glyph has one shape at every whole-cell scale; a resize keeps the last frame.');

const fit=(...room)=>{const f=screenFit(...room);return [f.width,f.height,f.cssWidth,f.cssHeight];};
assert.deepEqual(fit(800,600,1),[800,600,800,600]);        // The 1080p desktop.
assert.deepEqual(fit(800,600,1.6),[640,480,800,600]);      // The same box on a 1.6 scale laptop: an exact 2x.
assert.deepEqual(fit(799.9,600,1),[720,540,720,540]);      // Never larger than the room.
assert.deepEqual(fit(1440,1080,1),[720,540,1440,1080]);    // Fullscreen at 1080p: 18 pixels per cell.
assert.deepEqual(fit(2133,1600,1),[1040,780,2080,1560]);   // Fullscreen at 1600 rows: 26 pixels per cell.
assert.deepEqual(fit(1920,1080,2),[960,720,1440,1080]);    // Fullscreen on a 4K screen: the browser multiplies by 3.
assert.deepEqual(fit(5120,2880,1),[960,720,3840,2880]);    // The filled pixels stay bounded on any screen.
assert.deepEqual(fit(360,270,3),[1040,780,1040/3,260]);    // A phone.
for(const dpr of [1,1.25,1.5,1.6,2,3])for(let room=300;room<2400;room+=37){
  const f=screenFit(room,room*3/4,dpr);
  assert.ok(f.width%80===0&&f.height%60===0&&f.width<=1200&&f.height<=900);
  assert.ok(f.cssWidth<=room+0.1&&f.cssHeight<=room*3/4+0.1);
  assert.ok(Number.isInteger(+(f.cssWidth*dpr/f.width).toFixed(6)));
}
console.log('Framebuffer: the screen fits its room at a whole cell size and a whole browser zoom.');
