import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import {createGuestExec} from "../../engine/guestexec.js";
import * as jit from "../../engine/jit.js";
import {SnapshotRead,DiskRead} from "./Fixtures.mjs";

export async function GuestHarness(opt={})
{//A deterministic guest for native API checks, sharing the production engine.
  const compiled=compileHemu(opt),live=SnapshotRead(),
        disk=opt.disk?DiskRead():null,badops=[];
  assert.deepEqual(compiled.warnings,[]);
  let base=0,inst,gx,ns=16000000;
  const host=createHemuHost({
    snapLoad(a,bytes){base=a;bytes.set(live,a);},
    diskRead:(...args)=>disk?.readInto(...args),
    diskWrite:(...args)=>disk?.writeInto(...args),
    onText(s){if (s.includes("BADOP")) badops.push(s);}
  });
  if (opt.sharedMemory)
    host.env.mem=new WebAssembly.Memory({initial:8192,maximum:8192,shared:true});
  Object.assign(host.env,{
    __host_ns:()=>BigInt(ns),__host_budget:()=>opt.budgetProbe?.()??12000000n,
    __jit_state(r,f,p){
      jit.jitState(r,f,p,base,inst.exports.memory,inst.exports.RdMem,
            inst.exports.WrMem,inst.exports.RasterHLE);
      return 1n;
    },
    __jit_compile:r=>BigInt(jit.jitCompile(Number(r))),
    __jit_run:r=>BigInt(jit.jitRun(Number(r))),
    __jit_dispatch:n=>BigInt(jit.jitDispatch(Number(n))),
    __jit_x87:(...args)=>jit.jitX87(...args),
    __jit_chain:(...args)=>jit.jitChain(...args),
    __jit_seg:(...args)=>jit.jitSeg(...args.map(Number))
  });
  jit.jitReset();
  ({instance:inst}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}));
  host.attach(inst);
  const ex=inst.exports;
  ex.__rt_init();
  async function Run(n=1)
  {
    while (n-->0) {
      ex.__main();
      gx?.tick();
      await new Promise(setImmediate);
    }
    assert.deepEqual(badops,[],"guest encountered an unsupported instruction");
  }
  await Run(60);
  gx=createGuestExec({inst,gBase:base});
  const probe=gx.probe();
  assert.equal(probe.ok,true,probe.errors.join("; "));
  async function Settle(p)
  {
    let done=false,res,err;
    p.then(v=>{res=v;done=true;},e=>{err=e;done=true;});
    for (let n=0;n<2000 && !done;n++)
      await Run();
    assert.equal(done,true,"guest operation timed out");
    if (err) throw err;
    return res;
  }
  async function Exec(src,target="adam")
  {
    const id=gx.exec({src,target});
    for (let n=0;n<2000;n++) {
      const s=gx.status(id);
      if (s && ["done","failed","error"].includes(s.state)) {
        assert.equal(s.state,"done",JSON.stringify(s));
        return s;
      }
      await Run();
    }
    assert.fail("guest source timed out: "+src);
  }
  function Name(st,off=0x7000)
  {
    const bytes=new Uint8Array(ex.memory.buffer),a=base+gx.scratch.base+off;
    for (let i=0;i<st.length;i++)
      bytes[a+i]=st.charCodeAt(i);
    bytes[a+st.length]=0;
    return BigInt(a);
  }
  return {ex,gx,base,disk,compiled,Run,Exec,Name,
    Call:(fn,args,budget)=>Settle(gx.call(fn,args,budget)),
    TimeSet(value){ns=value;}
  };
}
