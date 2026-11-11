import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {SoundBankReference} from './SoundBankRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {files,reference}=await SoundBankReference(),game=resolve(root,'games/Toom');
files.push({name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))});
const read=n=>readFileSync(resolve(game,n),'latin1');
const source=['TmGlbls.HH','TmWad.HC','TmData.HH','TmState.HC'].map(read).join('\n')+'\n'+
  readFileSync(new URL('SoundHook.HC',import.meta.url),'latin1')+'\n'+
  ['TmSnd.HC','TmSoundBank.HC'].map(n=>read(n).replace(/\bWadRead\(/g,'TmSoundRead(')
    .replace(/\bMAlloc\(/g,'TmSoundAlloc(').replace(/\bCAlloc\(/g,'TmSoundCAlloc(')).join('\n')+'\n'+
  readFileSync(new URL('SoundBank.HC',import.meta.url),'latin1');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  assetHashes=Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,reference},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/SOUND BANK 218 CASES 24 FAULTS LAZY NAMES HEAP BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the frozen checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_bank_done!=1 || tm_bank_cases!=218 || tm_bank_faults!=24) throw('Count');\n";
  for(const file of [...files,{name:'BANK.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/BANK.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,reference,cases:218,faults:24,bad:0},null,2));
}
