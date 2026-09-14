import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gameCredits} from '../game-credits.js';
import {EXTRA_GAMES,TERRY_DEMOS} from '../game-library.js';
const catalog=JSON.parse(await readFile(new URL('../games/catalog.json',import.meta.url)));
const counts=new Map();
for(const pkg of catalog.packages){
 const credit=gameCredits({name:pkg.name,packageId:pkg.id});
 assert.deepEqual(pkg.credit,credit,pkg.name+' catalog/UI credit mismatch');
 counts.set(credit.author,(counts.get(credit.author)||0)+1);
 assert(new URL(credit.source).protocol==='https:');
}
assert.deepEqual(Object.fromEntries(counts),{'Terry A. Davis':47,'Austin Sierra':6,TheTinkerer:8});
assert.equal(TERRY_DEMOS.length,31);assert.equal(EXTRA_GAMES.length,29);
for(const game of EXTRA_GAMES)assert(catalog.packages.some(p=>p.id===game.packageId&&p.entry===game.disk));
for(const name of ['Castle Frankenstein 2','SpyHunt'])assert.match(EXTRA_GAMES.find(g=>g.name===name).credit.note,/Terry A\. Davis/);
assert.throws(()=>gameCredits({name:'Unreviewed',packageId:'tinker-Unreviewed'}),/Missing verified/);
console.log('All 61 package credits match the UI, all 29 additions have matching launch entries, derivative credits and unknown-author rejection passed.');
