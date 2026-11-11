//Synchronous legacy programs and native cooperative tasks share the display.
import { compileHolyC } from "../holyc-wasm/src/compiler.js";
import { compileNativeProject } from "./project.js";
import { createMouseButtons } from "./mouse-buttons.js";
import {MS_ADDR,MS} from "../holyc-wasm/src/abi.js";
import { createHost } from "../holyc-wasm/src/runtime/host.js";
import {createTaskHost} from "../holyc-wasm/src/runtime/tasks.js";
import { Framebuffer } from "../holyc-wasm/src/runtime/graphics.js";
import { CTRL, KB_BASE, KB_RING, SND_BASE, SND_RING, SND_TONE, SND_NOTE, KEY_STATE_BASE, keyPacketRead } from "../holyc-wasm/src/runtime/protocol.js";

let ctrl = null;       // Int32Array view over the control SAB
let fb = null;
let lastFlip = 0;
let wakeInput=null;

function nowMs() { return performance.now(); }

// --- input ---
function scanChar() {
  // peek without consuming
  const head = Atomics.load(ctrl, CTRL.KB_HEAD);
  const tail = Atomics.load(ctrl, CTRL.KB_TAIL);
  if (head === tail) return 0;
  return Atomics.load(ctrl, KB_BASE + (tail % KB_RING));
}
function getChar() {
  presentMaybe(true); // show pending graphics before blocking for keyboard input
  // blocking: wait until a char is available, then consume it
  while (Atomics.load(ctrl, CTRL.RUNNING) === 1) {
    const head = Atomics.load(ctrl, CTRL.KB_HEAD);
    const tail = Atomics.load(ctrl, CTRL.KB_TAIL);
    if (head !== tail) {
      const ch = Atomics.load(ctrl, KB_BASE + (tail % KB_RING));
      Atomics.store(ctrl, CTRL.KB_TAIL, tail + 1);
      return ch;
    }
    // sleep briefly waiting for input
    Atomics.wait(ctrl, CTRL.SLEEP_FUTEX, 0, 16);
  }
  return 0x1b; // ESC if stopped
}
// --- timing ---
function sleep(ms) {
  if (Atomics.load(ctrl, CTRL.RUNNING) !== 1) return;
  if (ms <= 0) { presentMaybe(true); return; }
  presentMaybe(true);
  // block the worker thread; wake early if stop requested via notify
  let remain = ms;
  const step = 50;
  while (remain > 0 && Atomics.load(ctrl, CTRL.RUNNING) === 1) {
    Atomics.wait(ctrl, CTRL.SLEEP_FUTEX, 0, Math.min(step, remain));
    remain -= step;
  }
}

// --- sound ring (worker -> main) ---
function pushSnd(type, arg) {
  const head = Atomics.load(ctrl, CTRL.SND_HEAD);
  const slot = SND_BASE + (head % SND_RING) * 2;
  Atomics.store(ctrl, slot, type);
  Atomics.store(ctrl, slot + 1, Math.round(arg));
  Atomics.store(ctrl, CTRL.SND_HEAD, head + 1);
}

// --- graphics present throttling ---
function presentMaybe(force) {
  const t = nowMs();
  if (force || t - lastFlip > 16) {
    lastFlip = t;
    Atomics.add(ctrl, CTRL.FRAME, 1);   // signal the main-thread presenter
    return true;
  }
}

// --- mouse mirror into wasm memory ---
self.onmessage = async (e) => {
  const msg = e.data;
  if(msg.type==="input"){wakeInput?.();return;}
  if (msg.type === "run") {
    const { source, controlSAB, fbSAB } = msg;
    ctrl = new Int32Array(controlSAB);
    const buttons=createMouseButtons(ctrl);
    // Draw into the SHARED index buffer; the main thread presents it. (A worker
    // blocked in a synchronous program loop never composites its own canvas.)
    fb = new Framebuffer(null, 640, 480, 1, new Uint8Array(fbSAB));

    let outBuf = "";
    const flush = () => { if (outBuf) { self.postMessage({ type: "text", text: outBuf }); outBuf = ""; } };

    let host,useTasks=false,nativeActive=false,failure=null,taskError=null,drawPending=false;
    try {
      const { bytes, warnings, globals, requiredCapabilities } = msg.nativeGame
        ? compileNativeProject({source,filename:msg.filename,files:msg.files})
        : compileHolyC(source, { filename: "program.HC", lenient: false, resilient: false });
      self.postMessage({ type: "compiled", size: bytes.length, warnings });

      useTasks=requiredCapabilities.includes("task-continuations");
      const mod=await WebAssembly.compile(bytes);
      const unavailable=useTasks && WebAssembly.Module.imports(mod).find(item=>
        ["__get_char","__scan_char"].includes(item.name));
      if(unavailable)throw new Error((unavailable.name==="__get_char"?"GetChar":"ScanChar")+
        " is not yet supported with native tasks. Run this program in TempleOS through HEMU.");
      host = (useTasks?createTaskHost:createHost)({
        onTaskError:error=>{taskError??=error;host.stop();},
        ansi: false,
        onText: (s) => { outBuf += s; if (outBuf.length > 256 || s.includes("\n")) flush(); },
        gfx: {
          width: 640, height: 480,
          indices: fb.indices,
          plot: (x, y, c) => fb.plot(x, y, c),
          line: (x1, y1, x2, y2, c, t) => fb.line(x1, y1, x2, y2, c, t),
          rect: (x, y, w, h, c) => fb.rect(x, y, w, h, c),
          circle: (x, y, r, c, fl) => fb.circle(x, y, r, c, fl),
          text: (x, y, c, s) => fb.text(x, y, c, s),
          sprite: (x, y, w, h, px, scale) => fb.sprite(x, y, w, h, px, scale),
          fill: (c) => { fb.fill(c); },
          flip: () => {drawPending=false;presentMaybe(true);},
        },
        snd: useTasks?{tone:f=>pushSnd(SND_TONE,f)}:{
          tone: (f) => pushSnd(SND_TONE, f),
          note: (f, ms) => { pushSnd(SND_NOTE, f); sleep(ms); pushSnd(SND_TONE, 0); },
        },
        sleep: (ms) => {sleep(ms);buttons.advance();host.state.onTick();},
        yield: () => {if(presentMaybe(false)){buttons.advance();host.state.onTick();}},
        scanChar,getChar,timeMs:nowMs,
      });

      if(useTasks){
        const update=host.env.__gr_update;
        host.env.__gr_update=(...args)=>{update(...args);drawPending=true;};
      }
      const inst = await WebAssembly.instantiate(mod, { env: host.env });
      host.attach(inst);

      // mirror the mouse SAB into the wasm `ms` struct on every tick
      const capture=globals.get('BrowserMouseCapture'), dx=globals.get('BrowserMouseDX'), dy=globals.get('BrowserMouseDY'), keys=globals.get('BrowserKeys');
      let wasCapture=false;
      const drainInput=()=>{
        if(!nativeActive)return;
        const input=keyPacketRead(ctrl);
        if(input.reset)host.resetInput();
        for(const packet of input.packets)host.keyBytes(packet);
      };
      if(useTasks)wakeInput=()=>{
        try{host.state.onTick();}
        catch(error){taskError??=error;host.stop();}
      };
      host.state.onTick = () => {
        if(useTasks){
          if(nativeActive && drawPending){drawPending=false;presentMaybe(true);}
          buttons.advance();drainInput();
        }
        const dv = new DataView(inst.exports.memory.buffer);
        dv.setInt32(MS_ADDR+MS.x, Atomics.load(ctrl, CTRL.MS_X), true);
        dv.setInt32(MS_ADDR+MS.y, Atomics.load(ctrl, CTRL.MS_Y), true);
        dv.setInt32(MS_ADDR+MS.z, Atomics.load(ctrl, CTRL.MS_Z), true);
        const mouseButtons=buttons.sample();
        dv.setInt32(MS_ADDR+MS.lb, mouseButtons&1?1:0, true);
        dv.setInt32(MS_ADDR+MS.rb, mouseButtons&2?1:0, true);
        if(keys)for(let sc=0;sc<128;sc++)dv.setUint8(Number(keys.addr)+sc,Atomics.load(ctrl,KEY_STATE_BASE+sc));
        for(const [variable,index] of [[dx,CTRL.MS_DX],[dy,CTRL.MS_DY]])if(variable){
          const addr=Number(variable.addr);dv.setBigInt64(addr,dv.getBigInt64(addr,true)+BigInt(Atomics.exchange(ctrl,index,0)),true);
        }
        const wanted=!!(capture && dv.getBigInt64(Number(capture.addr),true));
        if(wanted!==wasCapture){wasCapture=wanted;self.postMessage({type:'inputMode',capture:wanted});}
      };

      Atomics.store(ctrl, CTRL.RUNNING, 1);
      host.state.onTick();
      self.postMessage({type:"keyboardMode",native:useTasks});
      if(useTasks){nativeActive=true;await host.run();}
      else inst.exports.__main();
      if(taskError)throw taskError;
    } catch(err) {
      failure=err;
    } finally {
      nativeActive=false;wakeInput=null;
      if(useTasks && host){
        try{await host.dispose();}catch(error){failure??=error;}
      }
      flush();
      Atomics.store(ctrl,CTRL.DONE,1);
      if(failure)self.postMessage({type:"error",error:String(failure.stack||failure),nativeGame:!!msg.nativeGame});
      else{fb.present();self.postMessage({type:"done"});}
    }
  }
};
