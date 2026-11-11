import {CaptureWait} from "./CoreBarrier.js";
import {createHemuHost,CpuFaultText} from "./host.js";
import * as jit from "./jit.js";

onmessage=e=>{
  if(e.data.cmd!=="init")return;
  (e.data.role==="bsp"?import("./LegacyBsp.js").then(m=>m.LegacyBsp(e.data)):RunAp(e.data))
    .catch(err=>postMessage({cmd:"error",msg:String(err.message||err)}));
};

async function RunAp({core,mem,ctrl:control,wasmBytes,heapAbi}) {
  if(!Number.isInteger(core)||core<1||core>3)throw new Error("Invalid application core");
  const ctrl=new Int32Array(control),hot=new Map();
  let inst,base=0;
  const host=createHemuHost({...(heapAbi===undefined?{}:{heapAbi}),onText:s=>{if(s.includes("BADOP"))postMessage({cmd:"log",msg:`core${core} ${s.trim()}`});}});
  Object.assign(host.env,{
    mem,
    __jit_state:(rg,fl,rp)=>{jit.jitState(rg,fl,rp,base,mem,inst.exports.RdMem,inst.exports.WrMem,inst.exports.RasterHLE);return 1n;},
    __jit_compile:r=>BigInt(jit.jitCompile(Number(r))),
    __jit_run:r=>BigInt(jit.jitRun(Number(r))),
    __jit_x87:(...args)=>jit.jitX87(...args),
    __jit_dispatch:b=>BigInt(jit.jitDispatch(Number(b))),
    __jit_chain:(...args)=>jit.jitChain(...args),
    __jit_seg:(...args)=>jit.jitSeg(...args.map(Number)),
    __ap_run:(rip,budget)=>{
      const address=Number(rip);
      if(!jit.jitInspect(address).cached){
        const n=(hot.get(address)||0)+1;hot.set(address,n);
        if(n<=2)return 0n;jit.jitCompile(address);
      }
      return BigInt(jit.jitDispatch(Number(budget)));
    }
  });
  jit.jitReset();
  const mod=await WebAssembly.compile(wasmBytes);
  inst=await WebAssembly.instantiate(mod,{env:host.env});
  inst.exports.__core.value=BigInt(core);
  inst.exports.__sp.value=BigInt(0x1000000-core*0x100000);
  host.attach(inst);
  Atomics.store(ctrl,8+core,1);Atomics.notify(ctrl,8+core);
  while(!Atomics.load(ctrl,0)&&!Atomics.load(ctrl,1))Atomics.wait(ctrl,0,0,100);
  if(Atomics.load(ctrl,1))return;
  base=Number(inst.exports.RamBase());inst.exports.CoreAttach();
  postMessage({cmd:"log",msg:`AP${core} parallel`});
  let spins=0,faulted=false;
  while(!Atomics.load(ctrl,1)){
    if(CaptureWait(ctrl,core))continue;
    if(faulted){await new Promise(r=>setTimeout(r,10));continue;}
    const did=Number(inst.exports.RunCore(2000000n));
    if(did<0&&!faulted){faulted=true;postMessage({cmd:"error",msg:CpuFaultText(inst.exports)||`CPU ${core} stopped: fault ${-did}.`});}
    if((did<1000&&++spins>4)||spins>100){await new Promise(r=>setTimeout(r,0));spins=0;}
    else if(did>=1000)spins++;
  }
}
