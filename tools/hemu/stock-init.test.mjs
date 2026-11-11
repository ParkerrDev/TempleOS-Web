import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {compileHemu,HEMU_SRC} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import {SnapshotRead} from "./Fixtures.mjs";
import {RegsRead} from "../snapshot/Regs.mjs";
import * as jit from "../../engine/jit.js";
for(const smp of [false,true]) {
 const extraSource=`
U64 CpuInitProbe(I64 core,I64 field)
{
  switch (field) {
    case 0:return g_cpu_st[core].f_x87_cw;
    case 1:return g_cpu_st[core].f_x87_sw;
    case 2:return g_cpu_st[core].f_fsp;
    case 3:return g_cpu_st[core].f_msr_fsbase;
  }
  return 0;
}
`;
 const compiled=compileHemu({smp,extraSource,exports:['HemuInit','CpuInitProbe']});
 assert.deepEqual(compiled.warnings,[]);
 const raw=SnapshotRead(smp);let base,inst;
 const host=createHemuHost({snapLoad(a,u8){base=a;u8.set(raw,a);},onText:s=>{if(s.includes('BADOP'))throw Error(s);}});
 if(smp)host.env.mem=new WebAssembly.Memory({initial:8192,maximum:8192,shared:true});
 Object.assign(host.env,{
  __host_ns:()=>16000000n,__host_budget:()=>12000000n,
  __jit_state:(r,f,p)=>{jit.jitState(r,f,p,base,inst.exports.memory,inst.exports.RdMem,inst.exports.WrMem,inst.exports.RasterHLE);return 1n;},
  __jit_compile:r=>BigInt(jit.jitCompile(Number(r))),__jit_dispatch:n=>BigInt(jit.jitDispatch(Number(n))),
  __jit_run:r=>BigInt(jit.jitRun(Number(r))),__jit_x87:(...args)=>jit.jitX87(...args),
  __jit_chain:(...args)=>jit.jitChain(...args),__jit_seg:(...args)=>jit.jitSeg(...args.map(Number))
 });
 ({instance:inst}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}));host.attach(inst);
 const ex=inst.exports;ex.__rt_init();ex.HemuInit();
 const bytes=new Uint8Array(ex.memory.buffer),view=new DataView(ex.memory.buffer);
 const word=a=>view.getUint16(base+a,true),qword=a=>Number(view.getBigUint64(base+a,true));
 const str=a=>{let s='';for(let i=0;i<64&&bytes[base+a+i];i++)s+=String.fromCharCode(bytes[base+a+i]);return s;};
 const Name=(name,off)=>{const at=base+402653184+off;bytes.set(new TextEncoder().encode(name+'\0'),at);return BigInt(at);};
 const offsets={};for(const name of ['task_name','fpu_mmx','next_task'])offsets[name]=Number(ex.GuestMember(Name('CTask',256),Name(name,384)));
 const cpus=Array.from({length:smp?4:1},(_,core)=>({core,cw:Number(ex.CpuInitProbe(BigInt(core),0n)),sw:Number(ex.CpuInitProbe(BigInt(core),1n)),top:Number(ex.CpuInitProbe(BigInt(core),2n)),task:Number(ex.CpuInitProbe(BigInt(core),3n))}));
 function Tasks(){const out=[];let task=cpus[0].task;
  do {const fpu=qword(task+offsets.fpu_mmx);out.push({task,name:str(task+offsets.task_name),fpu,cw:word(fpu),sw:word(fpu+2)});task=qword(task+offsets.next_task);}while(task&&task!==cpus[0].task&&out.length<32);
  const variable=Number(ex.GuestVar(Name('sys_winmgr_task',512)));
  assert.ok(variable>0,"native window manager task symbol");
  task=qword(variable);
  if(!out.some(t=>t.task===task)) {
   const fpu=qword(task+offsets.fpu_mmx);
   out.push({task,name:str(task+offsets.task_name),fpu,cw:word(fpu),sw:word(fpu+2)});
  }
  return out;
 }
 const captured=RegsRead(readFileSync(resolve(HEMU_SRC,"..",smp?"capture-smp.txt":"capture.txt"),"utf8"),smp?4:1);
 for(const [i,cpu] of cpus.entries())assert.deepEqual([cpu.cw,cpu.sw,cpu.top],
   [Number(BigInt(captured.cores[i].cw)),Number(BigInt(captured.cores[i].sw)),captured.cores[i].top],"HemuInit preserves the actual stopped CPU FPU state before executing any guest instruction");
 const before=Tasks();
 assert.equal(before.find(t=>t.name==="Window Mgr")?.cw,0x37F);
 for(let i=0;i<10;i++)ex.__main();
 const after=Tasks();
 assert.equal(after.find(t=>t.name==="Window Mgr")?.cw,0x37F,"scheduler context saves do not poison the native window manager control word");
 console.log(`${smp?4:1}-core captured FPU state matches native registers; Window Mgr remains037f after10 BSP frames.`);
}
