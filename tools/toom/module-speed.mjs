import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadavg} from 'node:os';

assert(process.env.TEMPLEOS_WEB&&process.env.MODULE&&process.env.OUT);
const out=resolve(process.env.OUT),runs=[],load=[],start=performance.now(),cores=[1,4];
mkdirSync(out,{recursive:true});
function Sample() {
  const values=readFileSync('/proc/stat','utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  load.push({ms:performance.now()-start,load:loadavg(),cpu:values});
}
Sample();const timer=setInterval(Sample,1000);
try {
  for(const count of cores)for(let pair=0;pair<3;pair++)for(const source of pair%2?[false,true]:[true,false]) {
    const dir=resolve(out,`${count}-${pair}-${source?'source':'module'}`);mkdirSync(dir,{recursive:true});
    const env={...process.env,OUT:dir,CORES:String(count),COMPARE:'1',START_ONLY:'1'};
    if(source)env.SOURCE='1';else delete env.SOURCE;
    const log=openSync(resolve(dir,'stdout.log'),'w'),err=openSync(resolve(dir,'stderr.log'),'w'),began=performance.now();
    const child=spawn(process.execPath,[new URL('module-worker.test.mjs',import.meta.url).pathname],{env,stdio:['ignore',log,err]});
    let code;try {code=await new Promise((done,reject)=>{child.on('exit',done);child.on('error',reject);});}
    finally {closeSync(log);closeSync(err);}
    assert.equal(code,0,`${dir} completed`);
    const report=JSON.parse(readFileSync(resolve(dir,`startup-${count}.json`)));
    runs.push({pair,cores:count,source,startMs:began-start,endMs:performance.now()-start,dir,report});
    writeFileSync(resolve(out,'progress.json'),JSON.stringify({runs,load},null,2)+'\n');
    console.error(`${count} cores ${source?'source':'module'}: frame ${report.firstFrameMs.toFixed(0)} ms; shot ${report.firstShotFromLaunchMs.toFixed(0)} ms`);
  }
} finally {clearInterval(timer);Sample();writeFileSync(resolve(out,'progress.json'),JSON.stringify({runs,load},null,2)+'\n');}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)],summary=[];
for(const count of cores)for(const source of [true,false]) {
  const rows=runs.filter(r=>r.cores===count&&r.source===source).map(r=>r.report);
  summary.push({cores:count,source,firstFrameMs:median(rows.map(r=>r.firstFrameMs)),firstShotFromLaunchMs:median(rows.map(r=>r.firstShotFromLaunchMs))});
}
const result={summary,runs,load,scope:'Three reversed-order source/module pairs per core mode. Fresh frozen machine and identical installed source/binary/assets for each sample. No game instrumentation or test symbols in the module. Peer work held; host load sampled independently. This measures cold startup through a displayed shot, not sustained gameplay throughput.'};
writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
