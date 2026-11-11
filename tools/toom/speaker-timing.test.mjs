import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {SpeakerRenderSource} from './SpeakerRenderSource.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the native oracle checkout.');
assert(process.env.CANDIDATE,'Set CANDIDATE to the private candidate source directory.');
const control=SpeakerRenderSource(true,{gameDir:resolve(root,'games/Toom'),yieldMs:0});
const candidate=SpeakerRenderSource(true,{gameDir:resolve(process.env.CANDIDATE),yieldMs:Number(process.env.YIELD_MS||2)});
const order=['control','candidate','candidate','control','control','candidate'];
const source={control:Buffer.from(control.source,'latin1'),candidate:Buffer.from(candidate.source,'latin1')};
const hash=b=>createHash('sha256').update(b).digest('hex');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const result=await QemuRun(order.map(n=>source[n]),{files:control.files,timeout:180});
const observations=result.results.map((r,i)=>{
  assert.equal(r.except,'');assert.doesNotMatch(r.out,/WARNING/);
  const m=/AUDIO RENDER (\d+) FRAMES (\d+) MS (\d+) SAMPLES (\d+) SKIPPED GAP (\d+) MS BAD 0/.exec(r.out);
  assert(m,r.out);const [frames,elapsed,samples,skipped,maxGap]=m.slice(1).map(Number);
  assert.equal(samples+skipped,420);assert.match(r.out,/HARDWARE GATE 0/);
  return {kind:order[i],frames,elapsed,samples,skipped,maxGap,msPerFrame:elapsed/frames};
});
console.log(JSON.stringify({...result,order,observations,sourceHashes:Object.fromEntries(Object.entries(source).map(([k,v])=>[k,hash(v)]))},null,2));
