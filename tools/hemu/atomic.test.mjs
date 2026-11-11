import assert from "node:assert/strict";
import {Worker,isMainThread,workerData,parentPort} from "node:worker_threads";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";

const count=10000;
if(!isMainThread) {
  const {bytes,mem,id}=workerData,host=createHemuHost();
  host.env.mem=mem;
  const {instance}=await WebAssembly.instantiate(bytes,{env:host.env});
  instance.exports.__sp.value=BigInt(0x1000000-id*0x100000);
  instance.exports.__core.value=BigInt(id);
  host.attach(instance);
  parentPort.on("message",()=>{
    const ran=instance.exports.RunCore(100000000n);
    parentPort.postMessage({kind:"done",ran:String(ran),halted:Number(instance.exports.AtomicHalted())});
  });
  parentPort.postMessage({kind:"ready"});
} else {
  const compiled=compileHemu({sharedMemory:true,exports:["InitMem","AtomicInit","AtomicHalted","RunCore"],
    extraSource:`
U0 AtomicInit(I64 n)
{
  I64 i;
  g_ncore=NCORES;
  for (i=0;i<NCORES;i++) {
    MemSet(&g_cpu_st[i],0,sizeof(CCpuState));
    g_cpu_st[i].f_rip=4096;
    g_cpu_st[i].f_reg[1]=n;
    g_cpu_st[i].f_reg[2]=1<<i;
    g_cpu_st[i].f_reg[3]=0x3000;
    g_cpu_st[i].f_reg[6]=0x3010;
  }
}
I64 AtomicHalted() {return halted;}
`}),mem=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true}),
    host=createHemuHost();
  assert.deepEqual(compiled.warnings,[]);
  host.env.mem=mem;
  const {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
  host.attach(instance);instance.exports.__rt_init();instance.exports.InitMem(65536n);
  const base=Number(instance.exports.RamBase()),u8=new Uint8Array(mem.buffer),dv=new DataView(mem.buffer),
    workers=[0,1,2,3].map(id=>new Worker(new URL(import.meta.url),{workerData:{bytes:compiled.bytes,mem,id}}));
  function Wait(worker,message) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{Cleanup();reject(new Error("Worker timed out: "+message));},30000),
        receive=value=>{if(value.kind===message){Cleanup();resolve(value);}},
        error=err=>{Cleanup();reject(err);},
        exit=code=>error(new Error("Worker exited before "+message+": "+code));
      function Cleanup(){clearTimeout(timer);worker.off("message",receive);worker.off("error",error);worker.off("exit",exit);}
      worker.on("message",receive);worker.once("error",error);worker.once("exit",exit);
    });
  }
  async function Run(code,{expected=BigInt(workers.length*count),initial=0n,label="guest updates"}={}) {
    u8.fill(0,base+4096,base+0x3020);u8.set(code,base+4096);
    instance.exports.AtomicInit(BigInt(count));
    dv.setBigUint64(base+0x3010,initial,true);
    const done=Promise.all(workers.map(w=>Wait(w,"done")));
    workers.forEach(w=>w.postMessage("go"));
    for(const result of await done) {
      assert.ok(BigInt(result.ran)>0n,JSON.stringify(result));
      assert.equal(result.halted,1,"each core reaches the guest HLT");
    }
    assert.equal(dv.getBigUint64(base+0x3010,true),expected,label);
  }
  try {
    await Promise.all(workers.map(w=>Wait(w,"ready")));
    for(const width of [1,2,4,8]) {
      const prefix=width===2?[0x66]:width===8?[0x48]:[],
        code=[0xB8,1,0,0,0],spin=code.length;
      code.push(...prefix,width===1?0x86:0x87,0x03,...prefix,width===1?0x84:0x85,0xC0);
      code.push(0x75,(spin-code.length-2)&255);
      // INC [RSI] is deliberately ordinary memory: XCHG [RBX] owns its lock.
      code.push(0x48,0xFF,0x06,0xC7,0x03,0,0,0,0,0xFF,0xC9);
      code.push(0x75,(-code.length-2)&255,0xF4);
      await Run(code);
      assert.equal(dv.getBigUint64(base+0x3000,true),0n,"the implicit-lock XCHG loop releases its lock");
    }
    // MOV EAX,1; LOCK XADD [RSI],RAX; DEC ECX; JNZ; HLT.
    await Run([0xB8,1,0,0,0,0xF0,0x48,0x0F,0xC1,0x06,0xFF,0xC9,0x75,0xF2,0xF4]);
    let cases=5;
    const Loop=body=>[...body,0xFF,0xC9,0x75,(-body.length-4)&255,0xF4];
    for(const size of [1,2,4,8]) {
      const prefix=size===2?[0x66]:size===8?[0x48]:[],bits=size*8,
        mask=(1n<<BigInt(bits))-1n,total=BigInt(workers.length*count)&mask;
      for(const [op,delta]of [[0,1],[2,1],[3,-1],[5,-1]]) {
        //Each ADC/SBB iteration explicitly restores its carry input.
        const body=[...(op===2||op===3?[0xF9]:[]),0xF0,...prefix,size===1?0x80:0x83,
          0x06+op*8,op===2||op===3?0:1];
        await Run(Loop(body),{expected:delta===1?total:(-total)&mask,label:`LOCK ALU ${op}, ${bits} bits`});cases++;
      }
      for(const op of [0,1]) {
        await Run(Loop([0xF0,...prefix,size===1?0xFE:0xFF,0x06+op*8]),
          {expected:op===0?total:(-total)&mask,label:`LOCK ${op?"DEC":"INC"}, ${bits} bits`});cases++;
      }
      for(const op of [1,4,6]) {
        const body=op===4?[...prefix,size===1?0xF6:0xF7,0xD2]:[];
        body.push(0xF0,...prefix,op*8+(size===1?0:1),0x16);
        if(op===4)body.push(...prefix,size===1?0xF6:0xF7,0xD2);
        await Run(Loop(body),{initial:op===4?mask:0n,expected:op===1?15n:op===4?mask&~15n:0n,
          label:`LOCK logic ${op}, ${bits} bits`});cases++;
      }
      for(const op of [2,3]) {
        await Run(Loop([0xF0,...prefix,size===1?0xF6:0xF7,0x06+op*8]),
          {initial:11n,expected:11n,label:`LOCK ${op===2?"NOT":"NEG"}, ${bits} bits`});cases++;
      }
      //Retry CMPXCHG with its returned accumulator until this increment wins.
      const body=[...prefix,size===1?0x8A:0x8B,0x06],retry=body.length;
      body.push(0x48,0x8D,0x50,1,0xF0,...prefix,0x0F,size===1?0xB0:0xB1,0x16);
      body.push(0x75,(retry-body.length-2)&255);
      await Run(Loop(body),{expected:total,label:`LOCK CMPXCHG retry, ${bits} bits`});cases++;
    }
    console.log(`${cases} four-core contention cases pass: implicit XCHG locks, all arithmetic/logic/unary LOCK forms, XADD and CMPXCHG retries at every width.`);
  } finally {await Promise.all(workers.map(w=>w.terminate()));}
}
