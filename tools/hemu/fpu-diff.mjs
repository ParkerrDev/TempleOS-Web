//Refactor comparison, not an independent hardware oracle.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {dirname,extname} from "node:path";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {hemuFile,HEMU_SRC,HEMU_EXPORTS} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";

const ref=process.argv[2];
if(!ref)throw new Error("Usage: node tools/hemu/fpu-diff.mjs BASELINE_COMMIT");
const old=new Map();
function Previous(name) {
  if(!extname(name))name+=".HC";
  if(!old.has(name))old.set(name,execFileSync("git",["show",ref+":src/"+name],{
    cwd:dirname(HEMU_SRC),encoding:"latin1"
  }));
  return old.get(name);
}
const extra=`
U64 FpuAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return &fpr[0];case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;case 8:return &halted;
  }
  return 0;
}`;
async function Make(before) {
  const Read=before?Previous:hemuFile,
    c=compileHolyC(Read("snapshot.HC")+extra,{filename:"snapshot.HC",lenient:false,
      exports:[...HEMU_EXPORTS,"InitMem","FpuAddr"],includeResolver:Read});
  assert.deepEqual(c.warnings,[]);
  const host=createHemuHost({onText:()=>{}}),
    {instance}=await WebAssembly.instantiate(c.bytes,{env:host.env});
  host.attach(instance);
  const ex=instance.exports;
  ex.__rt_init();ex.InitMem(16384n);
  return {ex,a:Array.from({length:9},(_,i)=>Number(ex.FpuAddr(BigInt(i)))),
    bytes:new Uint8Array(ex.memory.buffer),view:new DataView(ex.memory.buffer)};
}
function Run(h,op,modrm,top,value) {
  const {ex,a,bytes,view}=h,
    Put=(addr,x)=>view.setBigUint64(addr,BigInt(x),true),
    Get=index=>view.getBigUint64(a[index],true),
    Hex=(addr,len)=>Buffer.from(bytes.subarray(addr,addr+len)).toString("hex");
  bytes.fill(0,a[0]+4096,a[0]+16384);
  bytes.set([op,modrm,0xF4],a[0]+4096);
  for(let i=0;i<16;i++)Put(a[1]+i*8,i?0:8192);
  Put(a[2],0xAD7);Put(a[3],4096);Put(a[5],top);
  Put(a[6],0);Put(a[7],0x37F);Put(a[8],0);
  for(let i=0;i<8;i++)view.setFloat64(a[4]+i*8,i===top?value:(i+1)/2,true);
  view.setFloat64(a[0]+8192,1.75,true);
  ex.Step();
  const floats=[];
  for(let i=0;i<8;i++) {
    const n=view.getFloat64(a[4]+i*8,true);
    floats.push(Number.isNaN(n)?"NaN":view.getBigUint64(a[4]+i*8,true));
  }
  return {flags:Get(2),rip:Get(3),top:Get(5),sw:Get(6),cw:Get(7),halted:Get(8),
    regs:Hex(a[1],128),floats,memory:Hex(a[0]+8192,64)};
}
const instances=[await Make(true),await Make(false)],
  values=[3,2,-3,0,-0,Infinity,NaN,1e30];
let cases=0;
for(let op=0xD8;op<=0xDF;op++)for(let sub=0;sub<8;sub++)
for(let slot=-1;slot<8;slot++)for(const top of [0,7])for(const value of values) {
  const modrm=slot<0?sub*8:0xC0+sub*8+slot;
  assert.deepEqual(Run(instances[1],op,modrm,top,value),Run(instances[0],op,modrm,top,value),
    `${op.toString(16)} ${modrm.toString(16)} TOP${top} ${value}`);
  cases++;
}
console.log(`${cases} old/new x87 opcode state comparisons pass.`);
