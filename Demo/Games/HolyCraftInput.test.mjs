// Exercise the actual native-compiler game input path without its render loop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHolyC} from '../../hemu/holyc-wasm/src/compiler.js';
import {createTaskHost} from '../../hemu/holyc-wasm/src/runtime/tasks.js';
const source=readFileSync(new URL('../../holycraft/HolyCraft.HC',import.meta.url),'utf8').replace(/HolyCraft;\s*$/,'');
const result=compileHolyC(source,{lenient:true,resilient:true,exports:['Init','HandleInput']});
let now=1000;
const host=createTaskHost({jit:result.jit,timeMs:()=>now});
const instance=await WebAssembly.instantiate(result.bytes,{env:host.env});host.attach(instance.instance);
const ex=instance.instance.exports,dv=new DataView(ex.memory.buffer);
const addr=name=>Number(result.globals.get(name).addr);
const number=name=>dv.getFloat64(addr(name),true);
const state=()=>['g_pitch','g_yaw','g_px','g_pz'].map(number);
const play=async n=>{for(let i=0;i<n;i++){now+=16;await host.run('HandleInput');}};   // n frames of 16 ms
await host.run();await host.run('Init');
const initial=state();
await play(30);assert.deepEqual(state(),initial);
dv.setBigInt64(addr('BrowserMouseDX'),30n,true);dv.setBigInt64(addr('BrowserMouseDY'),15n,true);
await play(1);const turned=state();assert(turned[0]<initial[0]&&turned[1]>initial[1]);
await play(30);assert.deepEqual(state(),turned);
dv.setUint8(addr('BrowserKeys')+0x20,1);await play(10);
const moved=state();assert(moved[2]!==turned[2]||moved[3]!==turned[3]);
dv.setUint8(addr('BrowserKeys')+0x20,0);await play(30);assert.deepEqual(state(),moved);
await host.dispose();
console.log('HolyCraft native input: stable idle, one-shot mouse motion, held movement and immediate release passed.');
