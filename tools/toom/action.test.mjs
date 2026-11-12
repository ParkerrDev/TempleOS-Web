import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {ActionReference,ActionBindings} from './ActionRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {rows,source:reference}=await ActionReference(),values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const game=resolve(root,'games/Toom');
const actions=readFileSync(resolve(game,'TmActions.HC'),'latin1'),split=actions.indexOf('U0 ActorAction(');assert(split>0);
const source=ToomText(name=>!['TmActions','TmLevel'].includes(name))+'\n'+actions.slice(0,split)+'\n'+
  readFileSync(resolve(root,'tools/toom/ActionProbe.HC'),'latin1')+'\n'+
  Object.entries(ActionBindings).map(([name,alias])=>`#define ${name} ${alias}`).join('\n')+'\n'+
  actions.slice(split)+'\n'+
  ['Rooms.HC','Action.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
const files=[{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))},{name:'ACTION.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,reference},null,2));assert.equal(result.results[0].except,'');
  assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`ACTION ${rows.length} ROUTES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  await h.Exec(source);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_action_done')),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_action_cases')),rows.length);
  console.log(JSON.stringify({backend,sourceSha256,cases:rows.length,bad:0,reference},null,2));
}
