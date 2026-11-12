import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {BrainMaps} from './BrainMaps.mjs';
import {OverlayReference} from './OverlayRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {rows,reference}=await OverlayReference(),values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const game=resolve(root,'games/Toom');
const source=ToomText(name=>name!=='TmOverlay')+'\n'+
  readFileSync(resolve(game,'TmOverlay.HC'),'latin1')+'\n'+readFileSync(resolve(root,'tools/toom/Overlay.HC'),'latin1');
const {bytes:wad}=await BrainMaps(),files=[{name:'FREEDOOM.WAD',bytes:wad},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))},{name:'OVERLAY.BIN',bytes:packed}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex'),
  assetHashes=Object.fromEntries(files.map(f=>[f.name,createHash('sha256').update(f.bytes).digest('hex')]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,reference},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`OVERLAY ${rows.length} CASES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_overlay_done!=1 || tm_overlay_cases!=${rows.length}) throw('Count');\n`;
  for(const file of [...files,{name:'OVERLAY.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/OVERLAY.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,reference,cases:rows.length,bad:0},null,2));
}
