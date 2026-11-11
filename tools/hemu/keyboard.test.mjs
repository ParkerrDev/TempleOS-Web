import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import {KeyQueue} from "../../engine/KeyQueue.js";

const c=compileHemu({exports:["TimeRst","KbdRst","InjectKey","TimeAdd","IoOut","IoIn","KeyRead","KeyClock"],
  extraSource:`I64 KeyRead() {if (kbd_qh==kbd_qt) return -1;return IoIn(0x60);}
U64 KeyClock() {return tsc;}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.TimeRst();ex.KbdRst();
const Send=bytes=>bytes.forEach(v=>ex.InjectKey(BigInt(v))),
      Drain=()=>{const out=[];let v;while ((v=ex.KeyRead())>=0n) out.push(Number(v));return out;};
Send([0x1E]);
ex.TimeAdd(1000000000n);
assert.deepEqual(Drain(),[0x1E],"repeat is off by default");
ex.KbdRptSet(1n);
ex.TimeAdd(249000000n);
assert.deepEqual(Drain(),[]);
ex.TimeAdd(1000000n);
assert.deepEqual(Drain(),[0x1E],"stock typematic delay is 250 ms");
ex.TimeAdd(1000000000n);
assert.equal(Drain().length,30,"stock typematic rate is 30 makes per second");
Send([0xE0,0x4D,0x9E]);
Drain();
ex.TimeAdd(250000000n);
assert.deepEqual(Drain(),[0xE0,0x4D],"last key repeats with its E0 prefix");
Send([0xE0,0xCD]);Drain();
ex.TimeAdd(1000000000n);
assert.deepEqual(Drain(),[],"its break cancels repeat");
ex.IoOut(0x60n,0xF3n);ex.IoOut(0x60n,0x7Fn);
assert.equal(ex.IoIn(0x60n),0xFAn);assert.equal(ex.IoIn(0x60n),0xFAn);
Send([0x30]);Drain();
ex.TimeAdd(999000000n);assert.deepEqual(Drain(),[]);
ex.TimeAdd(1000000n);assert.deepEqual(Drain(),[0x30]);
ex.TimeAdd(500000000n);assert.deepEqual(Drain(),[0x30],"guest programs 1 s delay and 2 Hz repeat");
const t=ex.KeyClock();Send([0x12349E]);
assert.equal(ex.KeyClock(),t,"input never advances the TSC");
ex.KbdRptSet(0n);Drain();ex.TimeAdd(1000000000n);assert.deepEqual(Drain(),[]);

const q=KeyQueue();q.Push([0x1D,0xE0,0x1D,0xE0,0x4D]);q.Release();
let bytes=[],v;while ((v=q.Read())>=0n) bytes.push(Number(v));
assert.deepEqual(bytes,[0x1D,0xE0,0x1D,0xE0,0x4D,0x9D,0xE0,0x9D,0xE0,0xCD]);
q.Release();assert.equal(q.Read(),-1n,"release-all is idempotent");
console.log("Keyboard: guest typematic command/rate, make/break and E0, latest held key, off/default, release-all, unchanged clock.");
