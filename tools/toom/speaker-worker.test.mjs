import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {SpeakerRenderSource} from './SpeakerRenderSource.mjs';

const web=resolve(process.env.TEMPLEOS_WEB||root),out=resolve(process.env.OUT||'/tmp/toom-audio-workers');
mkdirSync(out,{recursive:true});
const {HemuBoot,ReadyWait,FramesWait,TextRow}=await import(pathToFileURL(resolve(web,'tools/hemu/WorkerHost.mjs')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const runtimeNames=['engine/jit.js','engine/hemu-worker.js','engine/hemu-smp-worker.js','engine/guestexec.js',
  'tools/hemu/WorkerHost.mjs','tools/hemu/WorkerShim.mjs','hemu/live.bin.gz','hemu/live-smp.bin.gz',
  'vendor/images/templeos-hd.qcow2.gz'];
const runtimeHashes=Object.fromEntries(runtimeNames.map(n=>[n,hash(readFileSync(resolve(web,n)))]));
const cores=process.env.CORES?[Number(process.env.CORES)]:[1,4];
assert(cores.every(n=>n===1||n===4));
const render=process.env.RENDER!=='0',results=[];
const {source,files}=SpeakerRenderSource(render),bytes=Buffer.from(source,'latin1'),sourceSha256=hash(bytes);
for(const count of cores) {
  const smp=count===4?4:0,wasm=resolve(web,`build/hemu${smp?'-smp':''}.wasm`),wasmSha256=hash(readFileSync(wasm));
  const h=await HemuBoot({smp,busProtocol:smp?1:0,rate:60,keep_buf:true,keep:60,patches:false}),tones=[];
  h.workers[0].on('message',m=>{if(m.cmd==='snd')tones.push({t:performance.now(),f:m.f});});
  const Wait=(pred,ms=180000)=>h.msgs.find(pred)||h.Wait(pred,ms);
  const Result=id=>Wait(m=>m.cmd==='fileResult'&&m.id===id);
  function Stats() {
    const frame=h.last;if(!frame?.buf)return null;
    for(const [x,y] of [[0,0],[0,4],[4,0],[4,4]]) {
      const pixels=frame.buf.subarray(y*frame.w+x);
      const text=Array.from({length:Math.floor((frame.h-y)/8)},(_,row)=>TextRow(pixels,frame.w,row)).join('\n');
      const match=/TMAUDIO +(\d+) +(\d+) +(\d+) +(\d+) +(\d+) +(\d+)/.exec(text);
      if(match)return match.slice(1).map(Number);
    }
    return null;
  }
  try {
    const ready=await ReadyWait(h,30000);assert(ready.ok);
    if(smp)await Wait(m=>m.cmd==='smpReady');
    if(!ready.diskReady)await Wait(m=>m.cmd==='diskInfo'&&m.ok&&m.diskReady);
    h.Post({cmd:'osInstall',id:'install',files:[...files,{name:'AUDIO.HC',bytes}]
      .map(f=>({path:`C:/ORACLE/${f.name}`,bytes:f.bytes}))});
    assert((await Result('install')).ok);
    h.Post({cmd:'osLaunch',id:'audio',src:'ExeFile("C:/ORACLE/AUDIO.HC");',name:'TOOM sound delivery'});
    const launch=await Result('audio');assert(launch.ok,launch.msg);
    const done=await Wait(m=>m.cmd==='guestResult'&&m.id==='audio'&&['done','failed','error'].includes(m.state));
    assert.equal(done.state,'done',JSON.stringify(done));
    h.Post({cmd:'osLaunch',id:'stats',name:'Sound results',src:'SettingsPush;AutoComplete;WinBorder;WinMax;DocCursor;'+
      'I64 tm_audio_size=0,*tm_audio_stats=FileRead("C:/ORACLE/AUDIO.BIN",&tm_audio_size);'+
      'if (tm_audio_size!=48 || !tm_audio_stats) throw(\'Stats\');DocClear;'+
      '"TMAUDIO %d %d %d %d %d %d\\n",tm_audio_stats[0],tm_audio_stats[1],tm_audio_stats[2],tm_audio_stats[3],tm_audio_stats[4],tm_audio_stats[5];'+
      'Free(tm_audio_stats);tm_audio_stats=NULL;Refresh;Sleep(2000);SettingsPop;'});
    const statsLaunch=await Result('stats');assert(statsLaunch.ok,statsLaunch.msg);
    let stats;const end=performance.now()+10000;
    while(!(stats=Stats())&&performance.now()<end)await FramesWait(h,2,10000);
    assert(stats,'Native result line was not displayed');
    const [frames,elapsed,samples,skipped,maxGap,period]=stats;
    assert.equal(period,0);assert.equal(samples+skipped,420);assert.equal(frames>0,render);
    assert(tones.some(t=>t.f>0),'Native PIT writes reached the worker sound transport');
    assert.equal(tones.at(-1).f,0,'Speaker is silent after task teardown');
    assert(!h.msgs.some(m=>m.cmd==='error'));assert(!h.apMsgs.some(m=>m.cmd==='error'));
    assert.equal(hash(readFileSync(wasm)),wasmSha256);
    const result={cores:count,render,sourceSha256,wasmSha256,runtimeHashes,assetHashes:Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)])),frames,elapsed,samples,skipped,maxGap,tones,
      limitation:'snd carries frequency only; receipt times do not prove audible guest-time spacing.'};
    results.push(result);writeFileSync(resolve(out,`result-${count}-${render?'render':'idle'}.json`),JSON.stringify(result,null,2)+'\n');
  } catch(error) {
    if(h.last?.buf)writeFileSync(resolve(out,`failed-${count}.bin`),h.last.buf);
    console.error(h.msgs.filter(m=>['fileResult','guestResult','error'].includes(m.cmd)).slice(-15));throw error;
  } finally {await h.Stop();}
}
for(const name of runtimeNames)assert.equal(hash(readFileSync(resolve(web,name))),runtimeHashes[name],`${name} remained fixed`);
console.log(JSON.stringify(results.map(({tones,...r})=>({...r,toneEvents:tones.length})),null,2));
