// TempleOS uncompressed CDC/GR codec. Layout verified against Adam/Gr/GrDC.HC.
// PNG2GR by greg0-4 informed the format investigation; this is an independent implementation.
import {PALETTE,mapPalette} from './sprite-color.js';
export {PALETTE};
export const MAX_PIXELS = 20_000_000;
export const MAX_FRAMES = 600;
export function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 640 || height > 480)
    throw new Error('Sprite dimensions must be 1 to 640 by 1 to 480.');
  return (width + 7) & ~7;
}
export function quantize(rgba, width, height, dither = false, alpha = 128, options = {}) {
  dimensions(width, height);
  if (rgba.length !== width * height * 4) throw new Error('Invalid RGBA frame length.');
  if(dither===true || dither==='fs' || dither==='stable')return mapPalette(rgba,width,height,dither==='stable'?'stable':'fs',alpha,options);
  const out = new Uint8Array(width * height);
  const pixels = rgba;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const n = y * width + x, i = n * 4;
    if (pixels[i + 3] < alpha) { out[n] = 255; continue; }
    let best = 0, distance = Infinity;
    for (let c = 0; c < 16; c++) {
      const p = PALETTE[c];
      const d = (pixels[i]-p[0])**2 + (pixels[i+1]-p[1])**2 + (pixels[i+2]-p[2])**2;
      if (d < distance) { best = c; distance = d; }
    }
    out[n] = best;
  }
  return out;
}
export function toRGBA(indices, width, height) {
  dimensions(width, height);
  if (indices.length !== width * height) throw new Error('Invalid indexed frame length.');
  const out = new Uint8ClampedArray(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const c = indices[i];
    if (c === 255) continue;
    if (c > 15) throw new Error('Invalid TempleOS palette index.');
    out.set(PALETTE[c], i*4); out[i*4+3] = 255;
  }
  return out;
}
export function encodeGR(indices, width, height) {
  const stride = dimensions(width, height);
  toRGBA(indices, width, height); // Reject invalid palette values before exporting.
  const bytes = new Uint8Array(32 + stride * height), dv = new DataView(bytes.buffer);
  dv.setUint32(16, width, true); dv.setUint32(20, stride, true); dv.setUint32(24, height, true);
  bytes.fill(255, 32);
  for (let y = 0; y < height; y++) bytes.set(indices.subarray(y*width, (y+1)*width), 32+y*stride);
  return bytes;
}
export function decodeGR(bytes) {
  if (bytes.length < 32) throw new Error('Truncated GR header.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16,true), stride = dv.getUint32(20,true), height = dv.getUint32(24,true);
  if (stride !== dimensions(width,height) || dv.getUint32(28,true) !== 0)
    throw new Error('Only uncompressed GR files with the standard palette are supported.');
  if (bytes.length !== 32+stride*height) throw new Error('Invalid GR body length.');
  const indices = new Uint8Array(width*height);
  for (let y = 0; y < height; y++) indices.set(bytes.subarray(32+y*stride,32+y*stride+width),y*width);
  toRGBA(indices,width,height);
  return {width,height,indices};
}
export function encodeGIF(frames, width, height, delayMs) {
  dimensions(width,height);
  if (!frames.length || frames.length > MAX_FRAMES || frames.length*width*height > MAX_PIXELS)
    throw new Error('Animation exceeds the frame or pixel limit.');
  if (!Number.isFinite(delayMs) || delayMs < 20 || delayMs > 655350) throw new Error('Invalid frame delay.');
  const parts = [], u16 = n => [n&255,n>>>8&255];
  const add = a => parts.push(Uint8Array.from(a));
  add([...new TextEncoder().encode('GIF89a'),...u16(width),...u16(height),0xf4,16,0]);
  add([...PALETTE.flat(),...new Array(48).fill(0)]); // 32 colors, entry 16 is transparent.
  add([33,255,11,...new TextEncoder().encode('NETSCAPE2.0'),3,1,0,0,0]);
  for (let f=0;f<frames.length;f++) {
    const frame=frames[f];
    toRGBA(frame,width,height);
    const ticks=Math.round((f+1)*delayMs/10)-Math.round(f*delayMs/10);
    add([33,249,4,9,...u16(Math.max(2,ticks)),16,0]); // Preserve total duration with GIF's 10 ms time units.
    add([44,0,0,0,0,...u16(width),...u16(height),0,5]);
    // Literal LZW runs keep the dictionary below its next code-width boundary.
    // A clear every 16 pixels is larger than dictionary compression, but deterministic.
    const codes = [];
    for (let i = 0; i < frame.length; i++) { if (i%16 === 0) codes.push(32); codes.push(frame[i] === 255 ? 16 : frame[i]); }
    codes.push(33);
    const packed = new Uint8Array(Math.ceil(codes.length*6/8));
    let bits = 0, at = 0, pending = 0;
    for (const code of codes) { pending |= code<<bits; bits += 6; while (bits >= 8) { packed[at++] = pending&255; pending >>>= 8; bits -= 8; } }
    if (bits) packed[at] = pending;
    for (let i=0;i<packed.length;i+=255) { add([Math.min(255,packed.length-i)]); parts.push(packed.subarray(i,i+255)); }
    add([0]);
  }
  add([59]); return concat(parts);
}
export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let at = 0;
  for (const p of parts) { out.set(p,at); at += p.length; } return out;
}
function crc32(data) {
  let crc = -1;
  for (const byte of data) { crc ^= byte; for (let j=0;j<8;j++) crc = (crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^-1)>>>0;
}
export function zipFiles(files) {
  const local = [], central = []; let offset = 0;
  for (const {name,bytes} of files) {
    const fn = new TextEncoder().encode(name), crc = crc32(bytes);
    const h = new Uint8Array(30+fn.length), v = new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true); v.setUint16(4,20,true); v.setUint16(6,0x800,true);
    v.setUint16(12,33,true); v.setUint32(14,crc,true); v.setUint32(18,bytes.length,true); v.setUint32(22,bytes.length,true);
    v.setUint16(26,fn.length,true); h.set(fn,30); local.push(h,bytes);
    const c = new Uint8Array(46+fn.length), d = new DataView(c.buffer);
    d.setUint32(0,0x02014b50,true); d.setUint16(4,20,true); d.setUint16(6,20,true); d.setUint16(8,0x800,true);
    d.setUint16(14,33,true); d.setUint32(16,crc,true); d.setUint32(20,bytes.length,true); d.setUint32(24,bytes.length,true);
    d.setUint16(28,fn.length,true); d.setUint32(42,offset,true); c.set(fn,46); central.push(c);
    offset += h.length+bytes.length;
  }
  const tail = new Uint8Array(22), v = new DataView(tail.buffer);
  v.setUint32(0,0x06054b50,true); v.setUint16(8,files.length,true); v.setUint16(10,files.length,true);
  v.setUint32(12,central.reduce((n,c)=>n+c.length,0),true); v.setUint32(16,offset,true);
  return concat([...local,...central,tail]);
}
export function spritePackage(frames, width, height, delayMs) {
  const enc = new TextEncoder();
  const files = frames.map((f,i)=>({name:`Frame${String(i).padStart(3,'0')}.GR`,bytes:encodeGR(f,width,height)}));
  files.push({name:'Play.HC',bytes:enc.encode(`#exe {Cd(__DIR__);}\nU0 PlaySprites()\n{\n  I64 i, frame, previous=-1;\n  F64 started;\n  CDC *images[${frames.length}];\n  U8 name[32];\n  for (i=0;i<${frames.length};i++) { StrPrint(name,"Frame%03d.GR",i); images[i]=GRRead(name); if(!images[i]) throw('Sprite'); }\n  AutoComplete(OFF);\n  WinBorder(OFF);\n  WinMax;\n  DocCursor(OFF);\n  DocClear;\n  started=tS;\n  while (!ScanChar) {\n    frame=ToI64((tS-started)*1000/${delayMs})%${frames.length};\n    if (frame!=previous) {\n    previous=frame;\n    DCFill;\n    GrBlot(,(GR_WIDTH-images[frame]->width)/2,(GR_HEIGHT-images[frame]->height)/2,images[frame]);\n    Refresh;\n    }\n    Sleep(1);\n  }\n  for (i=0;i<${frames.length};i++) DCDel(images[i]);\n}\nPlaySprites;\n`)});
  files.push({name:'README.TXT',bytes:enc.encode('Copy this folder to TempleOS, then include Play.HC. Press a key to stop.\nFor a reusable sprite: CDC *dc=GRRead("Frame000.GR"); U8 *sprite=DC2Sprite(dc); Sprite(,x,y,sprite);\nFree(sprite); DCDel(dc);\n')});
  files.push({name:'animation.json',bytes:enc.encode(JSON.stringify({width,height,frames:frames.length,delayMs,palette:'TempleOS standard',transparent:255},null,2))});
  return zipFiles(files);
}
