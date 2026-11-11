import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SpeakerRenderSource} from './SpeakerRenderSource.mjs';

const render=process.env.RENDER!=='0';
const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {source,files}=SpeakerRenderSource(render);
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,render},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/AUDIO RENDER \d+ FRAMES \d+ MS \d+ SAMPLES \d+ SKIPPED GAP \d+ MS BAD 0/);
  assert.match(result.results[0].out,/HARDWARE GATE 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true,exports:['TmSpeakerGate'],extraSource:'\nI64 TmSpeakerGate(){return spk_on;}\n'});
  const check=source+"\nif (tm_audio_done!=1) throw('Count');\n";
  for(const file of [...files,{name:'AUDIO.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/AUDIO.HC'});
  for(let i=0;i<5000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  await h.Exec('I64 tm_audio_size=0;U8 *tm_audio_record=FileRead("C:/ORACLE/AUDIO.BIN",&tm_audio_size);');
  assert.equal(h.gx.rd64(h.gx.varFind('tm_audio_size')),48);
  const pointer=h.gx.rd64(h.gx.varFind('tm_audio_record'));
  assert(pointer);
  const bytes=Buffer.from(h.gx.rdBytes(pointer,48));
  const [frames,elapsed,samples,skipped,maxGap,period]=Array.from({length:6},(_,i)=>Number(bytes.readBigInt64LE(i*8)));
  await h.Exec('Free(tm_audio_record);tm_audio_record=NULL;');
  assert.equal(period,0);assert.equal(samples+skipped,420);assert.equal(frames>0,render);
  assert.equal(h.ex.TmSpeakerGate(),0n);
  console.log(JSON.stringify({backend,sourceSha256,render,frames,elapsed,samples,skipped,maxGap,hardwareGate:0,bad:0},null,2));
}
