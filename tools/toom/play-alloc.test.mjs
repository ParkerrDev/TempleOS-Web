import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const source=readFileSync(resolve(root,'tools/toom/LoadProbe.HC'),'latin1')+'\n#define MAlloc TmLoadAlloc\n#define CAlloc TmLoadCAlloc\n#define FOpen TmLoadOpen\n#define FClose TmLoadClose\n#define FileRead TmLoadRead\n#define FBlkRead TmLoadBlocks\n'+[...load.matchAll(/#include "([^"]+)"/g)]
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  ['TmOverlay.HC','TmScreen.HC','TmPlay.HC'].map(n=>readFileSync(resolve(game,n),'latin1')).join('\n')+'\n'+
  readFileSync(resolve(root,'tools/toom/PlayAlloc.HC'),'latin1');
const files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:240});
  const counts=result.results[0].out.match(/PLAY ALLOC (\d+) CASES (\d+) FAULTS BAD 0/);
  console.log(JSON.stringify({...result,sourceSha256,
    ...(counts?{cases:Number(counts[1]),faults:Number(counts[2])}:{})},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/PLAY ALLOC \d+ CASES \d+ FAULTS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_play_alloc_done!=1 || tm_play_alloc_cases!=tm_play_alloc_faults+1) throw('Count');\n";
  for(const file of [...files,{name:'PLAYALL.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<30000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/PLAYALL.HC'});
  const gx=h.gx,offset={task:gx.memberFind('CTask','hash_table'),
    body:gx.memberFind('CHashTable','body'),mask:gx.memberFind('CHashTable','mask'),
    str:gx.memberFind('CHash','str'),data:gx.memberFind('CHashGlblVar','data_addr')};
  assert(Object.values(offset).every(n=>n>=0));
  function Progress() {
    const status=gx.status(id);if(status?.state!=='running'||!status.task)return null;
    const table=gx.rd64(Number(status.task)+offset.task),body=gx.rd64(table+offset.body),mask=gx.rd64(table+offset.mask);
    if(!table||!body||mask>65535)return null;
    for(let n=0;n<=mask;n++) {
      let entry=gx.rd64(body+n*8);
      for(let guard=0;entry&&guard<4096;guard++) {
        const name=Buffer.from(gx.rdBytes(gx.rd64(entry+offset.str),32)).toString('latin1').split('\0')[0];
        if(name==='tm_play_alloc_faults')return gx.rd64(gx.rd64(entry+offset.data));
        entry=gx.rd64(entry);
      }
    }
    return null;
  }
  let progress=null;
  for(let i=0;i<30000&&!['done','failed','error'].includes(gx.status(id)?.state);i++) {
    await h.Run();
    if(i&&i%1000===0) {
      progress=Progress();
      console.error(`Frame recovery: ${progress ?? 'compiling'} faults completed, ${i} guest slices.`);
    }
  }
  assert.equal(gx.status(id)?.state,'done',JSON.stringify({...gx.status(id),completedFaults:progress}));
  await h.Exec('I64 play_size;U8 *play_bytes=FileRead("C:/ORACLE/PLAYALL.BIN",&play_size);');
  const ptr=h.gx.rd64(h.gx.varFind('play_bytes')),size=h.gx.rd64(h.gx.varFind('play_size'));
  assert(ptr);assert.equal(size,16);
  const bytes=Buffer.from(h.gx.rdBytes(ptr,size)),cases=Number(bytes.readBigInt64LE()),faults=Number(bytes.readBigInt64LE(8));
  await h.Exec('Free(play_bytes);');
  assert.equal(cases,faults+1);assert(faults>0);
  if(process.env.REFERENCE) {
    const ref=JSON.parse(readFileSync(process.env.REFERENCE));
    assert.equal(sourceSha256,ref.sourceSha256);assert.equal(cases,ref.cases);assert.equal(faults,ref.faults);
  }
  console.log(JSON.stringify({backend,sourceSha256,cases,faults,bad:0},null,2));
}
