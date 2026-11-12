import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {EXTRA_GAMES,TERRY_DEMOS} from '../game-library.js';
const expected=TERRY_DEMOS.length+1+EXTRA_GAMES.length;
const root=new URL('../',import.meta.url);
const c=JSON.parse(await readFile(new URL('games/catalog.json',root)));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(c.packages.length,expected);assert.equal(new Set(c.packages.map(p=>p.id)).size,expected);
let count=0;
for(const p of c.packages){
 assert(p.files.some(f=>f.path===p.entry),p.name+' missing entry');
 const names=new Set();
 for(const f of p.files){
  assert(!names.has(f.path),f.path+' duplicated');names.add(f.path);
  assert(f.path.startsWith('C:/Home/')&&!f.path.includes('..'));
  const b=await readFile(new URL(f.url,root));assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256,f.url);count++;
 }
 if(p.id==='toom'){
  const wad=p.files.find(f=>f.path==='C:/Home/TOOM/FREEDOOM.WAD');
  assert.equal(wad.sha256,p.wad.sha256);assert.equal(wad.bytes,p.wad.bytes);
  for(const name of ['COPYING','NOTICE','Freedoom-COPYING.txt','Freedoom-CREDITS.txt'])assert(p.files.some(f=>f.path==='C:/Home/TOOM/'+name),name);
 }
}
console.log(`Game packages: ${c.packages.length} entries, ${count} verified assets, Freedoom and its notices passed.`);
