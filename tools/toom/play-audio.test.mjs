import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {ToomFile,ToomIncludes} from './Package.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
const game=resolve(process.env.GAME_DIR||resolve(root,'games/Toom'));
const read=name=>readFileSync(resolve(game,name),'latin1');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=ToomIncludes(read).map(ToomFile);
const allocHook="I64 tm_audio_allocs=0,tm_audio_alloc_fail=0;\nU8 *TmAudioAlloc(I64 size)\n{\n  if (++tm_audio_allocs==tm_audio_alloc_fail) throw('SndAlloc');\n  return CAlloc(size);\n}\n";
const spawnHook="CTask *TmAudioSpawn(U0 (*)(U8 *),U8 *,U8 *,I64 cpu=-1,CTask *parent=NULL)\n{\n  no_warn cpu; no_warn parent;\n  throw('SndSpawn');\n  return NULL;\n}\n";
const cases=[
  {name:'Window',expected:'AUDIO WINDOW 3 RUNS FIRE FOCUS PAUSE EXIT FAULT RESTORE BAD 0'},
  {name:'Create',expected:'AUDIO PLAY CREATE 2 FAULTS HEAP BAD 0'},
  {name:'Spawn',expected:'AUDIO SPAWN FAULT PRIOR TONE RESTORED BAD 0'}
];
const sources=cases.map(({name})=>{
  const body=names.map(file=>{
    let src=read(file);
    if(name==='Create'&&['TmAudio.HC','TmSoundBank.HC'].includes(file))src=src.replace(/\bCAlloc\(/g,'TmAudioAlloc(');
    return src;
  }).join('\n');
  const host=['TmOverlay.HC','TmScreen.HC','TmPlay.HC'].map(file=>{
    const src=read(file);return name==='Spawn'&&file==='TmPlay.HC'?src.replace(/\bSpawn\(/g,'TmAudioSpawn('):src;
  }).join('\n');
  return Buffer.from((name==='Create'?allocHook:'')+body+'\n'+(name==='Spawn'?spawnHook:'')+host+'\n'+
    readFileSync(new URL(`PlayAudio${name}.HC`,import.meta.url),'latin1'),'latin1');
});
const files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const result=await QemuRun(sources,{files,timeout:180});
console.log(JSON.stringify({...result,cases:cases.map((c,i)=>({...c,sourceSha256:hash(sources[i])})),
  files:Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]))},null,2));
assert.equal(result.results.length,cases.length);
for(const [i,res] of result.results.entries()) {
  assert.equal(res.except,'');assert.doesNotMatch(res.out,/WARNING/);
  assert(res.out.includes(cases[i].expected),`${cases[i].name}: ${res.out}`);
}
