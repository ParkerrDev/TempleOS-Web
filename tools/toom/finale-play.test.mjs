import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,FreedoomRead} from './Assets.mjs';
import {ToomFile,ToomIncludes} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1'),
  hook="Bool tm_final_next_fail=FALSE;\nU8 *TmFinaleNextAlloc(I64 size)\n{\n  if (tm_final_next_fail) throw('NextFail');\n  return CAlloc(size);\n}\n",
  source=readFileSync(new URL('LoadProbe.HC',import.meta.url),'latin1')+'\n'+hook+
    '\n#define MAlloc TmLoadAlloc\n#define CAlloc TmLoadCAlloc\n#define FOpen TmLoadOpen\n#define FClose TmLoadClose\n#define FileRead TmLoadRead\n#define FBlkRead TmLoadBlocks\n'+
    ToomIncludes(read).map(ToomFile).map(n=>{
      const s=read(n);
      return n==='TmLevel.HC'?s.replace('tmpl=CAlloc(sizeof(Level))','tmpl=TmFinaleNextAlloc(sizeof(Level))'):s;
    }).join('\n')+'\n'+['TmOverlay.HC','TmScreen.HC','TmPlay.HC'].map(read).join('\n')+'\n'+
    readFileSync(new URL('FinalePlay.HC',import.meta.url),'latin1'),
  hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  files=[{name:'PHASE1.WAD',bytes:FreedoomRead()},
    {name:'PHASE2.WAD',bytes:readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'))},
    {name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}],
  assetHashes=Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]));
assert.equal(assetHashes['PHASE2.WAD'],'a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,assetHashes},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/FINALE PLAY 21 CASES BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true}),check=source+"\nif (!tm_final_play_done || tm_final_play_cases!=21) throw('Count');\n";
  for(const file of [...files,{name:'ENDPLAY.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+file.name,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/ENDPLAY.HC'});
  for(let i=0;i<16000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,cases:21,bad:0},null,2));
}
