import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import {FONT} from "../../holyc-wasm/src/runtime/font.js";
import {FrameTop,FrameFps} from "../../engine/FrameText.js";

const r=compileHemu({exports:["InitMem","CaptureFrom","Present","RamBase"]});
assert.deepEqual(r.warnings,[]);
let locked=false,allow=false,locks=0,unlocks=0;
const frames=[],host=createHemuHost({
  captureLock(){locks++;locked=allow;return allow;},
  captureUnlock(){assert.equal(locked,true);locked=false;unlocks++;},
  present(a,w,h,u8){assert.equal(locked,false);frames.push(u8.slice(a,a+w*h));}
});
const {instance}=await WebAssembly.instantiate(r.bytes,{env:host.env}),
      ex=instance.exports;
host.attach(instance);
ex.__rt_init();
ex.InitMem(400000n);
const buf=new Uint8Array(ex.memory.buffer,Number(ex.RamBase())+1024,307200);
buf.fill(7);
ex.Present();
assert.equal(frames.length,0,"startup cannot expose uncompleted pixels");
ex.CaptureFrom(1024n);
ex.Present();
assert.equal(frames.length,0,"an unacknowledged capture is dropped");
allow=true;
ex.CaptureFrom(1024n);
buf.fill(2);
ex.Present();
assert.equal(frames.length,1);
assert.ok(frames[0].every(v=>v==7),"present uses the captured copy");
ex.Present();
assert.equal(frames.length,1,"one completed frame is presented once");
allow=false;
ex.CaptureFrom(1024n);
ex.Present();
assert.equal(frames.length,1,"a failed next capture cannot expose live pixels");
assert.equal(locks,3);
assert.equal(unlocks,1);

for (const text of ["FPS29", "Time 12:00 FPS 200", "FPS: 99", "A fullscreen game"]) {
  buf.fill(1);
  for (let i=0;i<text.length;i++)
    for (let y=0;y<8;y++)
      for (let x=0;x<8;x++)
        if (FONT[text.charCodeAt(i)*8+y]>>x&1)
          buf[y*640+i*8+x]=15;
  const top=FrameTop(buf,640),match=/FPS:? *(\d+)/.exec(text);
  assert.equal(top.trimEnd(),text);
  assert.equal(FrameFps(top),match?Number(match[1]):null);
}
assert.equal(FrameFps("FPS 1?"),null,"a partially covered number is unknown");
console.log("Capture: completed frames only, coherent core lock, immutable copy, FPS from displayed glyphs.");
