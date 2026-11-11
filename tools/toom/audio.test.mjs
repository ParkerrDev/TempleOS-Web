import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {AudioReference} from './AudioRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {expected,reference}=await AudioReference(),game=resolve(root,'games/Toom');
const source=['TmGlbls.HH','TmWad.HC','TmData.HH','TmState.HC','TmSnd.HC','TmSpeaker.HC','TmSoundBank.HC','TmSoundData.HH','TmAudio.HC']
  .map(n=>readFileSync(resolve(game,n),'latin1')).join('\n')+'\n'+readFileSync(new URL('Audio.HC',import.meta.url),'latin1');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),expectedSha256=hash(expected);
const pattern=new RegExp(`AUDIO ${reference.channelCases} CHANNEL CASES ${reference.distanceCases} DISTANCE CASES BAD 0`);
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files:[{name:'AUDIO.BIN',bytes:expected}],timeout:90});
  console.log(JSON.stringify({...result,sourceSha256,expectedSha256,reference},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);assert.match(result.results[0].out,pattern);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the frozen checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_audio_select_done!=1 || tm_audio_channels!=${reference.channelCases} || tm_audio_distances!=${reference.distanceCases}) throw('Count');\n`;
  for(const file of [{name:'AUDIO.BIN',bytes:expected},{name:'AUDIO.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<2000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/AUDIO.HC'});
  for(let i=0;i<2000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,expectedSha256,reference,bad:0},null,2));
}
