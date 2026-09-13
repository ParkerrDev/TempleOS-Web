import assert from 'node:assert/strict';
import {createFrameBlitter} from '../framebuffer.js';
let puts=0,last;
const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:i=>{puts++;last=new Uint32Array(i.data.buffer).slice();}};
const palette=Uint32Array.from({length:16},(_,i)=>0xff000000+i),draw=createFrameBlitter(ctx,palette,32,16),frame=new Uint8Array(512);
assert.equal(draw(frame,32,16),true);assert.equal(puts,1);
assert.equal(draw(frame,32,16),false);assert.equal(puts,1);
frame[1]=3;assert.equal(draw(frame,32,16),true);assert.equal(puts,2);assert.equal(last[1],palette[3]);
frame[1]=19;assert.equal(draw(frame,32,16),false); // High bits are not part of the displayed palette.
frame[511]=15;assert.equal(draw(frame,32,16),true);assert.equal(last[511],palette[15]);
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
