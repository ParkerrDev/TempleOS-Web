import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GuestHarness} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/Test/GuestHarness.mjs";
import {compileHolyC} from "../hemu/holyc-wasm/src/compiler.js";
import {createHost} from "../hemu/holyc-wasm/src/runtime/host.js";

const h=await GuestHarness(),host=createHost({}),
  source=readFileSync(new URL("WinDraw.HC",import.meta.url),"latin1"),
  compiled=compileHolyC(source,{filename:"WinDraw.HC",lenient:false,
    resilient:false,exports:["WinDraw","WinDrawTitle","WinDrawStride"]}),
  wasm=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),
  fn=wasm.instance.exports;
h.ex.RenderFastSet(0n);
host.attach(wasm.instance);
fn.__main();
new Uint8Array(fn.memory.buffer).set(Buffer.from("Native Tools\0"),
  Number(fn.WinDrawTitle()));
await h.Exec(readFileSync(new URL("WinDrawRef.HC",import.meta.url),"latin1"));
function Var(name)
{
  return h.gx.rd64(Number(h.ex.GuestVar(h.Name(name))));
}
let total=0,phases=new Set(),times=[16000000,320000000,525000000,780000000];
for (let pose of [[false,0,0,0],[true,500000,500000,0],
    [true,1000000,1000000,3],[false,250000,750000,1]]) {
  h.TimeSet(times.shift());
  await h.Exec("WinDrawRef("+pose.map(Number).join(",")+");");
  let phase=Var("win_draw_phase"),blink=Var("win_draw_blink"),
    time=Math.ceil(phase*1000/64),native=h.gx.rdBytes(Var("win_draw_ref"),640*480),
    ptr=Number(fn.WinDraw(320n,160n,BigInt(pose[0]),BigInt(time),
      BigInt(pose[1]),BigInt(pose[2]),BigInt(pose[3]),1n)),
    pixels=new Uint8Array(fn.memory.buffer),stride=Number(fn.WinDrawStride()),
    mismatches=[];
  phases.add(phase);
  for (let y=0;y<160;y++)
    for (let x=0;x<320;x++)
      if (x<8 || x>=312 || y<8 || y>=152) {
        let expected=native[y*640+x];
        if (y<8 && x>=8 && x<40 && blink!=(Math.floor(time/200)&1))
          expected=16-expected;
        if (pixels[ptr+y*stride+x]!=expected)
          mismatches.push([x,y,expected,pixels[ptr+y*stride+x]]);
        total++;
      }
  assert.deepEqual(mismatches.slice(0,20),[],
    "native pose "+JSON.stringify(pose)+", "+mismatches.length+" mismatches");
}
assert(phases.size>1,"native title reference covers multiple scroll phases");
console.log("WinDraw: "+total+" border pixels equal native TextBorder, DocBorderNew/DocRecalc, DocBorderLstDraw and DrawWinScroll through GuestHarness with graphics shortcuts disabled.");
