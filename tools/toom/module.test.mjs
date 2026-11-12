import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
const live=!!process.env.LIVE;
const game=resolve(root,'games/Toom'),out=resolve(process.env.OUT||'/tmp/toom-module'),
  read=n=>readFileSync(resolve(game,n),'latin1'),hash=b=>createHash('sha256').update(b).digest('hex'),
  names=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
    .map(m=>m[1].includes('.')?m[1]:m[1]+'.HC').concat(['TmOverlay.HC','TmScreen.HC','TmPlay.HC']),
  header=readFileSync(new URL('Module.HH',import.meta.url),'latin1'),
  fixture=live?'Toom;\n':readFileSync(new URL('Play.HC',import.meta.url),'latin1'),
  source=header+'\n'+names.map(n=>read(n).replaceAll('&SndTaskEndCB','&TmModuleSoundEnd')).join('\n')+'\n'+fixture+(live?'':"\nif (tm_play_cases!=18 || tm_play_hash!=3858873714 || tm_play_done!=1) throw('Count');\n"),
  sourceSha256=hash(Buffer.from(source,'latin1')),
  assets=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'TOOM.PRJ'),Buffer.from(source,'latin1'));
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const buildSource=`
U0 TmModuleBuild()
{
  I64 i,size;
  U8 *bytes,*encoded,*hex="0123456789ABCDEF";
  if (Cmp("C:/ORACLE/TOOM.PRJ",,"C:/ORACLE/TOOM.BIN")) throw('Compile');
  bytes=FileRead("C:/ORACLE/TOOM.BIN",&size);
  if (!bytes || size<=32) throw('Module');
  encoded=MAlloc(size*2+1);
  for (i=0;i<size;i++) {
    encoded[i*2]=hex[bytes[i]>>4]; encoded[i*2+1]=hex[bytes[i]&15];
  }
  encoded[size*2]=0;
  "MODULE %d %s\\n",size,encoded;
  Free(encoded); Free(bytes);
}
TmModuleBuild;
`;
const built=await QemuRun([Buffer.from(buildSource,'latin1')],{files:[{name:'TOOM.PRJ',bytes:Buffer.from(source,'latin1')}],timeout:180});
writeFileSync(resolve(out,'build.json'),JSON.stringify(built,null,2)+'\n');
assert.equal(built.results[0].except,'');assert.match(built.results[0].out,/Errs:0 Warns:0/);
const match=built.results[0].out.match(/MODULE (\d+) ([0-9A-F]+)\n/);assert(match);
const binary=Buffer.from(match[2],'hex');assert.equal(binary.length,Number(match[1]));
writeFileSync(resolve(out,'TOOM.BIN'),binary);
assert.equal(binary.readBigUInt64LE(24),BigInt(binary.length));
assert.equal(binary.readBigInt64LE(8),0x7FFFFFFFFFFFFFFFn,'The module has no fixed origin.');
assert.equal(binary.subarray(4,8).toString('ascii'),'TOSB');
const fileHashes=Object.fromEntries([...assets,{name:'TOOM.BIN',bytes:binary}].map(f=>[f.name,hash(f.bytes)]));
if(live) {
  const report={sourceSha256,headerSha256:hash(Buffer.from(header,'latin1')),fixtureSha256:hash(Buffer.from(fixture,'latin1')),
    sourceFiles:Object.fromEntries(names.map(n=>[n,hash(Buffer.from(read(n),'latin1'))])),
    includeOrder:names,loadSha256:hash(Buffer.from(read('Load.HC'),'latin1')),
    loaderSha256:hash(readFileSync(new URL('ModuleRun.HC',import.meta.url))),
    sourceRewrite:'Only &SndTaskEndCB becomes &TmModuleSoundEnd; the local wrapper calls the named native import.',
    fileHashes,bytes:binary.length,build:{backend:built.backend,evidence:built.evidence},
    scope:'Private native AOT package; original game plus local sound-end callback adapter, no test symbols.'};
  writeFileSync(resolve(out,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} else {
const loaded=await QemuRun([0,0x100000].map(pad=>Buffer.from(`
U8 *padding=MAlloc(${pad},Fs->code_heap);
CBinFile *module=Load("C:/ORACLE/TOOM.BIN");
if (!module) throw('Load');
"ADDRESS %X\\n",module;
Free(padding);
`,'latin1')).concat([readFileSync(new URL('ModuleOwn.HC',import.meta.url))]),{files:[...assets,{name:'TOOM.BIN',bytes:binary}],timeout:180});
writeFileSync(resolve(out,'native.json'),JSON.stringify(loaded,null,2)+'\n');
for(const result of loaded.results.slice(0,2)) {
  assert.equal(result.except,'');assert.doesNotMatch(result.out,/WARNING|Unresolved Reference/);
  assert.match(result.out,/PLAY 18 CASES HASH 3858873714 BAD 0/);
}
assert.equal(loaded.results[2].except,'');
assert.match(loaded.results[2].out,/MODULE OWNER 2 LOADS BAD 0/);
const addresses=loaded.results.slice(0,2).map(r=>r.out.match(/ADDRESS ([0-9A-F]+)/)?.[1]);
assert(addresses.every(Boolean));assert.notEqual(addresses[0],addresses[1],'Separate task heaps relocate the module.');
const report={sourceSha256,headerSha256:hash(Buffer.from(header,'latin1')),fixtureSha256:hash(Buffer.from(fixture,'latin1')),
  sourceFiles:Object.fromEntries(names.map(n=>[n,hash(Buffer.from(read(n),'latin1'))])),fileHashes,
  bytes:binary.length,origin:binary.readBigInt64LE(8).toString(),patchTable:binary.readBigUInt64LE(16).toString(),
  build:{backend:built.backend,evidence:built.evidence},native:loaded,addresses,
  scope:'Private AOT prototype with a local native sound-end callback adapter. Built by original TempleOS, transferred to a fresh original TempleOS session, loaded at two addresses into separate tasks. Not a distributed module or interactive host gate.'};
if(process.env.TEMPLEOS_WEB) {
  const web=resolve(process.env.TEMPLEOS_WEB),{GuestHarness}=await import(pathToFileURL(resolve(web,'tools/hemu/GuestHarness.mjs'))),
    h=await GuestHarness({disk:true});
  for(const file of [...assets,{name:'TOOM.BIN',bytes:binary}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({src:'Load("C:/ORACLE/TOOM.BIN");'});
  for(let i=0;i<8000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  const owner=h.gx.launch({src:readFileSync(new URL('ModuleOwn.HC',import.meta.url),'latin1')});
  for(let i=0;i<8000&&!['done','failed','error'].includes(h.gx.status(owner)?.state);i++)await h.Run();
  assert.equal(h.gx.status(owner)?.state,'done',JSON.stringify(h.gx.status(owner)));
  report.hemu={ownerLoads:2,web,wasmSha256:hash(readFileSync(resolve(web,'build/hemu.wasm'))),cases:18,bad:0};
}
writeFileSync(resolve(out,'result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

}
