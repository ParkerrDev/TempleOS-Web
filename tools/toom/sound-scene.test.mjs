import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {SoundSceneReference} from './SoundSceneRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {files,reference}=await SoundSceneReference(),game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
  .filter(m=>!['TmSnd','TmSpeaker','TmSoundBank','TmSoundData.HH','TmAudio','TmSoundScene'].includes(m[1]))
  .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+read('TmSnd.HC')+'\n'+
  readFileSync(new URL('SpeakerHook.HC',import.meta.url),'latin1')+'\n'+
  read('TmSpeaker.HC').replace(/\bInU8\(/g,'TmSpeakerIn(').replace(/\bOutU8\(/g,'TmSpeakerOut(')+'\n'+
  ['TmSoundBank.HC','TmSoundData.HH','TmAudio.HC','TmSoundScene.HC'].map(read).join('\n')+'\n'+
  readFileSync(new URL('SoundScene.HC',import.meta.url),'latin1');
files.push({name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))});
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  assetHashes=Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,reference},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`SOUND SCENE ${reference.sectors} ORIGINS 39 CASES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the frozen checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_scene_done!=1 || tm_scene_origins!=${reference.sectors} || tm_scene_cases!=39) throw('Count');\n`;
  for(const file of [...files,{name:'SCENE.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/SCENE.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,reference,cases:39,bad:0},null,2));
}
