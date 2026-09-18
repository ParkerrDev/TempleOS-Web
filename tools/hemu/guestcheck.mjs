// guestcheck.mjs: headless proof of the backend guest-execution API (guestexec.js + src/guestcall.HC).
// Boots the bundled TempleOS snapshot with the JIT on and, WITHOUT a single synthetic keystroke or
// TaskMsg, exercises: symbol probe, source execution in Adam, honest compile/runtime error reporting,
// guest mkdir + native FileWrite of a binary asset into a nested path (verified by reading it back
// through the OS's own FileRead), disk #include, a fullscreen game launch in a fresh task, and
// the busy refusal while the game runs.
//   node --max-old-space-size=3072 guestcheck.mjs            (GAME=::/Demo/Games/Talons  FRAMES=400)
// Exit code 0 = every check passed; a summary is printed at the end and a screenshot of the game is
// written to $OUT/guestcheck-game.png (OUT defaults to /tmp/hemu-games, like game-suite).
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import { createGuestExec } from "../../engine/guestexec.js";
import { readFileSync, writeFileSync, mkdirSync} from "node:fs";
import { deflateSync } from "node:zlib";
import { fat32Read } from "../../engine/qcow2.js";
import { FONT } from "../../holyc-wasm/src/runtime/font.js";
const OUT_DIR = process.env.OUT || "/tmp/hemu-games";

const PAL = [[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],[0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function dumpPng(p,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[idx[y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));}
const RAMSZ = 402653184;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin"), diskBuf = readFileSync(process.env.RAW || "/tmp/templeos.raw");
const r = compileHemu();
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, inst, lastFb = null; const ovl = new Map(); const badops = [];
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) badops.push(s.trim()); }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFb = { a, w, h, u8 }; } });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => -1n;      // NO keystrokes, ever
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
function popcnt8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
function screenText(){ if(!lastFb) return "(no frame)"; const {a,w,h,u8}=lastFb,cols=w>>3,rows=h>>3,lines=[]; for(let cy=0;cy<rows;cy++){let line="";for(let cx=0;cx<cols;cx++){const pat=new Uint8Array(8);const cm=new Map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=u8[a+(cy*8+y)*w+cx*8+x];cm.set(c,(cm.get(c)||0)+1);}const bg=[...cm.entries()].sort((p,q)=>q[1]-p[1])[0][0];for(let y=0;y<8;y++){let b=0;for(let x=0;x<8;x++)if(u8[a+(cy*8+y)*w+cx*8+x]!==bg)b|=1<<x;pat[y]=b;}let best=32,bs=1e9;for(let g=32;g<127;g++){let s=0;for(let y=0;y<8;y++)s+=popcnt8(pat[y]^FONT[g*8+y]);if(s<bs){bs=s;best=g;}}line+=bs<=12?String.fromCharCode(best):(pat.every(v=>!v)?" ":"?");}lines.push(line.trimEnd());}return lines.filter(l=>l).join("\n"); }
function fbStats() { if (!lastFb) return { nonbg: 0, hash: 0 }; const { a, w, h, u8 } = lastFb; let nz = 0, s = 0x811c9dc5; for (let i = 0; i < w * h; i += 3) { const v = u8[a + i]; if (v && v !== 1) nz++; s = ((s ^ v) * 16777619) >>> 0; } return { nonbg: 100 * nz / (w * h / 3), hash: s }; }

const t0 = performance.now();
const events = [];
let gx = null;
const say = (s) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
let frames = 0;
async function run(n) { for (let i = 0; i < n; i++) { inst.exports.__main(); frames++; if (gx) gx.tick(); await new Promise((r) => setImmediate(r)); } }
async function until(pred, maxFrames, step = 4) { for (let f = 0; f < maxFrames; f += step) { if (pred()) return true; await run(step); } return pred(); }
const waitState = (id, states, maxFrames) => until(() => { const s = gx.status(id); return s && states.includes(s.state); }, maxFrames);
const finalStates = ["done", "failed", "error"];

// ---- boot: let the desktop settle (no input) ----
await run(Number(process.env.BOOT || 300));
say(`booted ${frames} frames, icount ${(rd64(Number(r.globals.get("icount").addr) - gBase) / 1e6).toFixed(0)}M`);
const scr0 = screenText().split("\n");
say("screen (top 6 lines): " + JSON.stringify(scr0.slice(0, 6)));
say("screen (bottom 4 lines): " + JSON.stringify(scr0.slice(-4)));

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

// Ask the guest compiler for the field addresses independently of our metadata probe.
const DISPLAY_A = gx.scratch.base + 0xA20, DISPLAY_B = DISPLAY_A + 8;
const displayJob = gx.exec({id:"display-fields", src:`*(0x${DISPLAY_A.toString(16)})(U8**)=&winmgr.fps;*(0x${DISPLAY_B.toString(16)})(U8**)=&winmgr.updates;`, target:"adam"});
await waitState(displayJob, finalStates, 600);
const displayStats = gx.frameStats(), fpsAddr = gx.rd64(DISPLAY_A), updatesAddr = gx.rd64(DISPLAY_B);
check("FPS metadata matches the guest compiler's winmgr fields", gx.status(displayJob).state === "done" && displayStats?.fps > 0 && fpsAddr > 0 && updatesAddr > 0 && displayStats.fps === dv().getFloat64(gBase + fpsAddr, true) && displayStats.updates === gx.rd64(updatesAddr), JSON.stringify(displayStats));
await run(30);
check("FPS update sequence advances with guest rendering", gx.frameStats()?.updates > displayStats?.updates, JSON.stringify(gx.frameStats()));

// ---- T1: execute source in Adam (silent), observe the side effect in the scratch window ----
const PROBE_A = gx.scratch.base + 0xA00;
gx.wr64(PROBE_A, 0);
const t1 = gx.exec({ id: "t1", src: `*(0x${PROBE_A.toString(16)})(I64*)=0x1234;`, target: "adam", name: "poke" });
await waitState(t1, finalStates, 600);
check("T1 exec in Adam: job done and side effect visible", gx.status(t1).state === "done" && gx.rd64(PROBE_A) === 0x1234, JSON.stringify(gx.status(t1)));

// ---- T2: compile error is reported honestly (started but not finished, exception 'Compiler') ----
const t2 = gx.exec({ id: "t2", src: `I64 zz=;`, target: "adam", name: "bad-src" });
await waitState(t2, finalStates, 600);
{ const s = gx.status(t2); check("T2 compile error -> failed with exception 'Compiler'", s.state === "failed" && s.except === "Compiler", JSON.stringify(s)); }

// ---- T3: runtime exception is reported honestly ----
const t3 = gx.exec({ id: "t3", src: `throw('GxTest');`, target: "adam", name: "throw" });
await waitState(t3, finalStates, 600);
{ const s = gx.status(t3); check("T3 runtime throw -> failed with exception 'GxTest'", s.state === "failed" && s.except === "GxTest", JSON.stringify(s)); }

// ---- T4: nested mkdir + native FileWrite of a binary asset, verified through the OS's own FileRead ----
const N = 12345, asset = new Uint8Array(N); { let x = 0x9E3779B9; for (let i = 0; i < N; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; asset[i] = (x >>> 16) & 0xFF; } }
const t4 = gx.writeFile({ id: "t4", path: "C:/Home/GuestChk/Sub/asset.bin", bytes: asset });
await waitState(t4, finalStates, 1200);
say("t4: " + JSON.stringify(gx.status(t4)));
const RB = gx.scratch.base + 0x300000, PROBE_B = gx.scratch.base + 0xA08;
gx.wr64(PROBE_B, -1);
const t4b = gx.exec({ id: "t4b", src: `I64 sz_=0;U8 *b_=FileRead("C:/Home/GuestChk/Sub/asset.bin",&sz_);if(b_){MemCpy(0x${RB.toString(16)},b_,sz_);Free(b_);}*(0x${PROBE_B.toString(16)})(I64*)=sz_;`, target: "adam", name: "readback" });
await waitState(t4b, finalStates, 1200);
{ const sz = gx.rd64(PROBE_B); let same = sz === N; if (same) { const got = gx.rdBytes(RB, N); for (let i = 0; i < N; i++) if (got[i] !== asset[i]) { same = false; break; } }
  check("T4 mkdir + FileWrite(12345 b) into C:/Home/GuestChk/Sub, bit-exact FileRead readback", gx.status(t4).state === "done" && gx.status(t4b).state === "done" && same, `write=${gx.status(t4).state} readback size=${sz}`); }

// Verify persisted sectors independently of TempleOS's file cache.
const diskReader = {readInto(lba,count,dst,offset=0) {
  for(let i=0;i<count;i++) dst.set(ovl.get(lba+i) || diskBuf.subarray((lba+i)*512,(lba+i+1)*512),offset+i*512);
}};
const persisted = fat32Read(diskReader,"Home/GuestChk/Sub","asset.bin");
check("T4 disk sectors preserve the binary asset", !!persisted && persisted.length === asset.length && persisted.every((b,i)=>b===asset[i]), `overlay sectors=${ovl.size}`);

// Fresh tasks must report failures and release their launch slot for the next request.
for(const [id,src,exception] of [["compile-launch","I64 zz=;","Compiler"],["throw-launch","throw('GxThrow');","GxThrow"]]) {
  gx.launch({id,src}); await waitState(id,finalStates,600);
  const result=gx.status(id);
  check(id+" reports the guest error",result.state==="failed" && result.except===exception,JSON.stringify(result));
}
const shortLaunch=gx.launch({id:"short-launch",src:"1;"});
await waitState(shortLaunch,finalStates,600);
check("short launch finishes and releases its task",gx.status(shortLaunch).state==="done",JSON.stringify(gx.status(shortLaunch)));

// ---- T5: write a HolyC source file and #include it from disk (Adam) ----
const PROBE_C = gx.scratch.base + 0xA10; gx.wr64(PROBE_C, 0);
const t5 = gx.writeFile({ id: "t5", path: "C:/Home/GuestChk/Hello.HC", bytes: new TextEncoder().encode(`U0 GxHello(){*(0x${PROBE_C.toString(16)})(I64*)=777;}\nGxHello;\n`) });
await waitState(t5, finalStates, 1200);
const t5b = gx.include({ id: "t5b", path: "C:/Home/GuestChk/Hello.HC", target: "adam" });
await waitState(t5b, finalStates, 1200);
check("T5 FileWrite Hello.HC + disk #include runs it", gx.status(t5).state === "done" && gx.status(t5b).state === "done" && gx.rd64(PROBE_C) === 777, `${gx.status(t5).state}/${gx.status(t5b).state} probe=${gx.rd64(PROBE_C)}`);

// ---- T6: game launch in a fresh task (no keys); watch the framebuffer change ----
const GAME = process.env.GAME || "::/Demo/Games/Talons";
const before = fbStats(), focusBefore = gx.info().focus;
say(`focus before launch: ${JSON.stringify(focusBefore)}; screen nonbg=${before.nonbg.toFixed(1)}%`);
const TARGET = process.env.TARGET || "prompt";   // "focus" = sys_focus_task as-is (may be inside the Take Tour YorN), "prompt" = a terminal at its prompt
const t6 = gx.launch({ id: "t6", path: GAME, name: "game", target: TARGET, force: !!process.env.FORCE, focus: TARGET !== "focus" });
const running = await waitState(t6, ["running", "done", "failed", "error"], 900);
say("t6 after dispatch: " + JSON.stringify(gx.status(t6)));
// Games initialize for a while (Talons builds its terrain for ~2000 frames at 12M instr/frame), so wait for
// the screen to start animating: >= 5 distinct frames in the samples taken after the first change.
let changed = 0, lastHash = fbStats().hash, peakNonbg = 0, firstChangeAt = -1, samples = 0;
const MAXF = Number(process.env.FRAMES || 4000);
for (let f = 0; f < MAXF && changed < 8; f += 25) { await run(25); samples++; const s = fbStats(); if (s.hash !== lastHash) { changed++; if (firstChangeAt < 0) firstChangeAt = f; } lastHash = s.hash; if (s.nonbg > peakNonbg) peakNonbg = s.nonbg;
  if (process.env.DIAG && samples % 20 === 1) { const inf = gx.info(); say(`  diag f=${f}: focus=${JSON.stringify({ name: inf.focus.name, flags: inf.focus.flags.toString(16), atPrompt: inf.focus.atPrompt, idle: inf.focus.idle, busy: inf.focus.busy && inf.focus.busy.id })} status=${gx.status(t6).state} nonbg=${s.nonbg.toFixed(1)} top=${JSON.stringify(screenText().split("\n").slice(1, 3))}`); } }
const st6 = gx.status(t6);
say(`game: state=${st6.state} distinct-frame changes=${changed} in ${samples} samples (first change after ${firstChangeAt} frames), peak nonbg=${peakNonbg.toFixed(1)}%, badops=${badops.length}`);
try { if (lastFb) { mkdirSync(OUT_DIR, { recursive: true }); dumpPng(OUT_DIR + "/guestcheck-game.png", lastFb.u8.subarray(lastFb.a, lastFb.a + lastFb.w * lastFb.h), lastFb.w, lastFb.h); say("wrote " + OUT_DIR + "/guestcheck-game.png"); } } catch (e) { say("png: " + e.message); }
say("screen now (top 3 lines): " + JSON.stringify(screenText().split("\n").slice(0, 3)));
check("T6 game launch reaches 'running' and the screen animates", running && st6.state === "running" && changed >= 5, `state=${st6.state} changes=${changed}`);

// ---- T7: a second launch while the terminal is busy is refused honestly (no force) ----
const t7 = gx.launch({ id: "t7", path: GAME, name: "second" });
await waitState(t7, finalStates, 60);
{ const s = gx.status(t7); check("T7 launch while busy -> honest refusal", s.state === "error" && /busy|not at a command prompt/.test(s.msg), JSON.stringify(s)); }

// ---- summary ----
const inf = gx.info();
say(`calls=${inf.calls} steps=${inf.steps} jobs=${inf.jobs} frames=${frames} badops=${badops.length}` + (badops.length ? " " + badops.slice(0, 3).join(" / ") : ""));
const failed = results.filter((x) => !x.ok);
console.log(`\n=== guestcheck: ${results.length - failed.length}/${results.length} passed ===`);
for (const x of results) console.log(`  ${x.ok ? "ok  " : "FAIL"} ${x.name}`);
process.exit(failed.length ? 1 : 0);
