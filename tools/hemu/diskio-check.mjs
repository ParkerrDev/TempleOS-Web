// Exercise the compiled ATA port implementation without booting a guest snapshot.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHemu} from '../../engine/compile.js';
import {createHemuHost} from '../../engine/host.js';
const compiled=compileHemu({exports:['InitMem','IoOutWidth','IoInWidth','VgaPaletteInit']});
const sectors=new Map(),colors=[];const host=createHemuHost({palette:(index,rgb)=>colors.push({index,rgb}),diskWrite:(lba,count,mem,addr)=>{for(let i=0;i<count;i++)sectors.set(lba+i,mem.slice(addr+i*512,addr+(i+1)*512));},diskRead:(lba,count,mem,addr)=>{for(let i=0;i<count;i++)mem.set(sectors.get(lba+i),addr+i*512);}});
const instance=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),ex=instance.instance.exports;
host.attach(instance.instance);ex.__rt_init();ex.InitMem(4096n);
for(const port of [0x1f0,0x170])for(const width of [2,4]){
 const out=(p,v,w=1)=>ex.IoOutWidth(BigInt(p),BigInt(v),BigInt(w));
 const data=Uint8Array.from({length:1024},(_,i)=>(i*37+(i>>3)+width+port)&255),view=new DataView(data.buffer);
 const command=(op)=>{out(port+2,2);out(port+3,7);out(port+4,0);out(port+5,0);out(port+7,op);};
 command(0x34);
 for(let i=0;i<data.length;i+=width)out(port,width===4?view.getUint32(i,true):view.getUint16(i,true),width);
 assert.equal(sectors.size,2,'a complete transfer must reach the host disk');
 assert.deepEqual(sectors.get(7),data.slice(0,512));assert.deepEqual(sectors.get(8),data.slice(512));
 command(0x24);
 const actual=new Uint8Array(1024),result=new DataView(actual.buffer);
 for(let i=0;i<actual.length;i+=width){const value=Number(ex.IoInWidth(BigInt(port),BigInt(width)));if(width===4)result.setUint32(i,value,true);else result.setUint16(i,value,true);}
 assert.deepEqual(actual,data,'reads must preserve all low and high words');sectors.clear();
}
console.log('ATA I/O: primary and secondary ports, 16/32-bit two-sector writes and reads are bit-exact.');

ex.VgaPaletteInit();assert.equal(colors.length,16);assert.deepEqual(colors[6],{index:6,rgb:0xaa5500});
const out=(port,value)=>ex.IoOutWidth(BigInt(port),BigInt(value),1n);
out(0x3c7,6);assert.deepEqual([0,1,2].map(()=>Number(ex.IoInWidth(0x3c9n,1n))),[42,21,0]);
out(0x3c8,3);out(0x3c9,63);out(0x3c9,0);out(0x3c9,21);
assert.deepEqual(colors.at(-1),{index:3,rgb:0xff0055});out(0x3c7,3);
assert.deepEqual([0,1,2].map(()=>Number(ex.IoInWidth(0x3c9n,1n))),[63,0,21]);
console.log('VGA DAC: standard palette, sequential reads and writes, host color updates passed.');
