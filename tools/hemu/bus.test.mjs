import assert from "node:assert/strict";
import {Worker,isMainThread,parentPort,workerData} from "node:worker_threads";
import {CoreBus,BusStop,BUS_OWNER,BUS_ACTIVE,BUS_ABI,BUS_VERSION} from "../../engine/CoreBus.js";
import {CaptureBarrier,CaptureWait} from "../../engine/CoreBarrier.js";

//A real ordinary WASM i64.load, with no knowledge of the bus protocol.
const reader=new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,126,
  2,13,1,3,101,110,118,3,109,101,109,2,3,1,1,3,2,1,0,
  7,8,1,4,114,101,97,100,0,0,10,9,1,7,0,65,0,41,3,0,11]);

if(!isMainThread) {
  const {control,steps,memory,core,cores,polling=true}=workerData,
    ctrl=new Int32Array(control),gate=new Int32Array(steps),words=new Uint32Array(memory.buffer),
    mark=(at,value=1)=>{Atomics.store(gate,at,value);Atomics.notify(gate,at);},
    until=(at,value=1)=>{while(Atomics.load(gate,at)!==value)Atomics.wait(gate,at,Atomics.load(gate,at),100);};
  let waiting=false;
  const bus=CoreBus(ctrl,core,cores,{wait:(...args)=>{
    if(!waiting){waiting=true;parentPort.postMessage({kind:"waiting",index:args[1],value:args[2]});}
    return Atomics.wait(...args);
  }}),{instance}=await WebAssembly.instantiate(reader,{env:{mem:memory}}),guarded=bus.Guard(instance);
  bus.Join({polling});
  parentPort.on("message",m=>{
    waiting=false;
    try {
      let result;
      if(m.kind==="hold")bus.Access(()=>{mark(0);until(1);assert.equal(words[0],0x11111111);});
      else if(m.kind==="wide")bus.Access(()=>{
        assert.equal(bus.Lock(),true);mark(2);
        words[0]=0xAAAAAAAA;mark(3);until(4);words[1]=0xAAAAAAAA;
        bus.Unlock();
      });
      else if(m.kind==="read")result=String(BigInt.asUintN(64,(m.unsafe?instance:guarded).exports.read()));
      else if(m.kind==="write") {
        const write=()=>{words[0]=0xBBBBBBBB;words[1]=0xBBBBBBBB;};
        if(m.unsafe)write();else bus.Access(write);
      } else if(m.kind==="upgrade")bus.Access(()=>{
        mark(core);until(4);assert.equal(bus.Lock(),true);
        const n=words[0]+1;words[0]=n;words[1]=n;bus.Unlock();
      });
      else if(m.kind==="capture")bus.Access(()=>{
        mark(0);until(1);
        const capture=CaptureBarrier(ctrl,cores,()=>true,()=>0);
        assert.equal(bus.Suspend(()=>capture.Lock()),true);
        assert.equal(Atomics.load(gate,6),1,"capture acknowledges only after instruction retirement");
        assert.equal(Atomics.load(gate,7),1,"capture acknowledges only after RunCore unwind");
        assert.deepEqual(Array.from(words.slice(0,2)),[0xAAAAAAAA,0xAAAAAAAA]);
        bus.Access(()=>{words[2]=0xCCCCCCCC;});
        assert.equal(BigInt.asUintN(64,bus.Access(()=>guarded.exports.read())),0xAAAAAAAAn<<32n|0xAAAAAAAAn);
        capture.Unlock();
      });
      else if(m.kind==="capture-ap") {
        bus.Access(()=>{
          assert.equal(bus.Lock(),true);words[0]=words[1]=0xAAAAAAAA;
          bus.Unlock();mark(6);
          while(bus.Poll())guarded.exports.read();
        });
        mark(7);assert.equal(CaptureWait(ctrl,core),true);
      }
      parentPort.postMessage({kind:"done",result});
    } catch(error) {parentPort.postMessage({kind:"error",message:error.stack});}
  });
  parentPort.postMessage({kind:"ready"});
} else {
  function Mail(worker) {
    const inbox=[],pending=[];
    worker.on("message",message=>{
      const at=pending.findIndex(p=>p.kind===message.kind||message.kind==="error");
      if(at>=0)pending.splice(at,1)[0].receive(message);else inbox.push(message);
    });
    return kind=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Worker timed out waiting for "+kind)),5000),
        receive=m=>{clearTimeout(timer);if(m.kind==="error")reject(new Error(m.message));else resolve(m);},
        at=inbox.findIndex(m=>m.kind===kind||m.kind==="error");
      if(at>=0)receive(inbox.splice(at,1)[0]);else pending.push({kind,receive});
    });
  }
  async function Fixture(cores=2,legacy=-1) {
    const control=new SharedArrayBuffer(64),steps=new SharedArrayBuffer(64),
      memory=new WebAssembly.Memory({initial:1,maximum:1,shared:true}),ctrl=new Int32Array(control),
      gates=new Int32Array(steps),words=new Uint32Array(memory.buffer),workers=[],mail=[];
    words[0]=words[1]=0x11111111;
    for(let core=0;core<cores;core++) {
      const w=new Worker(new URL(import.meta.url),{workerData:{control,steps,memory,core,cores,polling:core!==legacy}});
      workers.push(w);mail.push(Mail(w));
    }
    await Promise.all(mail.map(m=>m("ready")));
    return {ctrl,gates,words,workers,mail,
      mark(at,value=1){Atomics.store(gates,at,value);Atomics.notify(gates,at);},
      async until(at,value=1){while(Atomics.load(gates,at)!==value)await Atomics.waitAsync(gates,at,Atomics.load(gates,at),100).value;},
      close:()=>Promise.all(workers.map(w=>w.terminate()))};
  }

  let f=await Fixture();
  try {
    f.workers[1].postMessage({kind:"hold"});await f.until(0);
    f.workers[0].postMessage({kind:"wide"});
    const blocked=await f.mail[0]("waiting");assert.equal(blocked.index,BUS_ACTIVE);
    assert.equal(Atomics.load(f.ctrl,BUS_OWNER),1);assert.equal(Atomics.load(f.ctrl,BUS_ACTIVE),2);
    assert.deepEqual(Array.from(f.words.slice(0,2)),[0x11111111,0x11111111]);
    f.mark(1);await f.mail[1]("done");await f.until(3);f.mark(4);await f.mail[0]("done");
    assert.deepEqual(Array.from(f.words.slice(0,2)),[0xAAAAAAAA,0xAAAAAAAA]);
  } finally {await f.close();}

  for(const action of ["read","write"])for(const unsafe of [false,true]) {
    f=await Fixture();
    try {
      f.workers[0].postMessage({kind:"wide"});await f.until(3);
      f.workers[1].postMessage({kind:action,unsafe});
      if(unsafe) {
        const result=await f.mail[1]("done");
        if(action==="read")assert.equal(BigInt(result.result),0x11111111AAAAAAAAn,"unguarded WASM sees a forced torn value");
      } else {
        const blocked=await f.mail[1]("waiting");assert.equal(blocked.index,BUS_OWNER);
        assert.equal(Atomics.load(f.ctrl,BUS_ACTIVE),0);
        assert.deepEqual(Array.from(f.words.slice(0,2)),[0xAAAAAAAA,0x11111111]);
      }
      f.mark(4);await f.mail[0]("done");
      if(!unsafe) {
        const result=await f.mail[1]("done");
        if(action==="read")assert.equal(BigInt(result.result),0xAAAAAAAAAAAAAAAAn);
      }
      assert.deepEqual(Array.from(f.words.slice(0,2)),action==="read"?[0xAAAAAAAA,0xAAAAAAAA]:
        unsafe?[0xBBBBBBBB,0xAAAAAAAA]:[0xBBBBBBBB,0xBBBBBBBB]);
    } finally {await f.close();}
  }

  f=await Fixture();
  try {
    f.words[0]=f.words[1]=0;
    f.workers.forEach(w=>w.postMessage({kind:"upgrade"}));await f.until(0);await f.until(1);
    assert.equal(Atomics.load(f.ctrl,BUS_ACTIVE),3);f.mark(4);
    await Promise.all(f.mail.map(m=>m("done")));
    assert.deepEqual(Array.from(f.words.slice(0,2)),[2,2]);
  } finally {await f.close();}

  f=await Fixture();
  try {
    f.workers[0].postMessage({kind:"capture"});await f.until(0);
    f.workers[1].postMessage({kind:"capture-ap"});
    assert.equal((await f.mail[1]("waiting")).index,BUS_ACTIVE);f.mark(1);
    await Promise.all(f.mail.map(m=>m("done")));
    assert.equal(f.words[2],0xCCCCCCCC);assert.equal(Atomics.load(f.ctrl,BUS_ACTIVE),0);
  } finally {await f.close();}

  const ctrl=new Int32Array(new SharedArrayBuffer(64)),bsp=CoreBus(ctrl,0,2),old=CoreBus(ctrl,1,2);
  bsp.Join({polling:true});old.Join({polling:false});
  bsp.Access(()=>{assert.equal(bsp.Lock(),false);assert.equal(Atomics.load(ctrl,BUS_ACTIVE),1);});
  assert.equal(Atomics.load(ctrl,BUS_OWNER),0);
  assert.throws(()=>CoreBus(ctrl,1,2).Join({polling:true}),/another owner/);
  assert.throws(()=>bsp.Access(async()=>{}),/synchronous/);
  bsp.Access(()=>assert.throws(()=>bsp.Suspend(()=>bsp.Access(()=>{})),/suspended/));
  Atomics.store(ctrl,BUS_ABI,BUS_VERSION+1);assert.throws(()=>CoreBus(ctrl,0,2),/protocol/);
  for(const [core,cores]of [[0,0],[0,5],[4,4],[0,1.5]])
    assert.throws(()=>CoreBus(new Int32Array(new SharedArrayBuffer(64)),core,cores),/topology/);
  {
    const ctrl=new Int32Array(new SharedArrayBuffer(64)),bus=CoreBus(ctrl,0,1);
    bus.Join({polling:true});
    bus.Access(()=>{
      assert.equal(bus.Lock(),true);
      bus.Access(()=>{assert.equal(bus.Lock(),true);bus.Unlock();});
      assert.equal(Atomics.load(ctrl,BUS_OWNER),1);
      bus.Unlock();assert.equal(Atomics.load(ctrl,BUS_OWNER),0);
    });
    let value=1,resume;
    const pending=new Promise(resolve=>resume=resolve).then(()=>bus.Access(()=>{value=2;}));
    Atomics.store(ctrl,2,1);bus.Freeze();resume();
    await assert.rejects(pending,/being serialized/);
    assert.throws(()=>bus.Access(()=>{value=3;}),/being serialized/);
    assert.equal(value,1,"late continuations cannot mutate serialized RAM");
    bus.Thaw();bus.Access(()=>{value=4;});assert.equal(value,4);
    assert.throws(()=>bus.Access(()=>{bus.Lock();throw new Error("failed midway");}),/did not retire/);
    assert.equal(bus.Stopped(),true);assert.equal(Atomics.load(ctrl,BUS_OWNER),1);
    assert.throws(()=>bus.Access(()=>{value=5;}),/stopped/);
    assert.equal(value,4);
    assert.equal(CaptureBarrier(ctrl,1,()=>true).Lock(),false);
  }
  for(const phase of ["owning","upgrading"]) {
    f=await Fixture();
    try {
      if(phase==="upgrading") {
        f.workers[1].postMessage({kind:"hold"});await f.until(0);
      }
      f.workers[0].postMessage({kind:"wide"});
      if(phase==="owning") {
        await f.until(3);f.workers[1].postMessage({kind:"read"});
        assert.equal((await f.mail[1]("waiting")).index,BUS_OWNER);
      } else assert.equal((await f.mail[0]("waiting")).index,BUS_ACTIVE);
      const exited=new Promise(resolve=>f.workers[0].once("exit",()=>{BusStop(f.ctrl);resolve();}));
      await f.workers[0].terminate();await exited;
      if(phase==="upgrading")f.mark(1);
      await assert.rejects(f.mail[1]("done"),/Shared bus stopped/);
      assert.equal(CaptureBarrier(f.ctrl,2,()=>true).Lock(),false,"a lost instruction owner cannot produce a snapshot acknowledgement");
      assert.equal(Atomics.load(f.ctrl,BUS_OWNER),1,"a dead owner is not stolen");
    } finally {await f.close();}
  }
  console.log("Private bus prototype: forced WASM reads/host writes, simultaneous upgrades, nested access and capture/unwind handoff pass. Unguarded negative controls observe torn values; missing legacy polling refuses ownership.");
}
