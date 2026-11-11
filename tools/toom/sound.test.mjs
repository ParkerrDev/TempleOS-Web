import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {SoundReference} from './SoundRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {wad,expected,reference}=await SoundReference(),game=resolve(root,'games/Toom');
const hook=readFileSync(new URL('SoundHook.HC',import.meta.url),'latin1');
const source=['TmGlbls.HH','TmWad.HC'].map(n=>readFileSync(resolve(game,n),'latin1')).join('\n')+'\n'+hook+'\n'+
  readFileSync(resolve(game,'TmSnd.HC'),'latin1').replace(/\bWadRead\(/g,'TmSoundRead(')
    .replace(/\bMAlloc\(/g,'TmSoundAlloc(').replace(/\bCAlloc\(/g,'TmSoundCAlloc(')+'\n'+
  readFileSync(new URL('Sound.HC',import.meta.url),'latin1');
const files=[{name:'SOUNDS.WAD',bytes:wad},{name:'SOUND.BIN',bytes:expected}],hash=b=>createHash('sha256').update(b).digest('hex'),
  sourceSha256=hash(Buffer.from(source,'latin1')),assetHashes=Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,reference},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`SOUND ${reference.cases} LUMPS ${reference.samples} SAMPLES 8 FAULTS BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_sound_done!=1 || tm_sound_cases!=${reference.cases} || tm_sound_samples!=${reference.samples} || tm_sound_faults!=8) throw('Count');\n`;
  for(const file of [...files,{name:'SOUND.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<1000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/SOUND.HC'});
  for(let i=0;i<2000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,reference,cases:reference.cases,samples:reference.samples,faults:8,bad:0},null,2));
}
