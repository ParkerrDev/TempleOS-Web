import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileHolyC} from "../hemu/holyc-wasm/src/compiler.js";
import {createHost} from "../hemu/holyc-wasm/src/runtime/host.js";
import {FONT} from "../hemu/holyc-wasm/src/runtime/font.js";

const source=readFileSync(new URL("WinDraw.HC",import.meta.url),"latin1"),
  compiled=compileHolyC(source,{filename:"WinDraw.HC",lenient:false,
    resilient:false,exports:["WinDraw","WinDrawTitle","WinDrawStride"]}),
  host=createHost({}),wasm=await WebAssembly.instantiate(compiled.bytes,
    {env:host.env}),fn=wasm.instance.exports;
assert.deepEqual(compiled.warnings,[]);
assert.deepEqual(compiled.diagnostics,[]);
host.attach(wasm.instance);
fn.__main();
function Draw(width,height,solid,time=0,sx=500000,sy=500000,held=0)
{
  let ptr=Number(fn.WinDrawTitle());
  new Uint8Array(fn.memory.buffer).set(Buffer.from("Native Tools\0"),ptr);
  ptr=Number(fn.WinDraw(BigInt(width),BigInt(height),BigInt(solid),BigInt(time),
    BigInt(sx),BigInt(sy),BigInt(held),1n));
  let stride=Number(fn.WinDrawStride()),mem=new Uint8Array(fn.memory.buffer);
  return Array.from({length:height},function (_,y) {
    return Array.from(mem.slice(ptr+y*stride,ptr+y*stride+width));
  });
}
function Glyph(pixels,x,y,ch,fg=1,bg=15)
{
  for (let row=0;row<8;row++)
    for (let col=0;col<8;col++)
      assert.equal(pixels[y+row][x+col],FONT[ch*8+row]&(1<<col)?fg:bg,
        "glyph "+ch+" at "+(x+col)+","+(y+row));
}
for (let solid of [false,true]) {
  const pixels=Draw(320,160,solid);
  Glyph(pixels,0,0,6+Number(solid));
  Glyph(pixels,312,0,8+Number(solid));
  Glyph(pixels,0,152,10+Number(solid));
  Glyph(pixels,312,152,12+Number(solid));
  Glyph(pixels,64,152,2+Number(solid));
  Glyph(pixels,0,96,4+Number(solid));
  Glyph(pixels,8,0,77);
  Glyph(pixels,288,0,91);
  Glyph(pixels,0,8,78);
  assert.equal(pixels[80][160],255,"the document interior is transparent");
}
const normal=Draw(320,160,true,0,0,0),blink=Draw(320,160,true,200),
  held=Draw(320,160,true,0,500000,500000,3);
Glyph(blink,8,0,77,15,1);
for (let [x,y] of [[156,152],[312,76]]) {
  assert.equal(held[y][x],1,"pressed scroll border uses foreground");
  assert.equal(held[y+2][x+2],14,"pressed scroll center uses complement");
}
assert.equal(normal[152][4],14);
assert.equal(normal[154][6],1);
assert.notDeepEqual(Draw(320,160,true,16)[0],normal[0],
  "the title advances in native pixels, not browser character steps");
assert.equal(fn.WinDraw(23n,160n,1n,0n,0n,0n,0n,1n),0n);
const odd=Draw(323,163,true);
Glyph(odd,315,155,13);
Glyph(odd,291,0,91);
Glyph(odd,307,0,93);
assert.equal(odd[81][161],255);
console.log("WinDraw: exact native font corners, focus, MENU blink, close, desc, scroll positions/pressed colors, title movement, transparent and partial cells.");
