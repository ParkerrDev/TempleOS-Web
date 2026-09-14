import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileNativeProject} from '../../holyc-wasm/native/project.js';
import {createHost} from '../../holyc-wasm/src/runtime/host.js';
import {gameProject} from '../game-source.js';

const entry='C:/Home/Test/Main.HC';
const program={filename:entry,source:'#define ENABLED 1\n#include "a/Load.HC"\n#include "b/Load.HC"\nI64 answer=First+Second;\n',files:[
  {path:'C:/Home/Test/a/Load.HC',source:'#ifdef ENABLED\n#include "../shared"\nI64 First(){return SHARED;}\n#endif\n'},
  {path:'C:/Home/Test/b/Load.HC',source:'I64 Second(){return SHARED+2;}\n'},
  {path:'C:/Home/Test/Shared.HH',source:'#define SHARED 20\n'},
]};
const result=compileNativeProject(program),host=createHost({onText(){}});
const {instance}=await WebAssembly.instantiate(result.bytes,{env:host.env});host.attach(instance);instance.exports.__main();
assert.equal(new DataView(instance.exports.memory.buffer).getBigInt64(Number(result.globals.get('answer').addr),true),42n);
assert.throws(()=>compileNativeProject({...program,source:'#include "Missing.HC"\n'}),/include not in this game/);
assert.throws(()=>compileNativeProject({...program,source:'NotANativeAPI();'}),/NotANativeAPI/);
assert.throws(()=>compileNativeProject({...program,source:'I64 Broken( {'}),/./);

const root=new URL('../',import.meta.url),storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
for(const file of ['HolyCraft.HC','Snake.HC']){
  const project=await gameProject({name:file,file}),snapshot=await project.native();
  assert(snapshot.nativeGame);assert(WebAssembly.validate(compileNativeProject(snapshot).bytes));
}
const project=await gameProject({name:'CastleFrankenstein',packageId:'tinker-CastleFrankenstein'});
const sourceFile=project.sources.find(f=>f.path!==project.entry),original=await project.open(sourceFile.path);
await project.open(project.entry);
project.change(sourceFile.path,'I64 DraftValue(){return 42;}\n');
project.change(project.entry,'#include "'+sourceFile.path+'"\nI64 answer=DraftValue;\n');
const pending=project.native();project.change(sourceFile.path,'I64 DraftValue(){return 99;}\n');
const snapshot=await pending;
assert(snapshot.files.find(f=>f.path===sourceFile.path).source.includes('return 42'));
const compiled=compileNativeProject(snapshot),nativeHost=createHost({onText(){}});
const native=await WebAssembly.instantiate(compiled.bytes,{env:nativeHost.env});nativeHost.attach(native.instance);native.instance.exports.__main();
assert.equal(new DataView(native.instance.exports.memory.buffer).getBigInt64(Number(compiled.globals.get('answer').addr),true),42n);
assert((await project.native()).files.find(f=>f.path===sourceFile.path).source.includes('return 99'));
await project.reset(sourceFile.path);await project.reset(project.entry);
assert.equal((await project.native()).files.find(f=>f.path===sourceFile.path).source,original.original);
const launcher=await readFile(new URL('../games.js',import.meta.url),'utf8');
const browserRun=launcher.slice(launcher.indexOf('async function runInBrowser('),launcher.indexOf('function closeGameWin('));
assert(!/iframe|runInTempleOS|__launchInOS|gameSession/.test(browserRun),'browser launch cannot invoke emulation');
assert(!/game-session-launch|game-session-ready/.test(launcher),'legacy URLs cannot launch emulated games');
console.log('Native projects: nested includes/shared macros, strict failures, both native games, frozen package drafts, edited WASM execution, restore and no emulator fallback passed.');
