import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {makeDisk,makeQcow2,makeRaw} from '../engine/qcow2.js';
const root=new URL('./disk/',import.meta.url),evidence=JSON.parse(readFileSync(new URL('evidence.json',root)));
function Fixture(name) {
  const bytes=gunzipSync(readFileSync(new URL(name+'.gz',root)));
  assert.equal(bytes.length,evidence.files[name].bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.files[name].sha256);
  return bytes;
}
const expected=Fixture('expected.raw'),v3=Fixture('zero.qcow2'),v2=Fixture('v2.qcow2');
for(const bytes of [v3,v2,expected]) {
  const padded=new Uint8Array(bytes.length+14);padded.set(bytes,7);
  const disk=makeDisk(padded.subarray(7,7+bytes.length)),data=new Uint8Array(disk.virtualSize);
  assert.equal(data.length,expected.length);disk.readInto(0,data.length/512,data,0);
  assert.deepEqual(data,new Uint8Array(expected),'Full disk agrees with independent qemu-img raw conversion.');
  const part=new Uint8Array(1536).fill(0xB7);disk.readInto(7,2,part,256);
  assert.deepEqual(part.subarray(256,1280),new Uint8Array(expected.subarray(7*512,9*512)));
  assert(part.subarray(0,256).every(v=>v===0xB7));assert(part.subarray(1280).every(v=>v===0xB7));
  const changed=new Uint8Array(1536).fill(0xD3);changed.fill(0x12,512,1024);
  disk.writeInto(15,2,changed,512);changed.fill(0);
  disk.readInto(15,2,data,0);
  assert(data.subarray(0,512).every(v=>v===0x12));assert(data.subarray(512,1024).every(v=>v===0xD3));
  const pristine=makeDisk(bytes);pristine.readInto(0,pristine.virtualSize/512,data,0);
  assert.deepEqual(data,new Uint8Array(expected),'Overlay writes neither borrow caller bytes nor modify the base image.');
}
let rejected=0;
function Reject(bytes,pattern=/qcow2/) {assert.throws(()=>makeQcow2(bytes),pattern);rejected++;}
function Change(offset,value,wide=false,source=v3) {
  const bytes=Uint8Array.from(source),view=new DataView(bytes.buffer);
  if(wide)view.setBigUint64(offset,BigInt(value));else view.setUint32(offset,value);
  return bytes;
}
for(const [off,value,wide]of [
  [0,0],[4,1],[4,4],[8,4096,true],[20,8],[20,22],[20,63],[24,0,true],[24,511,true],[24,2n**63n,true],
  [32,1],[36,0],[36,0xFFFFFFFF],[40,1,true],[40,2n**63n,true],[100,72],[100,105],[100,8192],
])Reject(Change(off,value,wide));
for(const bit of [0n,1n,2n,3n,4n,63n])Reject(Change(72,1n<<bit,true));
for(const n of [0,4,71,103,v3.length-1])Reject(v3.subarray(0,n));
const view=new DataView(v3.buffer,v3.byteOffset,v3.length),l1=Number(view.getBigUint64(40)),
  l2=Number(view.getBigUint64(l1)&0x00fffffffffffe00n);
for(const value of [1n<<56n,512n,BigInt(v3.length),1n<<63n])Reject(Change(l1,value,true));
for(const value of [1n<<62n,1n<<56n,2n,512n,BigInt(v3.length),1n<<63n])Reject(Change(l2,value,true));
const old=new DataView(v2.buffer,v2.byteOffset,v2.length),oldL1=Number(old.getBigUint64(40)),
  oldL2=Number(old.getBigUint64(oldL1)&0x00fffffffffffe00n);
Reject(Change(oldL2,1n,true,v2));
for(const n of [0,1,511,513])for(const open of [makeDisk,makeRaw]) {
  assert.throws(()=>open(new Uint8Array(n)),/512-byte sectors/);rejected++;
}
console.log(`Disk readers match independent QEMU v2/v3/raw images, allocated-zero and sparse sectors, byte views, overlay ownership; ${rejected} malformed/unsupported images refused before use.`);
