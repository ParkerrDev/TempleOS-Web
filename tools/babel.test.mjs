import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";

//The browser compiles editor/Adam.HC before a game, so the test does too.
const adam=await readFile(new URL("../editor/Adam.HC",import.meta.url),"utf8"),
  source=await readFile(new URL("../games/Babel.HC",import.meta.url),"utf8"),
  compiled=compileHolyC(adam+source.replace(/\nBabel;\s*$/,"\n"),{
    filename:"Babel.HC",lenient:false,
    exports:["RotInit","BagNext","StoneNew","StoneTurn","StoneFits","StoneLock"]}),
  host=createHost({}),res=await WebAssembly.instantiate(compiled.bytes,
    {env:host.env}),fn=res.instance.exports;
host.attach(res.instance);
fn.__main();
const mem=new DataView(fn.memory.buffer),
  addr=name=>Number(compiled.globals.get(name).addr),
  get=name=>Number(mem.getBigInt64(addr(name),true)),
  set=(name,value)=>mem.setBigInt64(addr(name),BigInt(value),true),
  arr=(name,i)=>Number(mem.getBigInt64(addr(name)+8*i,true));
fn.RotInit();
//The 6-cell Latin cross has a short top and a longer stem below its arms.
assert.equal(arr("bb_base",7),0x2272);
for (let t=0;t<4;t++)
  assert.equal(arr("bb_rot",7*4+t),0x2272);
for (let bag=0;bag<12;bag++) {
  const pieces=Array.from({length:8},()=>Number(fn.BagNext()));
  assert.deepEqual(pieces.sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
}
fn.StoneNew();
set("bb_cur",7);
set("bb_turn",0);
set("bb_x",3);
set("bb_y",16);
set("bb_lock_t",29);
set("bb_lock_moves",14);
for (let i=0;i<8;i++)
  fn.StoneTurn();
assert.deepEqual([get("bb_turn"),get("bb_x"),get("bb_y"),
  get("bb_lock_t"),get("bb_lock_moves")],[0,3,16,29,14],
  "ignored rotation cannot kick or reset the lock delay");
assert.equal(fn.StoneFits(0x2272n,3n,16n),1n);
assert.equal(fn.StoneFits(0x2272n,3n,17n),0n);
fn.StoneLock();
const board=new Uint8Array(fn.memory.buffer,addr("bb_board"),200),cells=[];
for (let y=0;y<20;y++)
  for (let x=0;x<10;x++)
    if (board[y*10+x])
      cells.push([x,y,board[y*10+x]]);
assert.deepEqual(cells,[[4,16,8],[3,17,8],[4,17,8],[5,17,8],
  [4,18,8],[4,19,8]]);
console.log("Babel: 8-piece bags, upright cross, collision, locking and ignored rotations passed.");
