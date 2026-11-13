export const BUS_VERSION=1;
export const BUS_OWNER=12,BUS_ACTIVE=13,BUS_CAPS=14,BUS_ABI=15;

export class BusFault extends Error {
  constructor(message) {super(message);this.code="HEMU_BUS_STOPPED";}
}

export function BusStop(ctrl)
{//A lost owner cannot be replaced safely; refuse further machine access.
  Atomics.store(ctrl,1,1);
  for(const index of [0,1,2,5,6,7,BUS_OWNER,BUS_ACTIVE])Atomics.notify(ctrl,index);
}

export function BusModuleVersion(module)
{
  const imports=new Set(WebAssembly.Module.imports(module).filter(m=>m.module==="env").map(m=>m.name));
  return ["__bus_poll","__bus_lock","__bus_unlock"].every(name=>imports.has(name))?BUS_VERSION:0;
}

export function CoreBus(ctrl,core,cores,{wait=Atomics.wait,timeout=2000}={})
{//Opt-in shared RAM leases and exclusive wide operations.
  if(!(ctrl instanceof Int32Array)||!(ctrl.buffer instanceof SharedArrayBuffer)||ctrl.length<16||
      !Number.isInteger(core)||!Number.isInteger(cores)||core<0||core>=cores||cores>4)
    throw new Error("Invalid shared bus topology");
  const version=Atomics.compareExchange(ctrl,BUS_ABI,0,BUS_VERSION),bit=1<<core,
    capShift=core*8,capMask=255<<capShift;
  if(version!==0&&version!==BUS_VERSION)throw new Error("Unsupported shared bus protocol");
  let depth=0,exclusive=0,suspended=0,joined=false,frozen=false;
  const Active=()=>!!(Atomics.load(ctrl,BUS_ACTIVE)&bit);
  const Stopped=()=>!!Atomics.load(ctrl,1);
  function Publish(active) {
    if(active)Atomics.or(ctrl,BUS_ACTIVE,bit);
    else Atomics.and(ctrl,BUS_ACTIVE,~bit);
    Atomics.notify(ctrl,BUS_ACTIVE);
  }
  function Stop(message) {
    BusStop(ctrl);
    throw new BusFault(message);
  }
  function Wait(index,value,end) {
    if(Stopped())throw new BusFault("Shared bus stopped");
    const left=end-performance.now();
    if(left<=0)Stop("Shared bus owner did not quiesce");
    wait(ctrl,index,value,Math.min(left,10));
  }
  function Enter() {
    const end=performance.now()+timeout;
    for(;;) {
      if(Stopped())throw new BusFault("Shared bus stopped");
      const owner=Atomics.load(ctrl,BUS_OWNER);
      if(owner) {Wait(BUS_OWNER,owner,end);continue;}
      Publish(true);
      if(!Atomics.load(ctrl,BUS_OWNER))return;
      Publish(false);
    }
  }
  function Join({polling=false}={}) {
    if(Stopped())throw new BusFault("Shared bus stopped");
    if(joined)throw new Error("Core already owns a shared bus slot");
    const cap=polling?3:1;
    for(;;) {
      const old=Atomics.load(ctrl,BUS_CAPS);
      if(old&capMask)throw new Error("Shared bus core slot already belongs to another owner");
      if(Atomics.compareExchange(ctrl,BUS_CAPS,old,old|cap<<capShift)===old)break;
    }
    joined=true;
  }
  function Ready() {
    const caps=Atomics.load(ctrl,BUS_CAPS);
    for(let i=0;i<cores;i++)if((caps>>>(i*8)&255)!==3)return false;
    return joined&&Atomics.load(ctrl,BUS_ABI)===BUS_VERSION;
  }
  function Access(fn) {
    if(!joined)throw new Error("Core has not joined the shared bus");
    if(frozen)throw new Error("Captured RAM is being serialized");
    if(suspended)throw new Error("RAM access during a suspended bus lease");
    if(fn.constructor?.name==="AsyncFunction")throw new Error("Shared bus access must be synchronous");
    if(!depth)Enter();
    depth++;
    try {
      const result=fn();
      if(result?.then)throw new Error("Shared bus access returned a pending operation");
      if(Stopped())throw new BusFault("Shared bus stopped before RAM access retired");
      return result;
    } finally {
      depth--;
      if(!depth) {
        Publish(false);
        if(exclusive)Stop("Exclusive bus operation did not retire");
      }
    }
  }
  function Lock() {
    if(Stopped())throw new BusFault("Shared bus stopped");
    if(!depth||suspended||!Ready())return false;
    if(exclusive){exclusive++;return true;}
    if(!Active())throw new Error("Wide operation lacks its RAM lease");
    Publish(false);
    const end=performance.now()+timeout;
    for(;;) {
      if(Stopped())throw new BusFault("Shared bus stopped");
      const owner=Atomics.compareExchange(ctrl,BUS_OWNER,0,core+1);
      if(!owner)break;
      Wait(BUS_OWNER,owner,end);
    }
    for(;;) {
      if(Stopped())throw new BusFault("Shared bus stopped");
      const active=Atomics.load(ctrl,BUS_ACTIVE);
      if(!active)break;
      Wait(BUS_ACTIVE,active,end);
    }
    exclusive=1;
    return true;
  }
  function Unlock() {
    if(Stopped())throw new BusFault("Shared bus stopped before wide operation retired");
    if(!exclusive||Atomics.load(ctrl,BUS_OWNER)!==core+1)
      throw new Error("Core does not own the exclusive bus");
    if(--exclusive)return;
    Publish(true);
    Atomics.store(ctrl,BUS_OWNER,0);Atomics.notify(ctrl,BUS_OWNER);
  }
  function Poll() {
    if(!depth||suspended||exclusive)throw new Error("Invalid bus polling boundary");
    if(Stopped())throw new BusFault("Shared bus stopped");
    if(core&&Atomics.load(ctrl,2))return false;
    const owner=Atomics.load(ctrl,BUS_OWNER);
    if(owner) {Publish(false);Enter();}
    if(Stopped())throw new BusFault("Shared bus stopped at instruction boundary");
    return !(core&&Atomics.load(ctrl,2));
  }
  function Suspend(fn) {
    if(suspended||exclusive)throw new Error("Invalid capture handoff");
    const held=depth>0;
    if(held)Publish(false);
    suspended++;
    try {return fn();}
    finally {suspended--;if(held)Enter();}
  }
  function Guard(instance) {
    const wrapped=new Map(),exports=instance.exports;
    return {exports:new Proxy({}, {
      get(_,name) {
        const value=exports[name];
        if(typeof value!=="function")return value;
        if(!wrapped.has(name))wrapped.set(name,(...args)=>Access(()=>value(...args)));
        return wrapped.get(name);
      },ownKeys:()=>Reflect.ownKeys(exports),
      getOwnPropertyDescriptor:(_,name)=>name in exports?{enumerable:true,configurable:true}:undefined
    })};
  }
  function Freeze() {
    const seq=Atomics.load(ctrl,2);
    if(core||depth||exclusive||suspended||frozen||Stopped()||!seq||
        Atomics.load(ctrl,BUS_OWNER)||Atomics.load(ctrl,BUS_ACTIVE))
      throw new Error("Machine has not retired every RAM access for capture");
    for(let i=1;i<cores;i++)if(Atomics.load(ctrl,4+i)!==seq)
      throw new Error("Application core has not acknowledged capture");
    frozen=true;
  }
  function Thaw() {frozen=false;}
  function Attach(instance,module) {
    Join({polling:BusModuleVersion(module)===BUS_VERSION});
    return Guard(instance);
  }
  function Imports() {
    return {__bus_poll:()=>BigInt(Poll()),__bus_lock:()=>BigInt(Lock()),__bus_unlock:Unlock};
  }
  return {Join,Ready,Access,Lock,Unlock,Poll,Suspend,Guard,Attach,Imports,Stopped,Freeze,Thaw};
}
