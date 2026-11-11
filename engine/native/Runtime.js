import "./Platform.js";
import {SnapshotOpen,SnapshotChunks,SnapshotReader} from "../Snapshot.js";
import {createHemuHost,CpuFaultText} from "../host.js";
import {createGuestExec} from "../guestexec.js";
import {createGuestInput} from "../guestinput.js";
import {KeyQueue} from "../KeyQueue.js";
import {KeyInput} from "../../Keyboard.js";
import {FrameTop,FrameFps} from "../FrameText.js";
import {DocClipCheck} from "../DocClip.js";
import * as jit from "../jit.js";

let machine=null,attempted=false;
function Reader(path) {
  const id=NativeStreamOpen(path,0);let closed=false;
  return SnapshotReader({
    async read(){if(closed)throw Error("Closed snapshot stream");const value=NativeStreamRead(id,131072);return {done:!value.length,value};},
    async cancel(){if(!closed){closed=true;NativeStreamClose(id,0);}}
  });
}
async function Write(path,state) {
  const {chunks}=await SnapshotChunks(state),id=NativeStreamOpen(path,1);
  try {
    for(const bytes of chunks)
      for(let at=0;at<bytes.length;at+=131072)NativeStreamWrite(id,bytes.subarray(at,at+131072));
    NativeStreamClose(id,1);
  } finally {NativeStreamClose(id,0);}
}
export async function Open(path) {
  if(attempted)throw Error("Open a replacement machine in a fresh context");
  attempted=true;
  const saved=await SnapshotOpen(path,{busProtocol:0,reader:Reader});
  if(!saved)throw Error("Open a complete .hemu saved session; raw RAM lacks CPU and disk state");
  try {
    if(saved.meta.cores!==1||saved.meta.requiredBusProtocol)
      throw Error("This native host supports one CPU only");
    let inst,disk,gx,frame=null,frameSerial=0,fps=null,ns=0,fault="",tone=0;
    const meta=saved.meta,base=meta.base,keys=KeyQueue(),palette=[],
      pointer=createGuestInput({guest:()=>gx}),input=KeyInput(bytes=>keys.Push(bytes)),
      host=createHemuHost({heapAbi:meta.heapAbi,onText:NativeLog,
        palette:(index,rgb)=>palette[index]=rgb,
        snd:{tone:frequency=>{tone=Number(frequency);}},
        present:(address,w,h,bytes)=>{
          if(w!==640||h!==480)throw Error("Unsupported native display dimensions");
          frame=bytes.slice(address,address+w*h);frameSerial++;
          fps=FrameFps(FrameTop(frame,640));
        },
        diskRead:(...args)=>disk?.readInto(...args),diskWrite:(...args)=>disk?.writeInto(...args)});
    if(host.state.heapAbi!==meta.heapAbi)throw Error("Unsupported saved allocator");
    Object.assign(host.env,{
      __host_ns:()=>BigInt(ns),__host_budget:()=>BigInt(meta.budget),
      __host_key:keys.Read,__host_msx:pointer.x,__host_msy:pointer.y,__host_msb:pointer.buttons,__host_wheel:pointer.wheel,
      __jit_state(r,f,p){jit.jitState(r,f,p,base,inst.exports.memory,inst.exports.RdMem,inst.exports.WrMem,inst.exports.RasterHLE);return 1n;},
      __jit_compile:r=>BigInt(jit.jitCompile(Number(r))),__jit_run:r=>BigInt(jit.jitRun(Number(r))),
      __jit_dispatch:n=>BigInt(jit.jitDispatch(Number(n))),__jit_x87:(...args)=>jit.jitX87(...args),
      __jit_chain:(...args)=>jit.jitChain(...args),__jit_seg:(...args)=>jit.jitSeg(...args.map(Number))
    });
    jit.jitReset();
    inst=new WebAssembly.Instance(new WebAssembly.Module(saved.wasm),{env:host.env});host.attach(inst);
    disk=await saved.Restore(inst.exports.memory,{busProtocol:0});
    host.state.heapPtr=meta.heapPtr;inst.exports.__sp.value=BigInt(meta.sp);
    if(Number(inst.exports.RamBase())!==base)throw Error("Saved RAM base mismatch");
    if(Number(inst.exports.GuestInfo(15n))!==1)throw Error("Saved CPU topology does not match the native one-core host");
    keys.Restore(meta.keyboard);pointer.restore(meta.pointer);
    inst.exports.SnapshotResume();
    if(!frame||palette.length!==16)throw Error("Missing completed display");
    gx=createGuestExec({inst,gBase:base});const probe=gx.probe();
    if(!probe.ok)throw Error("Saved guest API: "+probe.errors.join("; "));
    gx.restoreLaunch(meta.launch);
    //A restored session retains its documented patch policy. Never fetch or modify guest code here.
    DocClipCheck(gx,meta.guestPatches);
    fault=CpuFaultText(inst.exports);
    let paused=meta.paused||!!fault;
    machine={
      status:()=>({paused,fault,fps,frameSerial,tone:paused||fault?0:tone,cores:1,memoryBytes:inst.exports.memory.buffer.byteLength}),
      frame:()=>NativeFrame(frame,palette),
      tick(delta){if(paused||fault)return;ns=delta;pointer.beforeFrame();inst.exports.__main();gx.tick();fault=CpuFaultText(inst.exports);if(fault){paused=true;keys.Release();}},
      pause(value){if(!value&&fault)throw Error(fault);paused=value;if(paused){input.reset();keys.Release();pointer.accept({b:0,reset:true});}},
      key(id,down){if(paused||fault)return;if(down)input.down(id,id);else input.up(id);},
      mouse:p=>{if(!paused&&!fault)pointer.accept(p);},
      release(){input.reset();keys.Release();pointer.accept({b:0,reset:true});},
      async save(path){
        const launch=gx.snapshot(),current={...meta,paused,heapPtr:host.state.heapPtr,sp:Number(inst.exports.__sp.value),keyboard:keys.Save(),pointer:pointer.save(),launch};
        await Write(path,{meta:current,wasm:saved.wasm,memory:inst.exports.memory,disk});
      },
      exec:src=>gx.exec({src,target:"adam"}),job:id=>gx.status(id)
    };
    return Status();
  } finally {await saved.Close();}
}
function Require(){if(!machine)throw Error("No complete machine is loaded");return machine;}
export function Status(){return Require().status();}
export function Frame(){Require().frame();}
export function Tick(ns){if(!Number.isSafeInteger(ns)||ns<0)throw Error("Invalid clock delta");Require().tick(ns);return Status();}
export function Pause(value){Require().pause(!!value);return Status();}
export function Key(id,down){Require().key(id,down);}
export function Mouse(point){Require().mouse(point);}
export function Release(){Require().release();}
export async function Save(path){await Require().save(path);return Status();}
export function Exec(src){return Require().exec(src);}
export function Job(id){return Require().job(id);}
