// Live HolyCraft input regression: node --max-old-space-size=3072 input-check.mjs
// Requires /tmp/live.bin and /tmp/templeos.raw, as described in README.md.
import { compileHemu, SITE_DIR } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import assert from "node:assert/strict";
import {createGuestInput} from "../../engine/guestinput.js";
import { createGuestExec } from "../../engine/guestexec.js";
import { readFileSync } from "node:fs";

const RAMSZ = 402653184;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin"), diskBuf = readFileSync(process.env.RAW || "/tmp/templeos.raw");
const r = compileHemu();
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, inst; const ovl = new Map(); const badops = [];
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) badops.push(s.trim()); }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
let input=null; const keys=[];
host.env.__host_msx=()=>input?.x()??320n;host.env.__host_msy=()=>input?.y()??240n;host.env.__host_msb=()=>input?.buttons()??0n;host.env.__host_wheel=()=>0n;
host.env.__host_key = () => keys.length?BigInt(keys.shift()):-1n;
host.env.__host_budget = () => 12000000n; host.env.__host_dt = () => 16n; host.env.__host_time = () => 0n;
if (!process.env.NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rd64 = (a) => Number(dv().getBigUint64(gBase + a, true));
const t0 = performance.now();
const events = [];
let gx = null;
const say = (s) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
let frames = 0;
async function run(n) { for (let i = 0; i < n; i++) { input?.beforeFrame();inst.exports.__main();input?.afterFrame(); frames++; if (gx) gx.tick(); await new Promise((r) => setImmediate(r)); } }
async function until(pred, maxFrames, step = 4) { for (let f = 0; f < maxFrames; f += step) { if (pred()) return true; await run(step); } return pred(); }
const waitState = (id, states, maxFrames) => until(() => { const s = gx.status(id); return s && states.includes(s.state); }, maxFrames);
const finalStates = ["done", "failed", "error"];

// ---- boot: let the desktop settle (no input) ----
await run(Number(process.env.BOOT || 300));
say(`booted ${frames} frames, icount ${(rd64(Number(r.globals.get("icount").addr) - gBase) / 1e6).toFixed(0)}M`);
// ---- probe ----
gx = createGuestExec({ inst, gBase, log: (s) => say("  gx: " + s), onEvent: (ev) => { events.push(ev); say(`  ev #${ev.id} ${ev.op} ${ev.state}${ev.msg ? " | " + ev.msg : ""}`); } });
const probe = gx.probe();
say("probe: " + JSON.stringify({ ok: probe.ok, errors: probe.errors, warnings: probe.warnings, symbolCount: probe.symbolCount, syms: Object.fromEntries(Object.entries(probe.syms).map(([k, v]) => [k, "0x" + v.toString(16)])), vars: Object.fromEntries(Object.entries(probe.vars).map(([k, v]) => [k, "0x" + v.toString(16)])), scratch: probe.scratch }));
say("offsets: " + JSON.stringify(probe.offsets));
say("tasks: " + JSON.stringify(probe.tasks));
check("probe resolves and validates TaskExe/JobResScan/PopUp/adam_task/sys_focus_task", probe.ok, probe.errors.join("; "));
if (!probe.ok) { console.log(JSON.stringify(results)); process.exit(1); }
const info0 = gx.info();
say("focus: " + JSON.stringify(info0.focus) + " adam: " + JSON.stringify({ name: info0.adam.name, idle: info0.adam.idle, awaitingMsg: info0.adam.awaitingMsg, jobsWaiting: info0.adam.jobsWaiting }));


input=createGuestInput({guest:()=>gx,memory:()=>inst.exports.memory,base:()=>gBase});
say('Input layout: '+JSON.stringify(gx.inputState()));
assert(gx.inputState()?.down,'Input class metadata resolves');
const source='#define TOS_NATIVE 1\n'+readFileSync(SITE_DIR + '/games/HolyCraft.HC', 'latin1');
const launch=gx.launch({src:source,name:'HolyCraft'});
await waitState(launch,['running','failed','error'],800);
assert.equal(gx.status(launch).state,'running');
await run(240);
const task=Number.parseInt(gx.status(launch).task,16), slot=gx.scratch.base+0xb00;
const names=['g_pitch','g_yaw','g_px','g_pz','BrowserMouseCapture'];
const query=names.map((name,i)=>`*(${slot+i*8})(I64*)=HashFind("${name}",${task}(CTask*)->hash_table,HTT_GLBL_VAR)(CHashGlblVar*)->data_addr;`).join('');
const request=gx.exec({src:query,target:'adam'});await waitState(request,finalStates,600);
assert.equal(gx.status(request).state,'done');
const addresses=names.map((_,i)=>gx.rd64(slot+i*8));assert(addresses.every(Boolean));
const camera=()=>addresses.slice(0,4).map(a=>dv().getFloat64(gBase+a,true));
input.accept({x:320,y:240,b:0,held:[],relative:true,reset:true});
await run(50);const still=camera();await run(90);assert.deepEqual(camera(),still,'Idle camera and horizontal position stay still');
assert(Math.abs(still[0]+0.06)<1e-8,'Spawn preserves the initial pitch');assert(gx.inputState().capture,'Foreground game asks for capture');
input.accept({b:0,held:[],relative:true,dx:30,dy:15});await run(20);const turned=camera();
assert(turned[0]<still[0] && turned[1]>still[1],'Relative motion turns both axes');
await run(90);assert.deepEqual(camera(),turned,'One mouse event does not continue steering');
input.accept({b:0,held:[0x20],relative:true});keys.push(0x20);await run(20);
const moved=camera();assert(moved[2]!==turned[2] || moved[3]!==turned[3],'Held D moves');
input.accept({b:0,held:[],relative:true});keys.push(0xa0);await run(20);const released=camera();
await run(90);assert.deepEqual(camera(),released,'Release stops movement');
for(let i=0;i<100;i++)keys.push(0x25,0xa5);
let maxQueued=0;
for(let i=0;i<120;i++) {const pending=keys.length;await run(1);assert(pending-keys.length<=64,'At most one hardware FIFO is drained per frame');const view=dv();const queued=Number(view.getBigInt64(Number(r.globals.get('kbd_qt').addr),true)-view.getBigInt64(Number(r.globals.get('kbd_qh').addr),true));maxQueued=Math.max(maxQueued,queued);assert(queued<=64);}
assert.equal(keys.length,0);await run(30);const drained=camera();await run(90);assert.deepEqual(camera(),drained,'Key burst does not leave K held');
assert.equal(gx.rd8(gx.inputState().down+(0x25>>3))&(1<<(0x25&7)),0);assert.equal(badops.length,0);
console.log('PASS HolyCraft: neutral spawn, stable idle, relative look, capture hint, held movement, release and 200-event FIFO burst. Max queued: '+maxQueued);
