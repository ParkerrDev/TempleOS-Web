import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=['TmGlbls.HH','TmWad.HC','TmSnd.HC'].map(read).join('\n')+'\n'+
  readFileSync(new URL('SpeakerHook.HC',import.meta.url),'latin1')+'\n'+
  read('TmSpeaker.HC').replace(/\bInU8\(/g,'TmSpeakerIn(').replace(/\bOutU8\(/g,'TmSpeakerOut(')+'\n'+
  readFileSync(new URL('Speaker.HC',import.meta.url),'latin1');
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{timeout:90});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/SPEAKER 1000 CLOCK POINTS PORTS MUTE BUSY PAUSE STOP BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_speaker_done!=1 || tm_speaker_cases!=1000) throw('Count');\n";
  const write=h.gx.writeFile({path:'C:/ORACLE/SPEAKER.HC',bytes:Buffer.from(check,'latin1')});
  for(let i=0;i<1000&&!['done','failed','error'].includes(h.gx.status(write)?.state);i++)await h.Run();
  assert.equal(h.gx.status(write)?.state,'done',JSON.stringify(h.gx.status(write)));
  const id=h.gx.launch({path:'C:/ORACLE/SPEAKER.HC'});
  for(let i=0;i<1000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,cases:1000,bad:0},null,2));
}
