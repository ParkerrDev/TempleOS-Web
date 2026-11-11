import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";

const c=compileHemu({exports:["InitMem","PatchCore","PatchResume"],extraSource:`
U0 PatchCore(I64 core,U64 pc) {g_ncore=4;g_cpu_st[core].f_rip=pc;}
U64 PatchResume(U64 pc,I64 stage)
{
  I64 i;
  reg[4]=0x1F00;reg[5]=0x1F80;reg[0]=0;rip=pc;halted=0;
  WrMem(reg[4],8,0x1FF0);
  if (stage>=1) {reg[4]-=8;WrMem(reg[4],8,reg[5]);}
  if (stage>=2) reg[5]=reg[4];
  if (stage>=3) reg[4]-=8;
  for (i=0;i<20 && rip!=0x1FF0;i++) Step;
  if (rip!=0x1FF0 || reg[4]!=0x1F08 || reg[5]!=0x1F80) return -1;
  return reg[0];
}
`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const bytes=new Uint8Array(ex.memory.buffer,Number(ex.RamBase()),8192),
  view=new DataView(ex.memory.buffer,Number(ex.RamBase()),8192);
function Reset() {
  for(const addr of [2048,4096,6144]) {
    bytes.fill(0x90,addr,addr+32);view.setUint32(addr,0xEC8B4855,true);
    bytes.set([0x48,0x81,0xEC,8,0,0,0],addr+4);
  }
  for(let i=0;i<4;i++)ex.PatchCore(BigInt(i),8191n);
}
for(let core=0;core<4;core++)for(let byte=4;byte<11;byte++) {
  Reset();ex.PatchCore(BigInt(core),BigInt(4096+byte));
  assert.equal(ex.GuestPatchJump(4096n,6144n),0n,"a suspended core may still be executing the original prologue");
  assert.equal(view.getUint32(4096,true),0xEC8B4855,"retry leaves the original code intact");
}
for(const target of [2048,6144]) {
  Reset();assert.equal(ex.GuestPatchJump(4096n,BigInt(target)),1n);
  assert.equal(view.getUint32(4096,true),0xEC8B4855);
  assert.equal(bytes[4100],0xE9);assert.equal(4105+view.getInt32(4101,true),target+4);
  assert.ok(bytes.slice(4107,4128).every(v=>v===0x90),"only the entry jump changes");
}
for(const args of [[0n,6144n],[4096n,0n],[4096n,8192n],[8190n,6144n]]) {
  Reset();assert.equal(ex.GuestPatchJump(...args),-1n);
}
Reset();bytes[4096]=0x90;assert.equal(ex.GuestPatchJump(4096n,6144n),-1n);
Reset();
view.setUint32(6144+7,16,true);
for(const [addr,size,result] of [[4096,8,7],[6144,16,42]])
  bytes.set([0xB8,result,0,0,0,0x48,0x81,0xC4,size,0,0,0,0x5D,0xC3],addr+11);
assert.equal(ex.GuestPatchJump(4096n,6144n),1n);
for(const [pc,stage,result] of [[4096,0,42],[4097,1,42],[4100,2,42],[4107,3,7]])
  assert.equal(ex.PatchResume(BigInt(pc),BigInt(stage)),BigInt(result),"a suspended task resumes at every original prologue instruction boundary");
console.log("Guest patch entry: all four CPU prologues defer installation; invalid ranges/signatures fail; forward and backward jumps preserve surrounding code.");
