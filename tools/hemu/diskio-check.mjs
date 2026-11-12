// Exercise the compiled ATA port implementation without booting a guest snapshot.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHemu} from '../../engine/compile.js';
import {createHemuHost} from '../../engine/host.js';
const compiled=compileHemu({exports:['InitMem','IoOutWidth','IoInWidth','VgaPaletteInit','Reset','InjectKey','TimeAdd']});
const sectors=new Map(),colors=[];const host=createHemuHost({palette:(index,rgb)=>colors.push({index,rgb}),diskWrite:(lba,count,mem,addr)=>{for(let i=0;i<count;i++)sectors.set(lba+i,mem.slice(addr+i*512,addr+(i+1)*512));},diskRead:(lba,count,mem,addr)=>{for(let i=0;i<count;i++)mem.set(sectors.get(lba+i),addr+i*512);}});
const tones=[];host.state.snd={tone:hz=>tones.push(hz)};
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

// A reset during a command must not leak a reply, transfer or tone into the next boot.
out(0x1f2,1);out(0x1f3,7);out(0x1f4,0);out(0x1f5,0);out(0x1f7,0x34);
ex.IoOutWidth(0x1f0n,0xabcdn,2n);
out(0x64,0xd4);out(0x60,0xff);ex.InjectKey(0x1en);
out(0x43,0xb6);out(0x42,0xa9);out(0x42,4);out(0x61,3);
assert.ok(tones.at(-1)>0);
ex.Reset();ex.TimeAdd(1000000000n);
assert.equal(ex.IoInWidth(0x1f7n,1n),0x40n,"reset abandons a partial ATA write");
assert.equal(sectors.size,0,"reset cannot commit incomplete disk data");
assert.equal(ex.IoInWidth(0x64n,1n)&1n,0n,"reset drains PS/2 replies and keyboard bytes");
assert.equal(ex.IoInWidth(0x60n,1n),0n);
assert.equal(tones.at(-1),0,"reset stops the speaker");
out(0x3c7,3);
assert.deepEqual([0,1,2].map(()=>Number(ex.IoInWidth(0x3c9n,1n))),[0,42,42],"reset restores the EGA palette");
console.log('Device reset: partial ATA writes, PS/2 replies, keyboard bytes, speaker and palette return to boot state.');
