import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {GrNew} from "./Gr.js";

const source=await readFile(new URL("Gr.HC",import.meta.url),"utf8"),
  codec=await GrNew(source),files=[],cases=[];
for (const [width,height] of [[1,1],[7,3],[8,3],[9,3],[17,3],[639,1],[640,480]]) {
  const pixels=Uint8Array.from({length:width*height},(_,i)=>i%17==16?255:i%16),
    bytes=codec.encodeGR(pixels,width,height);
  assert.deepEqual(codec.decodeGR(bytes),{width,height,indices:pixels});
  const name="G"+String(cases.length).padStart(4,"0")+".GR";
  files.push({name,bytes});cases.push({name,width,height});
}
assert.deepEqual(codec.encodeGR(Uint8Array.of(4),1,1),Uint8Array.from([
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,8,0,0,0,1,0,0,0,0,0,0,0,
  4,255,255,255,255,255,255,255]));
for (const [field,value] of [[16,0],[16,641],[16,0xFFFFFFFF],[20,1],[24,0],[24,481],[28,1],[28,2]]) {
  const bad=files[0].bytes.slice();new DataView(bad.buffer).setUint32(field,value,true);
  assert.throws(()=>codec.decodeGR(bad));
}
for (const length of [0,1,31,32,39,41])
  assert.throws(()=>codec.decodeGR(new Uint8Array(length)));
const bad=files[0].bytes.slice();bad[32]=17;
assert.throws(()=>codec.decodeGR(bad),/palette/);
assert.throws(()=>codec.encodeGR(Uint8Array.of(17),1,1),/palette/);
assert.throws(()=>codec.encodeGR(Uint8Array.of(1),2,1),/length/);
assert.throws(()=>codec.encodeGR(Uint8Array.of(1),NaN,1),/dimensions/);
assert.throws(()=>codec.encodeGR(files[0].bytes),/dimensions/);
assert.throws(()=>codec.decodeGR(new Uint8Array(codec.maxSize+1)),/maximum GR size/);
assert.deepEqual(codec.decodeGR(files[0].bytes).indices,Uint8Array.of(0));

const bundle=gunzipSync(await readFile(new URL("../assets/terry-sprites.gr.gz",import.meta.url))),
  metadata=JSON.parse(bundle.subarray(4,4+bundle.readUInt32LE(0)).toString());
let at=4+bundle.readUInt32LE(0),count=0;
for (const clip of metadata)
  for (let i=0;i<clip.count;i++) {
    const bytes=bundle.subarray(at,at+clip.frameSize),decoded=codec.decodeGR(bytes);
    assert.equal(decoded.width,clip.width);assert.equal(decoded.height,clip.height);
    assert.deepEqual(codec.encodeGR(decoded.indices,decoded.width,decoded.height),new Uint8Array(bytes));
    at+=clip.frameSize;count++;
  }
assert.equal(at,bundle.length);
console.log("Native GR: dimensions, padding, palette, malformed files and "+count+" exact Terry frames pass.");

if (process.argv.includes("--native")) {
  const {QemuRun}=await import("../holyc-wasm/tests/oracle/Qemu.mjs"),
    code=source+String.raw`
U0 SpriteNativeCheck(U8 *name,I64 width,I64 height)
{
  I64 size,loaded,w,h,out_size,x,y;
  U8 *src=FileRead(name,&size),*pixels,*encoded,*saved;
  CDC *dc=DCLoad(src,&loaded);
  if (loaded!=size || dc->width!=width || dc->height!=height) throw('Load');
  pixels=SpriteGrRead(src,size,&w,&h);
  if (!pixels || w!=width || h!=height) throw('Read');
  for (y=0;y<height;y++)
    for (x=0;x<width;x++)
      if (pixels[y*width+x]!=dc->body[y*dc->width_internal+x]) throw('Pixels');
  encoded=SpriteGrWrite(pixels,width*height,width,height,&out_size);
  if (!encoded || out_size!=size || MemCmp(src,encoded,size)) throw('Write');
  saved=DCSave(dc,&out_size,0);
  if (out_size!=size || MemCmp(src,saved,size)) throw('Native');
  Free(saved);Free(encoded);Free(pixels);Free(src);DCDel(dc);
  "%d:%d\n",width,height;
}
`+cases.map(c=>`SpriteNativeCheck("C:/ORACLE/${c.name}",${c.width},${c.height});\n`).join(""),
    result=await QemuRun([code],{files,timeout:60});
  assert.equal(result.results[0].except,"");
  assert.equal(result.results[0].out,cases.map(c=>c.width+":"+c.height+"\n").join(""));
  const dir=new URL("../tmp/sprites/",import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL("native.json",dir),JSON.stringify(result,null,2)+"\n");
  console.log("Original V5.03 DCLoad/DCSave match the native sprite codec: "+result.evidence);
}
