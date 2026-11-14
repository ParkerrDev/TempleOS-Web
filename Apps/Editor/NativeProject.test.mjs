import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileProject} from '../../hemu/holyc-wasm/src/project.js';
import {createHost} from '../../hemu/holyc-wasm/src/runtime/host.js';
import {gameProject} from '../Games/GameSrc.js';

const root=new URL('../../',import.meta.url),storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
for(const file of ['HolyCraft.HC','Snake.HC','Babel.HC','Volley.HC']){
  const project=await gameProject({name:file,file}),snapshot=await project.native();
  assert(snapshot.nativeGame);assert(WebAssembly.validate(compileProject(snapshot).bytes));
}
const entryProject=await gameProject({name:'Snake.HC',file:'Snake.HC'});
await entryProject.open(entryProject.entry);
entryProject.change(entryProject.entry,'I64 answer=42;\n');
const actualEntry=compileProject(await entryProject.native()),entryHost=createHost({onText(){}}),
  entryModule=await WebAssembly.instantiate(actualEntry.bytes,{env:entryHost.env});
entryHost.attach(entryModule.instance);entryModule.instance.exports.__main();
assert.equal(new DataView(entryModule.instance.exports.memory.buffer).getBigInt64(
  Number(actualEntry.globals.get('answer').addr),true),42n,'The project entry executes instead of including itself.');
await entryProject.reset(entryProject.entry);
const project=await gameProject({name:'CastleFrankenstein',packageId:'tinker-CastleFrankenstein'});
const sourceFile=project.sources.find(f=>f.path!==project.entry),original=await project.open(sourceFile.path);
await project.open(project.entry);
project.change(sourceFile.path,'I64 DraftValue(){return 42;}\n');
project.change(project.entry,'#include "'+sourceFile.path+'"\nI64 answer=DraftValue;\n');
const pending=project.native();project.change(sourceFile.path,'I64 DraftValue(){return 99;}\n');
const snapshot=await pending;
assert(snapshot.files.find(f=>f.path===sourceFile.path).source.includes('return 42'));
const compiled=compileProject(snapshot),nativeHost=createHost({onText(){}});
const native=await WebAssembly.instantiate(compiled.bytes,{env:nativeHost.env});nativeHost.attach(native.instance);native.instance.exports.__main();
assert.equal(new DataView(native.instance.exports.memory.buffer).getBigInt64(Number(compiled.globals.get('answer').addr),true),42n);
assert((await project.native()).files.find(f=>f.path===sourceFile.path).source.includes('return 99'));
await project.reset(sourceFile.path);await project.reset(project.entry);
assert.deepEqual(Uint8Array.from((await project.native()).files.find(
 f=>f.path===sourceFile.path).source,ch=>ch.charCodeAt(0)),
 new Uint8Array(original.encode(original.original)),
 'Restore gives the compiler the original document, including binary records');
console.log('Native projects: all four native games, frozen package drafts, edited WASM execution and restore passed.');
