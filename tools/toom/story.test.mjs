import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {StoryReference,storyKeys} from './StoryRef.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const reference=await StoryReference(),rows=[];
function word(n){const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(n));return b;}
function row(input,exception='',expected=null,missing=false){
  const wad=Buffer.alloc(28+input.length);wad.write('IWAD');wad.writeUInt32LE(1,4);
  wad.writeUInt32LE(12+input.length,8);input.copy(wad,12);
  wad.writeUInt32LE(12,12+input.length);wad.writeUInt32LE(input.length,16+input.length);
  wad.write(missing?'NOMETA':'DEHACKED',20+input.length);
  const ex=Buffer.alloc(8);ex.write(exception);
  const body=[ex,word(wad.length),wad];
  if(expected){body.push(...expected.pars.map(word));for(const s of expected.strings)body.push(word(s===null?-1:s.length),...(s===null?[]:[s]));}
  const bytes=Buffer.concat(body);rows.push(word(bytes.length),bytes);
}
for(const c of reference.cases)row(c.input,'',c);
row(Buffer.alloc(0),'',{pars:Array(68).fill(0),strings:Array(storyKeys.length).fill(null)},true);
const malformed=[['[PARS]\npar 0 1 30','Map'],['[PARS]\npar 5 1 30','Map'],
  ['[PARS]\npar 1 10 30','Map'],['[PARS]\npar 0 30','Map'],['[PARS]\npar 33 30','Map'],
  ['[PARS]\npar 1 -1','Number'],['[PARS]\npar 1 99999999999999999999999','Number'],
  ['[PARS]\npar 1 1 30 5','Par'],['[STRINGS]\nBGFLATE1 = NINEBYTES','Flat'],
  ['[STRINGS]\nE1TEXT = invalid\0tail','Text']];
for(const [text,except] of malformed)row(Buffer.from(text,'latin1'),except);
const bytes=Buffer.concat([word(rows.length/2),...rows]),count=rows.length/2,
  strings=reference.cases.reduce((n,c)=>n+c.strings.filter(s=>s!==null).length,0),
  game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=['TmGlbls.HH','TmWad.HC'].map(read).join('\n')+'\n'+
  readFileSync(new URL('StoryHook.HC',import.meta.url),'latin1')+'\n'+
  read('TmStory.HC').replace(/\bMAlloc\(/g,'TmStoryAlloc(').replace(/\bCAlloc\(/g,'TmStoryCAlloc(')
    .replace(/\bWadRead\(/g,'TmStoryRead(')+'\n'+readFileSync(new URL('Story.HC',import.meta.url),'latin1');
const sourceSha256=hash(Buffer.from(source,'latin1')),referenceSha256=hash(bytes),
  provenance={assets:reference.assets,referenceSourceSha256:reference.referenceSourceSha256,
    cases:count,strings,faults:4,malformed:malformed.length},files=[{name:'STORY.BIN',bytes}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256,referenceSha256,provenance},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`STORY ${count} CASES ${strings} STRINGS 4 FAULTS BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const f of [...files,{name:'STORY.HC',bytes:Buffer.from(source+"\nif (!tm_story_done) throw('Count');\n",'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+f.name,bytes:f.bytes});
    for(let i=0;i<2000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/STORY.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,referenceSha256,provenance,bad:0},null,2));
}
