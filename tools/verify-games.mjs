import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const c=JSON.parse(await readFile(new URL('games/catalog.json',root)));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(c.packages.length,32);assert.equal(new Set(c.packages.map(p=>p.id)).size,32);
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
  const parts=await Promise.all(p.files.filter(f=>/Freedoom\d+\.BIN$/.test(f.url)).map(f=>readFile(new URL(f.url,root))));
  assert.equal(hash(Buffer.concat(parts)),p.wad.sha256);assert.equal(Buffer.concat(parts).length,p.wad.bytes);
  assert(p.files.some(f=>f.path.endsWith('COPYING.TXT')));assert(p.files.some(f=>f.path.endsWith('CREDITS.TXT')));
 }
}
console.log(`Game packages: ${c.packages.length} entries, ${count} verified assets, Freedoom reconstruction and notices passed.`);
