import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {FreedoomRead,root} from './Assets.mjs';

const backend=process.argv[2]||'hemu',map=process.env.MAP||'E1M1',n=Number(process.env.N||30);
const dump=process.env.DUMP,dumpPose=Number(process.env.DUMP_POSE||2);
const maps=process.env.ALL?Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`):[map];
assert(maps.length===1||!dump&&!process.env.TRACE,'Use a single MAP with DUMP or TRACE.');
assert(Number.isInteger(dumpPose)&&dumpPose>=0&&dumpPose<8);
if(dump)mkdirSync(dump,{recursive:true});
assert(['hemu','qemu'].includes(backend),'Usage: time.mjs [hemu|qemu]');
assert(/^E[1-4]M[1-9]$/.test(map));assert(Number.isInteger(n)&&n>0&&n<=1000);
const gameDir=process.env.GAME_DIR||resolve(root,'games/Toom');
const load=readFileSync(resolve(gameDir,'Load.HC'),'latin1');
let source=[...load.matchAll(/#include "([^"]+)"/g)]
  .map(m=>readFileSync(resolve(gameDir,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+
  '\n'+readFileSync(new URL('./Bench.HC',import.meta.url),'latin1');
if(process.env.TRACE) {
  const columns=(process.env.TRACE_X||'117,122,282,287,292').split(',').map(Number);
  assert(columns.every(x=>Number.isInteger(x)&&x>=0&&x<320));
  source='I64 bench_trace[1024],bench_trace_cnt=0;Bool bench_trace_on=FALSE;\n'+source;
  const marker='  z=Min(100000000.0/d,I32_MAX);\n  if (tmpi) {';assert(source.includes(marker));
  source=source.replace(marker,`  if (bench_trace_on && (${columns.map(x=>`x==${x}`).join(' || ')})) {
    if (bench_trace_cnt+10>1024) throw('Trace');
    bench_trace[bench_trace_cnt++]=x;
    bench_trace[bench_trace_cnt++]=u(I64);
    bench_trace[bench_trace_cnt++]=d(I64);
    bench_trace[bench_trace_cnt++]=origin(I64);
    bench_trace[bench_trace_cnt++]=ya;
    bench_trace[bench_trace_cnt++]=yb;
    bench_trace[bench_trace_cnt++]=light;
    bench_trace[bench_trace_cnt++]=tmpv->angle(I64);
    bench_trace[bench_trace_cnt++]=tmpv->cs(I64);
    bench_trace[bench_trace_cnt++]=tmpv->sn(I64);
  }
${marker}`);
  source+=`
U0 BenchTrace()
{
  I64 i;
  bench_trace_cnt=0;bench_trace_on=TRUE;BenchDraw;bench_trace_on=FALSE;
  for (i=0;i<bench_trace_cnt;i++) "TRACE %d\\n",bench_trace[i];
}
`;
}
const files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))}];
const result={backend,frames:n,width:640,height:336,node:process.version,cpu:cpus()[0].model,
  sourceHash:createHash('sha256').update(source,'latin1').digest('hex'),
  assetHashes:Object.fromEntries(files.map(file=>[file.name,createHash('sha256').update(file.bytes).digest('hex')])),levels:[]};
const record=stats=>({hash:stats[0],read:stats[1],textures:stats[2],sprites:stats[3],actors:stats[4],masked:stats[5]});
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const driver=`
U0 BenchRun(U8 *map_name)
{
  I64 i;
  F64 start,elapsed;
  start=tS;
  BenchInit("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN",map_name);
  BenchDraw;
  elapsed=(tS-start)*1000;
  "COLD %s %.3f\\n",map_name,elapsed;
  for (i=0;i<8;i++) {
    BenchPose(i); BenchDraw;
    start=tS;
    BenchDraw(${n});
    elapsed=(tS-start)*1000/${n};
    BenchStats;
    "VIEW %s %d %.3f %d %d %d %d %d %d\\n",map_name,i,elapsed,bench_stats[0],
          bench_stats[1],bench_stats[2],bench_stats[3],bench_stats[4],bench_stats[5];
    ${dump?`if (i==${dumpPose}) BenchDump;`:''}
    ${process.env.TRACE?`if (i==${dumpPose}) BenchTrace;`:''}
  }
  BenchDel;
}
${maps.map(name=>`BenchRun("${name}");`).join('\n')}
`;
  const native=await QemuRun([Buffer.from(source+driver,'latin1')],{files,timeout:240});
  assert.equal(native.results[0].except,'',native.results[0].out);
  const out=native.results[0].out;
  assert(!out.includes('WARNING:'),out);
  for(const name of maps) {
    const level={map:name,coldMs:Number(out.match(new RegExp(`COLD ${name} ([0-9.]+)`))?.[1]),views:[]};
    for(const m of out.matchAll(new RegExp(`VIEW ${name} (\\d+) ([0-9.]+) (\\d+) (\\d+) (\\d+) (\\d+) (\\d+) (\\d+)`,'g')))
      level.views.push({pose:Number(m[1]),ms:Number(m[2]),...record(m.slice(3).map(Number))});
    result.levels.push(level);
  }
  result.native=native.backend;result.evidence=native.evidence;
  if(process.env.TRACE)result.trace=[...out.matchAll(/TRACE (-?\d+)/g)].map(m=>m[1]);
  if(dump)writeFileSync(resolve(dump,`${backend}-${map}-${dumpPose}.bin`),
    Buffer.from(out.match(/PIX ([0-9A-F]+)\n/)[1],'hex'));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  result.engineHash=createHash('sha256').update(h.compiled.bytes)
    .update(readFileSync(resolve(process.env.TEMPLEOS_WEB,'engine/jit.js'))).digest('hex');
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/TOOM/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const compileStart=performance.now();await h.Exec(source);
  result.compileMs=performance.now()-compileStart;
  const addr=h.gx.varFind('bench_stats');assert(addr);
  for(const name of maps) {
    const start=performance.now();
    await h.Exec(`BenchInit("C:/TOOM/FREEDOOM.WAD","C:/TOOM/TMDATA.BIN","${name}");BenchDraw;`);
    const level={map:name,coldMs:performance.now()-start,views:[]};
    for(let pose=0;pose<8;pose++) {
      await h.Exec(`BenchPose(${pose});BenchDraw;`);
      const start=performance.now();await h.Exec(`BenchDraw(${n});`);
      const ms=(performance.now()-start)/n;
      await h.Exec('BenchStats;');
      level.views.push({pose,ms,...record(Array.from({length:6},(_,i)=>h.gx.rd64(addr+i*8)))});
      if(dump&&pose===dumpPose) {
        const dc=h.gx.rd64(h.gx.varFind('bench_dc')),
          body=h.gx.rd64(dc+h.gx.memberFind('CDC','body'));
        writeFileSync(resolve(dump,`${backend}-${map}-${pose}.bin`),
          new Uint8Array(h.ex.memory.buffer,h.base+body,640*336));
      }
      if(process.env.TRACE&&pose===dumpPose) {
        await h.Exec('BenchTrace;');
        const ptr=h.gx.varFind('bench_trace'),cnt=h.gx.rd64(h.gx.varFind('bench_trace_cnt')),
          dv=new DataView(h.ex.memory.buffer);
        result.trace=Array.from({length:cnt},(_,i)=>String(dv.getBigInt64(h.base+ptr+i*8,true)));
      }
    }
    await h.Exec('BenchDel;');
    result.levels.push(level);
  }
}
for(const level of result.levels) {
  assert(Number.isFinite(level.coldMs));assert.equal(level.views.length,8);
  level.meanMs=level.views.reduce((sum,v)=>sum+v.ms,0)/level.views.length;
}
if(process.env.OUT)writeFileSync(process.env.OUT,JSON.stringify(result,null,2)+'\n');
if(process.env.REFERENCE) {
  const reference=JSON.parse(readFileSync(process.env.REFERENCE,'utf8'));
  const fields=r=>r.levels.map(level=>({map:level.map,views:level.views.map(({ms,...stats})=>stats)}));
  assert.equal(result.sourceHash,reference.sourceHash,'Benchmark sources differ.');
  assert.deepEqual(result.assetHashes,reference.assetHashes,'Assets differ.');
  assert.deepEqual(fields(result),fields(reference),'Native frame hashes and cache/read counts differ.');
}
console.log(JSON.stringify(result,null,2));
