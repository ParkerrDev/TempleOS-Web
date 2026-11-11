import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';

const web=resolve(process.env.TEMPLEOS_WEB||root);
const {HemuBoot,ReadyWait,FramesWait,Sleep,TextRow}=await import(pathToFileURL(resolve(web,'tools/hemu/WorkerHost.mjs')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const game=resolve(process.env.GAME_DIR||resolve(root,'games/Toom')),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const names=['Run.HC','Load.HC',...load.matchAll(/#include "([^"]+)"/g)]
  .map(n=>typeof n==='string'?n:n[1].includes('.')?n[1]:n[1]+'.HC')
  .concat(['TmOverlay.HC','TmScreen.HC','TmPlay.HC']);
const files=names.map(n=>({path:`C:/TOOM/${n}`,bytes:readFileSync(resolve(game,n))})).concat([
  {path:'C:/TOOM/FREEDOOM.WAD',bytes:FreedoomRead()},
  {path:'C:/TOOM/TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}]);
const probe=readFileSync(resolve(root,'tools/toom/Worker.HC'),'latin1')+'\n'+readFileSync(new URL('AudioWorker.HC',import.meta.url),'latin1');
const out=resolve(process.env.OUT||'/tmp/toom-workers');mkdirSync(out,{recursive:true});
const fileHashes=Object.fromEntries(files.map(f=>[f.path,hash(f.bytes)]));
const runtimeNames=['engine/jit.js','engine/hemu-worker.js','engine/hemu-smp-worker.js',
  'engine/guestexec.js','engine/guestinput.js','engine/KeyQueue.js',
  'tools/hemu/WorkerHost.mjs','tools/hemu/WorkerShim.mjs','hemu/live.bin.gz',
  'hemu/live-smp.bin.gz','hemu/stock.json','hemu/stock.disk','hemu/stock-smp.disk',
  'engine/Stock.js','vendor/images/templeos-hd.qcow2.gz'];
const runtimeHashes=Object.fromEntries(runtimeNames.map(n=>[n,hash(readFileSync(resolve(web,n)))]));
const results=[],cores=process.env.CORES?[Number(process.env.CORES)]:[1,4];
assert(cores.every(n=>n===1||n===4));
for(const count of cores) {
  const smp=count===4?4:0,wasm=resolve(web,`build/hemu${smp?'-smp':''}.wasm`),wasmSha256=hash(readFileSync(wasm));
  const h=await HemuBoot({smp,busProtocol:smp?1:0,rate:60,keep_buf:true,keep:180,patches:false});
  const Wait=(pred,ms=60000)=>h.msgs.find(pred)||h.Wait(pred,ms);
  const Result=id=>Wait(m=>m.cmd==='fileResult'&&m.id===id);
  async function Done(id,src) {
    h.Post({cmd:'osExec',id,src,target:'adam'});
    const result=await Result(id);assert(result.ok,result.msg);
    console.error(`${count} cores: ${id} passed`);
  }
  const SendKeys=keys=>h.Post({cmd:'input',keys});
  async function Tap(code) {SendKeys([code]);await Sleep(40);SendKeys([code|128]);}
  let offset=[0,0];
  function Text(frame=h.last,at=offset) {
    if(!frame?.buf)return '';
    const [x,y]=at,pixels=frame.buf.subarray(y*frame.w+x);
    return Array.from({length:Math.floor((frame.h-y)/8)},(_,row)=>TextRow(pixels,frame.w,row)).join('\n');
  }
  function SaveFrame(frame,name) {
    if(!frame?.buf)return;
    writeFileSync(resolve(out,`${name}-${count}.bin`),frame.buf);
    writeFileSync(resolve(out,`${name}-${count}.json`),JSON.stringify({width:frame.w,height:frame.h,palette:h.palette},null,2));
  }
  async function ScreenWait(pattern,ms=60000) {
    const end=performance.now()+ms;
    while(performance.now()<end) {
      for(const at of [[0,0],[0,4],[4,0],[4,4]])
        if(pattern.test(Text(h.last,at))) {offset=at;return h.last;}
      const fault=h.msgs.find(m=>m.cmd==='error'||m.cmd==='guestResult'&&m.state==='failed');
      assert(!fault,JSON.stringify(fault));
      await FramesWait(h,2,10000);
    }
    assert.fail(`Screen did not show ${pattern}:\n${Text()}`);
  }
  try {
    const ready=await ReadyWait(h,30000);assert(ready.ok);
    if(smp)await Wait(m=>m.cmd==='smpReady');
    if(!ready.diskReady)await Wait(m=>m.cmd==='diskInfo'&&m.ok&&m.diskReady);
    await Done('probe-vars',probe);
    h.Post({cmd:'osInstall',id:'install',files});
    const install=await Result('install');assert(install.ok,install.msg);
    const launchSource='Cd("C:/Home");ExeFile("C:/TOOM/Run.HC");';
    const launchStart=performance.now();
    h.Post({cmd:'osLaunch',id:'run',name:'Native TOOM',src:launchSource});
    const launch=await Result('run');assert(launch.ok,launch.msg);
    const running=await Wait(m=>m.cmd==='guestResult'&&m.id==='run'&&m.state==='running');
    assert.match(running.task,/^0x[0-9a-f]+$/i);
    await Done('probe-task',`tm_worker_task=${running.task};`);
    const initial=await ScreenWait(/ARROWS\/WASD MOVE/);
    assert.match(Text(initial),/HEALTH:100/);
    const firstFrameMs=performance.now()-launchStart;
    const initialText=Text(initial);SaveFrame(initial,'frame');
    await Done('audio-owner',"TmWorkerAudio;if (!tm_worker_snd_owner) throw('Sound');");
    const readyStart=performance.now();
    await Done('weapon-ready','TmWorkerWeaponReady;');
    const weaponReadyMs=performance.now()-readyStart;
    if(process.env.READY_ONLY) {
      const result={cores:count,wasmSha256,runtimeHashes,fileHashes,firstFrameMs,weaponReadyMs,
        probeSha256:hash(Buffer.from(probe,'latin1')),probe:h.last.probe};
      results.push(result);writeFileSync(resolve(out,`ready-${count}.json`),JSON.stringify(result,null,2));
      break;
    }
    const beforeSound=h.msgs.length;
    SendKeys([0x1D]);
    try {await Done('native-fire','TmWorkerFire;');}finally {SendKeys([0x9D]);}
    await FramesWait(h,3,10000);
    const soundMessages=h.msgs.slice(beforeSound).filter(m=>m.cmd==='snd');
    assert(soundMessages.some(m=>m.f>0),'Native DP firing reaches the worker speaker transport.');
    SendKeys([0x19]);
    const paused=await ScreenWait(/PAUSED/);
    await Done('pause-before',"TmWorkerProbe;if (!tm_worker_state) throw('Owner');tm_worker_old_tic=tm_worker_tic;");
    SendKeys([0x19]);await Sleep(200);await FramesWait(h,3,10000);
    await Done('pause-after',"TmWorkerProbe;if (tm_worker_tic!=tm_worker_old_tic) throw('Pause');");
    await Done('audio-paused',"TmWorkerAudio;if (!tm_worker_snd_paused || tm_worker_snd_period || tm_worker_snd_gate) throw('Sound');");
    SendKeys([0x99]);await Sleep(40);await Tap(0x19);
    await ScreenWait(/ARROWS\/WASD MOVE/);
    await Done('move-before',"TmWorkerProbe;tm_worker_old_x=tm_worker_x;tm_worker_old_y=tm_worker_y;");
    SendKeys([0xE0,0x48]);
    try {await Done('held-move','TmWorkerMove;');}
    finally {SendKeys([0xE0,0xC8]);}
    await FramesWait(h,3,10000);
    const moved=h.last;
    await Done('move-after',"TmWorkerProbe;if (!tm_worker_state || (tm_worker_x==tm_worker_old_x && tm_worker_y==tm_worker_old_y)) throw('Move');");
    assert.notEqual(hash(initial.buf.subarray(640*64,640*320)),hash(moved.buf.subarray(640*64,640*320)),
      'Held native movement changes the composed world view.');
    await Tap(0x01);
    await Wait(m=>m.cmd==='guestResult'&&m.id==='run'&&m.state==='done');
    await FramesWait(h,3,10000);
    await Done('exit-owner',"TmWorkerProbe;if (tm_worker_state) throw('Owner');");
    await Done('audio-stopped',"TmWorkerAudio;if (tm_worker_snd_gate) throw('Sound');");
    assert.doesNotMatch(Text(),/HEALTH:100/);
    h.Post({cmd:'osLaunch',id:'again',name:'Native TOOM Again',src:launchSource});
    assert((await Result('again')).ok);
    await ScreenWait(/ARROWS\/WASD MOVE/);
    SendKeys([0x2A,0x01]);await Sleep(40);SendKeys([0x81,0xAA]);
    await Wait(m=>m.cmd==='guestResult'&&m.id==='again'&&m.state==='done');
    await FramesWait(h,3,10000);
    assert.doesNotMatch(Text(),/HEALTH:100/);
    assert(!h.msgs.some(m=>m.cmd==='error'));
    assert(!h.apMsgs.some(m=>m.cmd==='error'));
    assert.equal(hash(readFileSync(wasm)),wasmSha256,'Worker binary remained fixed during the check.');
    results.push({cores:count,wasmSha256,runtimeHashes,fileHashes,probeSha256:hash(Buffer.from(probe,'latin1')),
      firstFrameMs,weaponReadyMs,soundMessages,frames:h.nframes,initialHash:hash(initial.buf),pausedHash:hash(paused.buf),movedHash:hash(moved.buf),
      screen:initialText});
    writeFileSync(resolve(out,`worker-${count}.json`),JSON.stringify(results.at(-1),null,2)+'\n');
  } catch(error) {
    console.error(h.msgs.filter(m=>['fileResult','guestResult','error'].includes(m.cmd)).slice(-16));
    SaveFrame(h.last,'failed');console.error(Text());throw error;
  } finally {await h.Stop();}
}
for(const name of runtimeNames)
  assert.equal(hash(readFileSync(resolve(web,name))),runtimeHashes[name],`${name} stayed fixed.`);
for(const name of names)
  assert.equal(hash(readFileSync(resolve(game,name))),fileHashes[`C:/TOOM/${name}`],`${name} stayed fixed.`);
console.log(JSON.stringify({checks:results},null,2));
