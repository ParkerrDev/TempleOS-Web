import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PALETTE,quantize,toRGBA,encodeGR,decodeGR,encodeGIF,spritePackage} from '../sprite-codec.js';
const width=17,height=3, pixels=Uint8Array.from({length:width*height},(_,i)=>i%17===16?255:i%16);
const rgba=toRGBA(pixels,width,height);
assert.deepEqual(quantize(rgba,width,height),pixels);
assert.deepEqual(quantize(rgba,width,height,true),pixels);
assert.deepEqual(quantize(rgba,width,height,'stable'),pixels);
const gr=encodeGR(pixels,width,height),v=new DataView(gr.buffer);
assert.equal(gr.length,32+24*3);assert.equal(v.getUint32(16,true),width);assert.equal(v.getUint32(20,true),24);
for(let y=0;y<height;y++)for(let x=width;x<24;x++)assert.equal(gr[32+y*24+x],255);
assert.deepEqual(decodeGR(gr).indices,pixels);
assert.throws(()=>decodeGR(gr.subarray(0,-1)),/length/);
assert.throws(()=>encodeGR(new Uint8Array([17]),1,1),/palette/);
assert.throws(()=>encodeGR(pixels,0,3),/dimensions/);
assert.equal(quantize(new Uint8Array([13,12,14,255]),1,1)[0],0);
assert.equal(quantize(new Uint8Array([255,255,255,0]),1,1)[0],255);
// Guard against both washed-out gray and forced saturated colors. Check the
// displayed average, the allowed hues, and the brightness of shadow pixels.
const solid=rgb=>Uint8Array.from({length:64*64*4},(_,i)=>i%4===3?255:rgb[i%4]);
const meanRGB=indices=>{const sum=[0,0,0];for(const c of indices)for(let k=0;k<3;k++)sum[k]+=PALETTE[c][k]/indices.length;return sum;};
for(const rgb of [[75,55,43],[126,99,81],[180,138,114],[160,112,80],[150,100,75],[210,167,143],[171,146,149],[148,122,130]]) {
 const input=solid(rgb),mapped=quantize(input,64,64,'stable');
 const mean=meanRGB(mapped);
 for(let k=0;k<3;k++)assert(Math.abs(mean[k]-rgb[k])<24,'Warm colors must approximate the source without a saturation boost');
 assert(mean[0]-mean[1]>(rgb[0]-rgb[1])*0.25&&mean[0]-mean[2]>(rgb[0]-rgb[2])*0.25,'Warm mixtures must retain a visible warm tint');
 assert([...mapped].every(c=>[0,4,6,7,8,12,15].includes(c)),'Warm areas must not introduce unrelated green, blue, magenta or yellow dots');
 const changed=input.slice();changed.set([255,0,0,255],0);
 const converted=quantize(changed,64,64,'stable');
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x>1||y>1)
  assert.equal(converted[y*64+x],mapped[y*64+x],'Source smoothing must not propagate changes beyond one pixel');
 assert.deepEqual(quantize(input,64,64,'stable'),mapped,'Repeated frames must remain identical');
}
for(const rgb of [[75,55,43],[210,167,143],[128,128,128],[40,52,60],[200,211,220]]) {
 const mapped=quantize(solid(rgb),64,64,'stable',128,{strength:0});
 assert.equal(new Set(mapped).size,1,'Zero strength must not add a pattern to a solid source');
}
assert.throws(()=>quantize(solid([128,128,128]),64,64,'stable',128,{strength:101}),/strength/);
assert.throws(()=>quantize(solid([128,128,128]),64,64,'stable',128,{strength:NaN}),/strength/);
assert.deepEqual(quantize(rgba,width,height,'stable',128,{strength:100}),pixels,'Dithering must preserve existing palette artwork');
for(const rgb of [[35,48,70],[46,61,85]]) {
 const mapped=quantize(solid(rgb),64,64,'stable'),mean=meanRGB(mapped);
 for(let k=0;k<3;k++)assert(Math.abs(mean[k]-rgb[k])<18,'Denim must approximate the source without a saturation boost');
 assert(mean[2]>mean[0]+15&&mean[2]>mean[1]+8,'Denim must retain its blue tint');
 assert(!mapped.includes(7)&&!mapped.includes(15),'Dark fabric must not contain bright neutral flecks');
 assert(mapped.filter(c=>c===1).length<mapped.length*0.4,'Muted blue must not collapse to a solid saturated blue');
}
// A compression-colored outlier surrounded by an otherwise uniform surface
// must disappear without changing genuine stock-palette pixel artwork.
const patch=solid([195,205,220]),baseline=quantize(patch,64,64,'stable');
const middle=(32*64+32)*4;patch.set([180,216,85,255],middle);
assert.equal(quantize(patch,64,64,'stable')[middle/4],baseline[middle/4]);
patch.set([...PALETTE[10],255],middle);
assert.equal(quantize(patch,64,64,'stable')[middle/4],10,'Intentional stock palette artwork must survive outlier removal');
const gray=Uint8Array.from({length:16*4},(_,i)=>i%4===3?255:128);
assert([...quantize(gray,4,4,'stable')].every(c=>[0,7,8,15].includes(c)),'Neutral colors must remain neutral');
for(const rgb of [[180,216,85],[180,216,170],[144,180,170],[108,216,170],[213,232,126],[36,72,0],[174,203,166]]) {
 const mapped=quantize(solid(rgb),64,64,'stable');
 assert(!mapped.includes(10),`Muted or dark source ${rgb} must not introduce bright green`);
}
assert(quantize(solid([70,240,70]),64,64,'stable').includes(10),'A genuinely vivid green source still needs vivid green');
const softGray=quantize(solid([128,128,128]),64,64,'stable',128,{strength:100});
assert(new Set(softGray).size>1,'Opting into dithering should introduce texture');
assert.deepEqual(quantize(solid([128,128,128]),64,64,'stable',128,{strength:100}),softGray,'Optional dithering must stay fixed across frames');
for(const [dx,dy] of [[4,0],[0,4],[4,4]]) {
 let changed=0,compared=0;
 for(let y=0;y<64-dy;y++)for(let x=0;x<64-dx;x++){compared++;if(softGray[y*64+x]!==softGray[(y+dy)*64+x+dx])changed++;}
 assert(changed/compared>0.3,'Dithering must not repeat a visible four-pixel grid');
}
const timed=encodeGIF(Array.from({length:30},()=>new Uint8Array([6])),1,1,1000/30);
let pos=13+32*3,totalTicks=0,frameCount=0;
while(timed[pos]!==59) {
 const block=timed[pos++];
 if(block===33){const label=timed[pos++];if(label===249)totalTicks+=timed[pos+2]|timed[pos+3]<<8;}
 else if(block===44){pos+=9;pos++;frameCount++;}
 else throw new Error('Invalid GIF block');
 while(timed[pos])pos+=timed[pos]+1;pos++;
}
assert.equal(frameCount,30);assert.equal(totalTicks,100,'30 fps GIF must last one second, not 900 ms');
assert.doesNotThrow(()=>encodeGIF(Array.from({length:250},()=>new Uint8Array([6])),1,1,40));
if(process.argv[2]){
 const path=process.argv[2];writeFileSync(path+'.GR',gr);writeFileSync(path+'.rgba',rgba);
 const reversed=Uint8Array.from(pixels,(_,i)=>pixels[pixels.length-i-1]);
 writeFileSync(path+'.gif',encodeGIF([pixels,reversed],width,height,100));
 writeFileSync(path+'.zip',spritePackage([pixels,reversed],width,height,100));
}
console.log('Sprite codec: palette, unboosted warm/cool tones, zero-strength solid colors, stable dithering, local smoothing, alpha, GR round-trip, GIF timing and frame limits passed.');
