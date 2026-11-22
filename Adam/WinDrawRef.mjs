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
await h.Exec(readFileSync(new URL("WinDrawRef.HC",import.meta.url),"latin1"));
function Var(name)
{
  return h.gx.rd64(Number(h.ex.GuestVar(h.Name(name))));
}
let total=0,phases=new Set(),cases=0;
const poses=[[false,0,0,0],[true,500000,500000,0],
  [true,1000000,1000000,3],[false,250000,750000,1]],
  times=[16000000,320000000,525000000,780000000],
  windows=[[40,20,"Native Tools"],[16,12,"Settings"],[10,8,"Menu"],
    [8,6,"ABCDEFGH"],[5,4,"LongName tools"],[3,3,"W"],
    [40,4,"ABCDEFGH"],[40,20,""],[40,20,"W"],
    [40,20,"An unusually long browser window title"]];
for (const [cols,rows,title] of windows) for (let pose_index=0;pose_index<poses.length;pose_index++) {
  const pose=poses[pose_index],width=cols*8,height=rows*8,desc=title.split(" ")[0].slice(0,8);
  h.TimeSet(times[pose_index]);
  new Uint8Array(fn.memory.buffer).set(Buffer.from(title+"\0","latin1"),Number(fn.WinDrawTitle()));
  await h.Exec("WinDrawRef("+[cols,rows,JSON.stringify(title),JSON.stringify(desc),...pose.map(Number)].join(",")+");");
  const phase=Var("win_draw_phase"),blink=Var("win_draw_blink"),
    native=h.gx.rdBytes(Var("win_draw_ref"),640*480);
  let time=Math.ceil(phase*1000/64),cycle=0;
  while ((Math.floor(time/200)&1)!=blink && cycle++<16)
    time=Math.ceil((phase+cycle*(title.length+3)*8)*1000/64);
  assert.equal(Math.floor(time/200)&1,blink,"reference MENU phase can be matched without recoloring pixels");
  const ptr=Number(fn.WinDraw(BigInt(width),BigInt(height),BigInt(pose[0]),BigInt(time),
      BigInt(pose[1]),BigInt(pose[2]),BigInt(pose[3]),1n)),
    pixels=new Uint8Array(fn.memory.buffer),stride=Number(fn.WinDrawStride()),
    mismatches=[];
  phases.add(phase);
  for (let y=0;y<height;y++)
    for (let x=0;x<width;x++)
      if (x<8 || x>=width-8 || y<8 || y>=height-8) {
        let expected=native[y*640+x];
        if (pixels[ptr+y*stride+x]!=expected)
          mismatches.push([x,y,expected,pixels[ptr+y*stride+x]]);
        total++;
      }
  cases++;
  assert.deepEqual(mismatches.slice(0,20),[],
    "native pose "+JSON.stringify({cols,rows,title,pose})+", "+mismatches.length+" mismatches");
}
assert(phases.size>1,"native title reference covers multiple scroll phases");
console.log("WinDraw: "+total+" border pixels across "+cases+" cases equal native TextBorder, DocBorderNew/DocRecalc, DocBorderLstDraw and DrawWinScroll through GuestHarness with graphics shortcuts disabled.");
