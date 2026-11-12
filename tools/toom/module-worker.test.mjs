import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ModulePackage} from './ModulePackage.mjs';

assert(process.env.TEMPLEOS_WEB,'Set the frozen runtime path.');
const web=resolve(process.env.TEMPLEOS_WEB),out=resolve(process.env.OUT||'/tmp/toom-module-workers'),
  source=!!process.env.SOURCE,hash=b=>createHash('sha256').update(b).digest('hex'),
  {HemuBoot,ReadyWait,FramesWait,Sleep,TextRow}=await import(pathToFileURL(resolve(web,'tools/hemu/WorkerHost.mjs'))),
  packageFiles=ModulePackage(process.env.MODULE,process.env.COMPARE?true:source),
  moduleFiles=process.env.COMPARE?ModulePackage(process.env.MODULE):null,
  files=[...(moduleFiles?(packageFiles.set('Toom.BIN',moduleFiles.get('Toom.BIN')),
    source||packageFiles.set('Run.HC',moduleFiles.get('Run.HC')),packageFiles):packageFiles)].map(([name,bytes])=>({path:'C:/TOOM/'+name,bytes})),
  fileHashes=Object.fromEntries(files.map(f=>[f.path,hash(f.bytes)])),results=[],
  driverSha256=hash(readFileSync(new URL('module-worker.test.mjs',import.meta.url))),
  cores=process.env.CORES?[Number(process.env.CORES)]:[1,4],
  runtimeNames=['engine/jit.js','engine/hemu-worker.js','engine/hemu-smp-worker.js','engine/guestexec.js',
    'engine/guestinput.js','engine/KeyQueue.js','tools/hemu/WorkerHost.mjs','tools/hemu/WorkerShim.mjs',
    'hemu/live.bin.gz','hemu/live-smp.bin.gz','hemu/stock.json','hemu/stock.disk','hemu/stock-smp.disk',
    'engine/Stock.js','vendor/images/templeos-hd.qcow2.gz'],
  runtimeHashes=Object.fromEntries(runtimeNames.map(n=>[n,hash(readFileSync(resolve(web,n)))]));
assert(cores.every(n=>n===1||n===4));mkdirSync(out,{recursive:true});
for(const count of cores) {
  const smp=count===4?4:0,wasm=resolve(web,`build/hemu${smp?'-smp':''}.wasm`),wasmSha256=hash(readFileSync(wasm)),
    h=await HemuBoot({smp,busProtocol:smp?1:0,rate:60,keep_buf:true,keep:180,patches:false});
  const Wait=(pred,ms=60000)=>h.msgs.find(pred)||h.Wait(pred,ms),
    Result=id=>Wait(m=>m.cmd==='fileResult'&&m.id===id),
    Send=keys=>h.Post({cmd:'input',keys});
  async function Tap(code){Send([code]);await Sleep(40);Send([code|128]);}
  async function Done(id,src) {
    h.Post({cmd:'osExec',id,src,target:'adam'});
    const result=await Result(id);assert(result.ok,result.msg);
  }
  function Text(frame=h.last) {
    if(!frame?.buf)return '';
    return [[0,0],[0,4],[4,0],[4,4]].map(([x,y])=>Array.from({length:Math.floor((frame.h-y)/8)},
      (_,row)=>TextRow(frame.buf.subarray(y*frame.w+x),frame.w,row)).join('\n')).join('\n');
  }
  async function Screen(pattern,ms=60000) {
    const end=performance.now()+ms;
    while(performance.now()<end) {
      if(pattern.test(Text()))return h.last;
      const fault=h.msgs.find(m=>m.cmd==='error'||m.cmd==='guestResult'&&m.state==='failed');
      assert(!fault,JSON.stringify(fault));await FramesWait(h,2,10000);
    }
    assert.fail(`Screen did not show ${pattern}:\n${Text()}`);
  }
  const Region=frame=>hash(frame.buf.subarray(frame.w*64,frame.w*320));
  function Save(frame,name) {
    if(!frame?.buf)return;
    writeFileSync(resolve(out,`${name}-${count}.bin`),frame.buf);
    writeFileSync(resolve(out,`${name}-${count}.json`),JSON.stringify({width:frame.w,height:frame.h,palette:h.palette},null,2));
  }
  try {
    const ready=await ReadyWait(h,30000);assert(ready.ok);
    if(smp)await Wait(m=>m.cmd==='smpReady');
    if(!ready.diskReady)await Wait(m=>m.cmd==='diskInfo'&&m.ok&&m.diskReady);
    h.Post({cmd:'osInstall',id:'install',files});assert((await Result('install')).ok);
    const start=performance.now(),src='Cd("C:/Home");ExeFile("C:/TOOM/Run.HC");';
    h.Post({cmd:'osLaunch',id:'run',name:'Native module',src});assert((await Result('run')).ok);
    const running=await Wait(m=>m.cmd==='guestResult'&&m.id==='run'&&m.state==='running'),
      frame=await Screen(/ARROWS\/WASD MOVE/),firstFrameMs=performance.now()-start;
    assert.match(Text(frame),/HEALTH:100/);Save(frame,'initial');
    await Done('owner',`CTask *tm_mod_parent=${running.task},*tm_mod_child=tm_mod_parent->popup_task;
if (!TaskValidate(tm_mod_parent) || !TaskValidate(tm_mod_child) ||
    tm_mod_child==tm_mod_parent || !tm_mod_child->draw_it ||
    !TaskValidate(tm_mod_child->song_task)) throw('Owner');`);
    const soundStart=h.msgs.length,fireStart=performance.now();
    Send([0x1D]);let fired;
    try {fired=await Screen(/AMMO: *4[0-9]\/200/,60000);}finally{Send([0x9D]);}
    const firstShotMs=performance.now()-fireStart,firstShotFromLaunchMs=performance.now()-start;
    await FramesWait(h,3,10000);
    const sound=h.msgs.slice(soundStart).filter(m=>m.cmd==='snd');assert(sound.some(m=>m.f>0));
    Save(fired,'fired');
    if(process.env.START_ONLY) {
      await Tap(0x01);await Wait(m=>m.cmd==='guestResult'&&m.id==='run'&&m.state==='done');
      await Done('owner-gone',"if (TaskValidate(tm_mod_parent) || TaskValidate(tm_mod_child) || InU8(0x61)&3) throw('Cleanup');");
      const result={cores:count,source,web,wasmSha256,fileHashes,driverSha256,firstFrameMs,firstShotMs,
        firstShotFromLaunchMs,runtimeHashes,commonFileSet:!!process.env.COMPARE,sound,
        scope:'Uninstrumented package startup through first displayed native shot. Same popup owner and physical inputs for source/module; host-load and paired-order controls are owned by the comparison driver.'};
      results.push(result);writeFileSync(resolve(out,`startup-${count}.json`),JSON.stringify(result,null,2)+'\n');
      continue;
    }
    Send([0x19]);const paused=await Screen(/PAUSED/);await FramesWait(h,3,10000);
    const pausedRegion=Region(h.last);Send([0x19]);await Sleep(200);await FramesWait(h,3,10000);
    assert.match(Text(),/PAUSED/);assert.equal(Region(h.last),pausedRegion);
    await Done('silent-paused',"if (InU8(0x61)&3) throw('Sound');");
    Send([0x99]);await Sleep(40);await Tap(0x19);await Screen(/ARROWS\/WASD MOVE/);
    const before=Region(h.last),end=performance.now()+10000;Send([0xE0,0x48]);
    try {while(Region(h.last)===before&&performance.now()<end)await FramesWait(h,2,10000);}
    finally {Send([0xE0,0xC8]);}
    assert.notEqual(Region(h.last),before,'Physical held movement changes the world image.');Save(h.last,'moved');
    await Tap(0x01);await Wait(m=>m.cmd==='guestResult'&&m.id==='run'&&m.state==='done');
    await FramesWait(h,3,10000);assert.doesNotMatch(Text(),/HEALTH:100/);
    await Done('owner-gone',"if (TaskValidate(tm_mod_parent)) throw('Parent');if (TaskValidate(tm_mod_child)) throw('Child');if (InU8(0x61)&3) throw('Sound');");
    h.Post({cmd:'osLaunch',id:'again',name:'Native module again',src});assert((await Result('again')).ok);
    await Screen(/ARROWS\/WASD MOVE/);Send([0x2A,0x01]);await Sleep(40);Send([0x81,0xAA]);
    await Wait(m=>m.cmd==='guestResult'&&m.id==='again'&&m.state==='done');await FramesWait(h,3,10000);
    assert.doesNotMatch(Text(),/HEALTH:100/);await Done('silent-exit',"if (InU8(0x61)&3) throw('Sound');");
    assert(!h.msgs.some(m=>m.cmd==='error'));assert(!h.apMsgs.some(m=>m.cmd==='error'));
    assert.equal(hash(readFileSync(wasm)),wasmSha256);
    const result={cores:count,source,web,wasmSha256,fileHashes,driverSha256,firstFrameMs,firstShotMs,firstShotFromLaunchMs,runtimeHashes,commonFileSet:!!process.env.COMPARE,sound,
      initialHash:hash(frame.buf),pausedHash:hash(paused.buf),screen:Text(frame),
      scope:'Exact native prototype module, no test symbols. Real worker window, native popup owner, physical key codes and guest speaker events. Timings are uncontrolled-load observations, not accepted performance.'};
    results.push(result);writeFileSync(resolve(out,`worker-${count}.json`),JSON.stringify(result,null,2)+'\n');
  } catch(error) {Save(h.last,'failed');console.error(Text().split('\n').slice(0,60).join('\n'));console.error(h.msgs.filter(m=>['fileResult','guestResult','error'].includes(m.cmd)).slice(-15));throw error;}
  finally {await h.Stop();}
}
for(const name of runtimeNames)assert.equal(hash(readFileSync(resolve(web,name))),runtimeHashes[name]);
console.log(JSON.stringify({checks:results},null,2));
