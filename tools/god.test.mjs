import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";
import {BibleReader} from "../god/Bible.js";

const source=await readFile(new URL("../god/GodBits.HC",import.meta.url),"utf8"),
  r=compileHolyC(source,{filename:"GodBits.HC",lenient:false,
    exports:["GodFifoRst","GodBitsIns","GodBits"]}),host=createHost({}),
  wasm=await WebAssembly.instantiate(r.bytes,{env:host.env});
host.attach(wasm.instance);
wasm.instance.exports.__main();
const fn=wasm.instance.exports;
assert.equal(fn.GodBits(1n),-1n,"missing entropy must not read old memory");
fn.GodBitsIns(4n,13n);
assert.equal(fn.GodBits(4n),11n,"TempleOS inserts LSB first and reads MSB first");
fn.GodBitsIns(64n,-1n);
assert.equal(fn.GodBits(64n),-1n,"oversized reads cannot overflow I64");
assert.equal(fn.GodBits(63n),0x7FFFFFFFFFFFFFFFn);
assert.equal(fn.GodBits(1n),1n);
for (let i=0;i<40;i++)
  fn.GodBitsIns(32n,0xFFFFFFFFn);
for (let i=0;i<32;i++)
  assert.equal(fn.GodBits(32n),0xFFFFFFFFn);
assert.equal(fn.GodBits(1n),-1n,"overflow cannot overwrite or inflate FIFO");
fn.GodFifoRst();
fn.GodBitsIns(21n,0n);
assert.equal(fn.GodBits(21n),0n);

const root=new URL("../assets/",import.meta.url),raw=await readFile(
  new URL("kjv.txt",root)),lines=raw.toString().trimEnd().split("\n"),
  idx=JSON.parse(await readFile(new URL("bible/index.json",root)));
assert.equal(idx.sha256,createHash("sha256").update(raw).digest("hex"));
assert.equal(idx.lines,lines.length);
assert.equal(idx.books.length,66);
let largest=0;
for (let start=0;start<lines.length;start+=idx.chunkLines) {
  const data=await readFile(new URL("bible/"+start/idx.chunkLines+".json",root)),
    part=JSON.parse(data);
  largest=Math.max(largest,data.length);
  assert.deepEqual(part.lines,lines.slice(start,start+idx.chunkLines+
    idx.passageLines-1));
}
assert(largest<40000,"a passage should not fetch the whole Bible");
let requests=[],fail=false;
async function Fetch(url)
{
  requests.push(url.pathname);
  if (fail) {
    fail=false;
    return new Response("Unavailable",{status:503});
  }
  return new Response(await readFile(url));
}
let reader=BibleReader(Fetch);
const first=await reader.Passage(3);
assert.equal(first.ref,"Genesis 1:1");
assert.equal(first.text,lines.slice(3,23).join("\n").trim());
assert.equal(requests.length,2);
await reader.Passage(4);
assert.equal(requests.length,2,"cached chunk is reused");
for (let start of [510,511,512,idx.lines-20,idx.books.at(-1).line]) {
  const passage=await reader.Passage(start);
  assert.equal(passage.text,lines.slice(start,start+20).join("\n").trim());
}
assert.equal((await reader.Passage(idx.books.at(-1).line)).ref,"Revelation 1:1");
reader=BibleReader(Fetch);
fail=true;
await assert.rejects(reader.Passage(3),/503/);
assert.equal((await reader.Passage(3)).ref,"Genesis 1:1");
fail=true;
await assert.rejects(reader.Passage(2000),/503/);
assert.equal((await reader.Passage(2000)).text,
  lines.slice(2000,2020).join("\n").trim());
reader=BibleReader(Fetch);
requests=[];
await Promise.all([reader.Passage(3),reader.Passage(4)]);
assert.equal(requests.length,2,"concurrent reads share the index and chunk");
console.log("God Tools: bit order, empty/overflow/reset, all Bible chunks, "+
  "20-line boundaries, book references, cache and failed-fetch recovery passed.");
