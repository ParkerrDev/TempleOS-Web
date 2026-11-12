import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHemuHost} from "../../engine/host.js";

const r=compileHemu({exports:["IoOut","TimeAdd","SoundClock"],extraSource:`
U0 SoundClock(U64 ns)
{
  tsc=ns;
}
`});
assert.deepEqual(r.warnings,[]);
const module=new WebAssembly.Module(r.bytes),events=[],host=createHemuHost({snd:{tone:(hz,ns)=>events.push([hz,ns])}}),
  inst=new WebAssembly.Instance(module,{env:host.env}),ex=inst.exports;
host.attach(inst);ex.__rt_init();
const origin=0x8000000000000001n;
ex.SoundClock(origin);
ex.IoOut(0x43n,0xB6n);ex.IoOut(0x42n,0xA9n);ex.IoOut(0x42n,4n);
ex.IoOut(0x61n,3n);ex.TimeAdd(7142857n);ex.IoOut(0x61n,0n);
ex.TimeAdd(7142857n);ex.IoOut(0x61n,3n);
assert.deepEqual(events,[[0,origin],[1193182/1193,origin],[0,origin+7142857n],[1193182/1193,origin+14285714n]]);
assert.equal(BigInt.asUintN(64,ex.TscRead()),origin+14285714n,"timestamp observation never changes guest time");
const frequencies=[];host.state.snd={tone:hz=>frequencies.push(hz)};
ex.IoOut(0x61n,0n);assert.deepEqual(frequencies,[0],"existing frequency-only callbacks remain valid");

const legacy=compileHolyC('__snd(440.0);',{filename:"LegacySound.HC",lenient:false}),old=[];
assert.deepEqual(legacy.warnings,[]);
const compat=createHemuHost({snd:{tone:(...args)=>old.push(args)}}),
  oldInst=new WebAssembly.Instance(new WebAssembly.Module(legacy.bytes),{env:compat.env});
compat.attach(oldInst);oldInst.exports.__rt_init();oldInst.exports.__main();
assert.deepEqual(old,[[440]],"legacy modules never receive fabricated timestamps");
const missing=compat,before=missing.state.heapPtr;delete missing.env.__host_snd;
assert.throws(()=>new WebAssembly.Instance(module,{env:missing.env}),WebAssembly.LinkError);
assert.equal(missing.state.heapPtr,before,"an old host refuses the new required import before execution");
console.log("Speaker timestamps: exact unsigned nanoseconds, ordered gate events/silent spans, legacy callbacks/modules and missing-import refusal.");
