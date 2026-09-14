// Exercise the actual native worker and compiled HolyC ms.lb/ms.rb reads.
// Inject host input while Sleep yields, including a complete click between polls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {compileHolyC} from '../../holyc-wasm/src/compiler.js';
import {compileNativeProject} from '../../holyc-wasm/native/project.js';
import {createMouseButtons} from '../../holyc-wasm/native/mouse-buttons.js';
import {createHost} from '../../holyc-wasm/src/runtime/host.js';
import {Framebuffer} from '../../holyc-wasm/src/runtime/graphics.js';
import * as protocol from '../../holyc-wasm/src/runtime/protocol.js';

const {CTRL,makeControlSAB}=protocol,controlSAB=makeControlSAB(),ctrl=new Int32Array(controlSAB),messages=[];
let waits=0,time=0;
const atomics=Object.create(Atomics);
atomics.wait=()=>{
  if(++waits===1){Atomics.or(ctrl,CTRL.MS_PRESSED,1);} // press and release entirely between polls
  if(waits===3){ctrl[CTRL.MS_LB]=ctrl[CTRL.MS_RB]=1;Atomics.or(ctrl,CTRL.MS_PRESSED,3);}
  if(waits===4)ctrl[CTRL.MS_LB]=0;
  if(waits===5)ctrl[CTRL.MS_RB]=0;
  if(waits===6){ctrl[CTRL.MS_PRESSED]=0;Atomics.add(ctrl,CTRL.INPUT_RESET,1);}
  return 'ok';
};
const context=vm.createContext({...protocol,compileHolyC,compileNativeProject,createHost,createMouseButtons,Framebuffer,
  Atomics:atomics,WebAssembly,Int32Array,Uint8Array,DataView,performance:{now:()=>++time},postMessage:m=>messages.push(m)});
context.self=context;
const path=new URL('../../holyc-wasm/native/worker.js',import.meta.url);
new vm.Script(readFileSync(path,'utf8').replace(/^import[^\n]+\n/gm,''),{filename:path.pathname}).runInContext(context);
await context.onmessage({data:{type:'run',nativeGame:true,filename:'ClickProbe.HC',controlSAB,fbSAB:new SharedArrayBuffer(640*480),
  source:'I64 i;for(i=0;i<7;i++){Sleep(16);"%d %d\\n",ms.lb,ms.rb;}\n'}});
assert.equal(messages.find(m=>m.type==='error'),undefined);
assert.deepEqual(messages.filter(m=>m.type==='text').map(m=>m.text.trim()),['1 0','0 0','1 1','0 1','0 0','0 0','0 0']);
assert(messages.some(m=>m.type==='done'));
console.log('Native worker: short clicks, held/chorded buttons, independent releases and compiled HolyC mouse reads passed.');
