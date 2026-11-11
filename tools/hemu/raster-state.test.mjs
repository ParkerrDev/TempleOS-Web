import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hemuFile} from '../../engine/compile.js';
import {Worker} from 'node:worker_threads';
import {GuestHarness} from './GuestHarness.mjs';
const fixture=JSON.parse(readFileSync(new URL('./raster-state.json',import.meta.url))),
  Expand=source=>source.replace(/#include "([^"]+)"/g,(_,name)=>Expand(hemuFile(name))),
  source=Expand(hemuFile('snapshot.HC')).replace(
    /U16\s+RasterRand\s*\(\s*U64\s+fsb\s*\)\s*\{[\s\S]*?\n\}/,
    body=>body.replace('RasterRand','RasterRandStep')+`
U16 RasterRand(U64 fsb)
{//Test-only boundary before the real draw reads its shared state.
  __host_budget;
  return RasterRandStep(fsb);
}`),
  gates=new Int32Array(new SharedArrayBuffer(16));
assert.ok(source.includes('RasterRandStep'),'the shared-state seam must be armed');
let armed=false,count=0,trigger=0;
const h=await GuestHarness({source,sharedMemory:true,budgetProbe(){
  if(armed&&++count===trigger) {
    Atomics.store(gates,0,1);Atomics.notify(gates,0);
    const until=performance.now()+5000;
    while(!Atomics.load(gates,1)&&performance.now()<until)Atomics.wait(gates,1,0,100);
    assert.equal(Atomics.load(gates,1),1,'shared writer must finish before the draw resumes');
  }
  return 12000000n;
},exports:['SpanProbe','RasterClock'],extraSource:`
U64 RasterClock() {return &tsc;}
I64 SpanProbe(U64 dc,U64 task)
{
  U64 old_fs=msr_fsbase;I64 res;
  msr_fsbase=task;
  res=SpanFill(dc,FALSE,0,7,0,40,1400);
  msr_fsbase=old_fs;
  return res;
}`}),{ex,gx,base,Name}=h;
await h.Exec('CDC *overlap_dc=DCNew(8,1);overlap_dc->depth_buf=MAlloc(32);U8 *overlap_task=CAlloc(0x1000);');
const dc=gx.rd64(Number(ex.GuestVar(Name('overlap_dc')))),task=gx.rd64(Number(ex.GuestVar(Name('overlap_task')))),
  M=(type,n)=>Number(ex.GuestMember(Name(type),Name(n,0x7100))),
  body=gx.rd64(dc+M('CDC','body')),depth=gx.rd64(dc+M('CDC','depth_buf')),
  seed=base+task+M('CTask','rand_seed'),flags=base+task+M('CTask','task_flags'),prob=base+dc+M('CDC','dither_probability_u16'),
  clock=Number(ex.RasterClock()),dv=new DataView(ex.memory.buffer),u8=new Uint8Array(ex.memory.buffer),
  writes=new BigUint64Array(new SharedArrayBuffer(16));
const worker=new Worker(`const {workerData}=require('node:worker_threads');
const gates=new Int32Array(workerData.gates),writes=new BigUint64Array(workerData.writes),dv=new DataView(workerData.mem);
while(true){while(Atomics.load(gates,0)===0)Atomics.wait(gates,0,0);if(Atomics.load(gates,0)<0)break;
dv.setBigUint64(Number(writes[0]),writes[1],true);Atomics.store(gates,0,0);Atomics.store(gates,1,1);Atomics.notify(gates,1);}`,{eval:true,workerData:{gates:gates.buffer,writes:writes.buffer,mem:ex.memory.buffer}});
let cases=0;const encode=x=>({count:Number(x.n),seed:x.seed.toString(16),pixels:[...x.pixels],depth:[...x.depth]});
try {
  for(const [kind,addr,value] of [['seed',seed,0xFEDCBA9876543210n],['flags',flags,1n<<14n],['probability',prob,65536n],['clock',clock,0xABCD0123456789n]])
    for(const at of [1,4,8,9]) {
      const results=[];
      for(const mutate of [false,true]) {
        u8.fill(7,base+body,base+body+8);new Int32Array(ex.memory.buffer,base+depth,8).fill(0x7FFFFFFF);
        dv.setUint32(base+dc+M('CDC','color'),0x8004000C,true);
        dv.setBigUint64(seed,0x123456789ABCDEF0n,true);dv.setBigUint64(flags,0n,true);
        dv.setBigUint64(prob,kind==='probability'?0n:25123n,true);dv.setBigUint64(clock,0x1234n,true);
        writes[0]=BigInt(addr);writes[1]=value;Atomics.store(gates,1,0);
        count=0;trigger=mutate?at:0;armed=true;
        const n=ex.SpanProbe(BigInt(dc),BigInt(task));armed=false;
        assert.equal(count,9,'native span consumes one initial draw plus eight subsequent draws');
        if(mutate)assert.equal(Atomics.load(gates,1),1,'the writer completed at the selected draw');
        results.push({n,seed:dv.getBigUint64(seed,true),pixels:u8.slice(base+body,base+body+8),depth:u8.slice(base+depth,base+depth+32)});
      }
      const expected=fixture.rows.find(row=>row.kind===kind&&row.draw===at);
      assert.ok(expected,kind+' fixture');
      assert.deepEqual(encode(results[0]),expected.plain,kind+' ordinary');
      assert.deepEqual(encode(results[1]),expected.changed,kind+' after shared mutation at '+at);
      if(kind!=='probability'||at<9)assert.notDeepEqual(results[1],results[0],kind+' mutation must affect rendering or RNG state');
      cases++;
    }
  console.log(`Shared raster: ${cases} deterministic real-worker state writes at selected RNG draws preserve pixels/depth/count/seed against the frozen pre-change fixture; no production callback added.`);
} finally {armed=false;await worker.terminate();}
