import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceDocument,gameProject} from '../game-source.js';
import {installGame,gameFile} from '../game-packages.js';
const root=new URL('../',import.meta.url),catalog=JSON.parse(await readFile(new URL('games/catalog.json',root)));
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
let count=0,sprites=0;
for(const pkg of catalog.packages)for(const file of pkg.files.filter(f=>/\.(HC|HH)$/i.test(f.path))){
 const raw=new Uint8Array(await readFile(new URL(file.url,root))),doc=sourceDocument(raw);
 assert.deepEqual(new Uint8Array(doc.encode(doc.original)),raw,file.path);
 const edited=new Uint8Array(doc.encode('// Edited game\n'+doc.original));
 const originalSuffix=raw.indexOf(0),editedSuffix=edited.indexOf(0);
 if(originalSuffix>=0){assert.deepEqual(edited.subarray(editedSuffix),raw.subarray(originalSuffix),file.path);sprites++;}
 count++;
}
assert.throws(()=>sourceDocument(new Uint8Array([65,0,255])).encode('snowman '+String.fromCodePoint(9731)),/8-bit/);
assert.throws(()=>sourceDocument(new Uint8Array([65])).encode('A\0B'),/NUL/);
const project=await gameProject({name:'CastleFrankenstein',packageId:'tinker-CastleFrankenstein'});
const doc=await project.open(project.entry);project.change(project.entry,'// Saved draft\n'+doc.text);
const entryFile=catalog.packages.find(p=>p.id===project.id).files.find(f=>f.path===project.entry);
assert([...storage.keys()].some(key=>key.includes(entryFile.sha256)),'Drafts belong to the original source and sprite revision');
assert.equal((await project.open(project.entry)).text.startsWith('// Saved draft'),true);
const reloaded=await import('../game-source.js?reload-test');
const reopened=await reloaded.gameProject({name:'CastleFrankenstein',packageId:'tinker-CastleFrankenstein'});
assert.equal((await reopened.open(project.entry)).text,(await project.open(project.entry)).text);
const overrides=await project.overrides(),writes=[];
const write=async(path,bytes)=>{writes.push({path,bytes:bytes.slice(0)});structuredClone(bytes,{transfer:[bytes]});return{ok:true};};
await installGame(project.id,write,()=>{},overrides);assert.equal(writes.length,2);
writes.length=0;await installGame(project.id,write,()=>{},await project.overrides());assert.equal(writes.length,1);
await project.reset(project.entry);writes.length=0;await installGame(project.id,write,()=>{},await project.overrides());
assert.equal(writes.length,1);assert.deepEqual(new Uint8Array(writes[0].bytes),new Uint8Array(await project.bytes(project.entry)));
writes.length=0;await installGame(project.id,write);assert.equal(writes.length,0);
for(const file of project.sources){const d=await project.open(file.path);project.change(file.path,'// New edit\n'+d.text);}
const pendingRun=project.overrides();
const nextFile=project.sources.at(-1),beforeEdit=await project.open(nextFile.path);
project.change(nextFile.path,'// Changed during startup\n'+beforeEdit.text);
const snapshot=await pendingRun;
assert.deepEqual(new Uint8Array(snapshot.get(nextFile.path)),new Uint8Array(beforeEdit.encode(beforeEdit.text)),'Run freezes all files before asynchronous source loading');
assert.notDeepEqual(new Uint8Array((await project.overrides()).get(nextFile.path)),new Uint8Array(snapshot.get(nextFile.path)),'Later edits apply on the next run');
let attempted=0;
await assert.rejects(installGame(project.id,async()=>({ok:++attempted===1,msg:'simulated disk failure'}),()=>{},await project.overrides()),/simulated disk failure/);
writes.length=0;await installGame(project.id,write);assert.equal(writes.length,2,'Retry restores partial installs');
globalThis.__osGeneration=1;writes.length=0;await installGame(project.id,write);assert.equal(writes.length,2);
await assert.rejects(installGame(project.id,write,()=>{},new Map([['C:/Home/foreign.HC',new ArrayBuffer(0)]])),/not a game source/);
const file=catalog.packages[0].files[0],copy=await gameFile(file);new Uint8Array(copy).fill(0);
assert.notDeepEqual(new Uint8Array(await gameFile(file)),new Uint8Array(copy),'Cached bytes remain intact');
console.log(`${count} source files round-trip; ${sprites} binary sprite tails preserved. Draft reload, edited installs, restore, partial failure and restart passed.`);
