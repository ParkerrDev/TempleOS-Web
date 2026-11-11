import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {CoreBus,BUS_OWNER} from "../../engine/CoreBus.js";
import {createHemuHost} from "../../engine/host.js";
import {createGuestExec} from "../../engine/guestexec.js";
import * as jit from "../../engine/jit.js";

if(!isMainThread) {
  const {module,memory,control,steps,core,scenario}=workerData,ctrl=new Int32Array(control),gate=new Int32Array(steps);
  let waiting=false,base=0,gx,unsafeGx;
  const pair=scenario==="cmp16",address=pair?0x3000n:0x3007n;
  const bus=CoreBus(ctrl,core,4,{wait:(...args)=>{
    if(!waiting){waiting=true;parentPort.postMessage({kind:"waiting",index:args[1]});}
    return Atomics.wait(...args);
  }}),host=createHemuHost();
  Object.assign(host.env,bus.Imports(),{mem:memory,__test_read:(_addr,_size,old)=>{
    assert.equal(core,0);assert.equal(old,pair?5n:1n);
    Atomics.store(gate,0,1);Atomics.notify(gate,0);
    while(!Atomics.load(gate,1))Atomics.wait(gate,1,0,100);
  }});
  const raw=await WebAssembly.instantiate(module,{env:host.env});
  raw.exports.__core.value=BigInt(core);raw.exports.__sp.value=BigInt(0x1000000-core*0x100000);
  const inst=bus.Attach(raw,module),ex=inst.exports;
  host.attach(inst);
  parentPort.on("message",m=>{
    waiting=false;
    try {
      let result;
      if(m.kind==="init") {ex.__rt_init();ex.InitMem(65536n);}
      else if(m.kind==="reset")ex.BusPrep();
      else if(m.kind==="prepare") {
        base=Number(ex.RamBase());
        gx=createGuestExec({inst,gBase:base,access:bus.Access});
        unsafeGx=createGuestExec({inst:raw,gBase:base});
        jit.jitReset();
        jit.jitState(...[0n,1n,2n].map(n=>Number(ex.BusAddr(n))),base,memory,ex.RdMem,ex.WrMem);
        if(core===1)assert.equal(bus.Access(()=>jit.jitCompile(4352)),pair?2:1);
      } else if(m.kind==="owner") {
        assert.equal(ex.RunCore(1n),1n);
        assert.equal(ex.CpuFault(0n),0n);
        result={rip:ex.GuestInfo(5n).toString(),word:ex.RdMem(address,8n).toString()};
      } else if(m.kind==="peer") {
        if(m.path==="interpreter") {
          const target=(m.unsafe?raw:inst).exports;target.Step();if(pair)target.Step();
        } else if(m.path==="jit") {
          const run=()=>assert.equal(jit.jitRun(4352),pair?2:1);
          if(m.unsafe)run();else bus.Access(run);
        } else {
          const target=m.unsafe?unsafeGx:gx;target.wr64(Number(address),10n);
          if(pair)target.wr64(Number(address)+8,20n);
        }
      } else if(m.kind==="read")result=pair?[ex.RdMem(address,8n),ex.RdMem(address+8n,8n)].join(","):ex.RdMem(address,8n).toString();
      parentPort.postMessage({kind:"done",result});
    } catch(error) {parentPort.postMessage({kind:"error",message:error.stack});}
  });
  parentPort.postMessage({kind:"ready"});
} else {
  const {compileHemu,hemuFile}=await import("../../engine/compile.js");
  const Expand=name=>hemuFile(name).replace(/^#include\s+"([^"]+)".*$/gm,(_,child)=>Expand(child));
  for(const scenario of ["split","cmp16"]) {
    const pair=scenario==="cmp16";
    let source=Expand("snapshot.HC");
    const marker=pair?"WrMem(addr,8,lo);WrMem(addr+8,8,hi);":"word=RdMem(addr,size);",
      replacement=pair?"WrMem(addr,8,lo);__test_read(addr,16,lo);WrMem(addr+8,8,hi);":marker+"__test_read(addr,size,word);";
    assert.equal(source.split(marker).length,2);
    source='import U0 __test_read(U64 addr,I64 size,U64 old);\n'+source.replace(
      marker,replacement);
    //Force preemption after the split read or first pair write. Production has no hook.
    const c=compileHemu({smp:true,source,exports:["InitMem","BusPrep","BusAddr"],
      extraSource:readFileSync(new URL(pair?"./Cmp16Bus.HC":"./BusProbe.HC",import.meta.url),"latin1")});
    assert.deepEqual(c.warnings,[]);
    const module=await WebAssembly.compile(c.bytes),memory=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true}),
      control=new SharedArrayBuffer(64),steps=new SharedArrayBuffer(64),ctrl=new Int32Array(control),gate=new Int32Array(steps),workers=[],mail=[];
    function Mail(w) {
      const inbox=[],pending=[];
      w.on("message",message=>{
        const at=pending.findIndex(p=>p.kind===message.kind||message.kind==="error");
        if(at>=0)pending.splice(at,1)[0].receive(message);else inbox.push(message);
      });
      return kind=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("Timed out waiting for "+kind)),10000),
          receive=m=>{clearTimeout(timer);m.kind==="error"?reject(new Error(m.message)):resolve(m);},
          at=inbox.findIndex(m=>m.kind===kind||m.kind==="error");
        if(at>=0)receive(inbox.splice(at,1)[0]);else pending.push({kind,receive});
      });
    }
    const Send=async(core,m)=>{const done=mail[core]("done");workers[core].postMessage(m);return done;};
    try {
      for(let core=0;core<4;core++) {
        const w=new Worker(new URL(import.meta.url),{workerData:{module,memory,control,steps,core,scenario}});
        workers.push(w);mail.push(Mail(w));
      }
      await Promise.all(mail.map(m=>m("ready")));
      await Send(0,{kind:"init"});
      for(const path of ["interpreter","jit","guestexec"])for(const unsafe of [false,true]) {
        await Send(0,{kind:"reset"});gate.fill(0);
        await Promise.all(workers.map((_,core)=>Send(core,{kind:"prepare"})));
        workers[0].postMessage({kind:"owner"});
        while(!Atomics.load(gate,0))await Atomics.waitAsync(gate,0,0,100).value;
        assert.equal(Atomics.load(ctrl,BUS_OWNER),1);
        workers[1].postMessage({kind:"peer",path,unsafe});
        if(unsafe)await mail[1]("done");
        else assert.equal((await mail[1]("waiting")).index,BUS_OWNER);
        Atomics.store(gate,1,1);Atomics.notify(gate,1);
        await mail[0]("done");if(!unsafe)await mail[1]("done");
        const {result}=await Send(0,{kind:"read"});
        assert.equal(result,pair?(unsafe?"10,6":"10,20"):(unsafe?"2":"10"),path+" "+(unsafe?"negative control":"guarded"));
        assert.equal(Atomics.load(ctrl,BUS_OWNER),0);
      }
      console.log(`Real HEMU ${pair?"LOCK CMPXCHG16B":"split LOCK INC"} against interpreter MOV, compiled MOV and guestexec writes: guarded overlaps serialize; all unguarded negative controls produce the illegal final ${pair?"10,6 pair":"value 2"}.`);
    } finally {await Promise.all(workers.map(w=>w.terminate()));}
  }
}
