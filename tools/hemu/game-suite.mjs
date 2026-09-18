// Smoke the actual catalog through the public backend API. Commands are never typed.
// Optional Enter/arrow input exercises game dialogs and gameplay after backend launch.
// node --max-old-space-size=3072 game-suite.mjs Talons
// node --max-old-space-size=3072 game-suite.mjs --all
// Runs against this site checkout (SITE overrides) and LIVE + RAW (default /tmp/live.bin, /tmp/templeos.raw). OUT sets report directory.
import {compileHemu,SITE_DIR} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import {createGuestExec} from "../../engine/guestexec.js";
import {fat32Read} from "../../engine/qcow2.js";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {deflateSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import assert from "node:assert/strict";
const site=SITE_DIR;
const catalog=JSON.parse(readFileSync(resolve(site,"games/catalog.json")));
const out=resolve(process.env.OUT||"/tmp/hemu-games");mkdirSync(out,{recursive:true});
const arg=process.argv[2]||"Talons";
if(arg==="--all") {
  const queue=[...catalog.packages],results=[],runChild=promisify(execFile);
  async function worker(){while(queue.length){const p=queue.shift();try{const r=await runChild(process.execPath,["--max-old-space-size=3072",fileURLToPath(import.meta.url),p.name],{timeout:900000,maxBuffer:1024*1024});console.log(JSON.stringify({name:p.name,ok:true}));results.push({name:p.name,ok:true});}catch(e){console.error(p.name,e.stderr||e.message);results.push({name:p.name,ok:false});}}}
  await Promise.all([worker(),worker()]);writeFileSync(resolve(out,"summary.json"),JSON.stringify(results,null,2));
  process.exit(results.every(r=>r.ok)?0:1);
}
const pkg=catalog.packages.find(p=>p.name===arg);assert.ok(pkg,"Unknown catalog game "+arg);
const PAL = [[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],[0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function dumpPng(p,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[idx[y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));}

const compiled=compileHemu();
const live=readFileSync(process.env.LIVE||"/tmp/live.bin"),disk=readFileSync(process.env.RAW||"/tmp/templeos.raw"),overlay=new Map(),badops=[];
let inst,gBase=0,gx,frame=null,frames=0,mouseButtons=0;
const keys=[],host=createHemuHost({onText:s=>{if(s.includes("BADOP"))badops.push(s);},snd:{tone(){}},
  snapLoad(base,u8){gBase=base;u8.set(live.subarray(0,402653184),base);},
  diskRead(lba,count,u8,dst){for(let i=0;i<count;i++)u8.set(overlay.get(lba+i)||disk.subarray((lba+i)*512,(lba+i+1)*512),dst+i*512);},
  diskWrite(lba,count,u8,src){for(let i=0;i<count;i++)overlay.set(lba+i,u8.slice(src+i*512,src+(i+1)*512));},
  palette(index,rgb){PAL[index]=[rgb>>>16&255,rgb>>>8&255,rgb&255];},
  present(a,w,h,u8){frame={a,w,h,u8};}
});
Object.assign(host.env,{__host_key:()=>keys.length?BigInt(keys.shift()):-1n,__host_msx:()=>320n,__host_msy:()=>240n,__host_msb:()=>BigInt(mouseButtons),__host_wheel:()=>0n,__host_budget:()=>12000000n,__host_dt:()=>16n,__host_time:()=>0n,
  __jit_state:(reg,fl,rip)=>{jit.jitState(reg,fl,rip,gBase,inst.exports.memory,inst.exports.RdMem,inst.exports.WrMem,inst.exports.RasterHLE);return 1n;},
  __jit_compile:r=>BigInt(jit.jitCompile(Number(r))),__jit_run:r=>BigInt(jit.jitRun(Number(r))),__jit_dispatch:b=>BigInt(jit.jitDispatch(Number(b))),
  __jit_x87:(...a)=>jit.jitX87(...a),__jit_chain:(...a)=>jit.jitChain(...a),__jit_seg:(...a)=>jit.jitSeg(...a.map(Number))});
jit.jitReset();inst=await WebAssembly.instantiate(await WebAssembly.compile(compiled.bytes),{env:host.env});host.attach(inst);inst.exports.__rt_init();
const start=performance.now(),events=[];
async function run(n){for(let i=0;i<n;i++){inst.exports.__main();gx?.tick();frames++;await new Promise(setImmediate);}}
async function wait(id,states,max=1800){for(let i=0;i<max;i++){const s=gx.status(id);if(states.includes(s?.state))return s;await run(1);}throw new Error("Request timed out: "+JSON.stringify(gx.status(id)));}
const hashFrame=()=>frame?createHash("sha256").update(frame.u8.subarray(frame.a,frame.a+frame.w*frame.h)).digest("hex"):null;
const reader={readInto(lba,count,dst,offset=0){for(let i=0;i<count;i++)dst.set(overlay.get(lba+i)||disk.subarray((lba+i)*512,(lba+i+1)*512),offset+i*512);}};
let failure=null,launch;
try {
  await run(300);gx=createGuestExec({inst,gBase,onEvent:e=>events.push(e)});assert.equal(gx.probe().ok,true);
  for(const f of pkg.files){
    const bytes=readFileSync(resolve(site,f.url));assert.equal(createHash("sha256").update(bytes).digest("hex"),f.sha256);
    const id=gx.writeFile({path:f.path,bytes});assert.equal((await wait(id,["done","failed","error"])).state,"done");
    const rel=f.path.slice(3),cut=rel.lastIndexOf("/"),saved=fat32Read(reader,rel.slice(0,cut),rel.slice(cut+1));
    assert.ok(saved && Buffer.from(saved).equals(bytes),"Persisted bytes differ: "+f.path);
  }
  launch=gx.launch({path:pkg.entry,name:pkg.name});await wait(launch,["running","done","failed","error"]);
  await run(Number(process.env.SETTLE||(pkg.name==="TOOM"?3000:700)));
  for(let i=0;i<(pkg.name==="TOOM"?3:1);i++){keys.push(0x1c);await run(10);keys.push(0x9c);await run(300);}
  await run(pkg.name==="TOOM"?600:50);
  const before=hashFrame();
  if(pkg.name==="TOOM") {
    keys.push(0x11);await run(60);keys.push(0x91);mouseButtons=1;await run(60);mouseButtons=0;await run(60);
    assert.notEqual(hashFrame(),before,"TOOM did not redraw during movement/fire");
    const task=gx.status(launch).task,probe=gx.scratch.base+0x1200;gx.wr64(probe,0);
    const q=gx.exec({target:"adam",src:`CHashGlblVar *stage_=HashFind("in_level",${task}(CTask*)->hash_table,HTT_GLBL_VAR);if(stage_)*(0x${probe.toString(16)})(I64*)=*stage_->data_addr;`});
    assert.equal((await wait(q,["done","failed","error"],600)).state,"done");
    assert.equal(gx.rd64(probe),1,"TOOM never entered its gameplay loop");
    const wad=fat32Read(reader,"Home/TOOM","freedoom1.wad");assert.equal(createHash("sha256").update(wad).digest("hex"),pkg.wad.sha256);
  }
  assert.ok(frame,"No framebuffer presented");assert.equal(badops.length,0);
  assert.ok(["running","done"].includes(gx.status(launch).state),JSON.stringify(gx.status(launch)));
} catch(e) {failure=e.stack;}
const report={name:pkg.name,ok:!failure,files:pkg.files.length,frames,seconds:(performance.now()-start)/1000,state:gx?.status(launch),badops,failure,events};
writeFileSync(resolve(out,pkg.name+".json"),JSON.stringify(report,null,2));
if(frame)dumpPng(resolve(out,pkg.name+".png"),frame.u8.subarray(frame.a,frame.a+frame.w*frame.h),frame.w,frame.h);
console.log(JSON.stringify({name:pkg.name,ok:report.ok,frames,seconds:report.seconds,state:report.state?.state}));
if(failure){console.error(failure);process.exitCode=1;}
