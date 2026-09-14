// Run the real native controller with a small DOM/worker adapter. No browser or
// emulation is needed to check pointer-lock transitions and shared input state.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as protocol from '../../holyc-wasm/src/runtime/protocol.js';

const nodes=new Map(),workers=[],windowEvents=new EventTarget();
const document=new EventTarget();
const container={replaceChild(next){nodes.set(next.id,next);}};
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
class Node extends EventTarget {
  constructor(id=''){super();this.id=id;this.parentNode=container;this.value='';this.textContent='';this.style={};}
  appendChild(child){return child;}
  cloneNode(){return new Node(this.id);}
  focus(){document.activeElement=this;}
  getContext(){return {};}
  getBoundingClientRect(){return {left:0,top:0,right:640,bottom:480,width:640,height:480};}
  setPointerCapture(){}
  setAttribute(name,value){this[name]=value;}
  querySelector(){return this.label??=new Node();}
  requestPointerLock(){
    document.pointerLockElement=this;
    queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));
    return Promise.resolve();
  }
}
document.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
document.createElement=()=>new Node();
document.body={classList:{toggle(){}}};
document.exitPointerLock=()=>{
  document.pointerLockElement=null;
  queueMicrotask(()=>document.dispatchEvent(new Event('pointerlockchange')));
};
class Worker {
  constructor(){workers.push(this);}
  postMessage(message){this.sent=message;}
  terminate(){}
}
const context=vm.createContext({
  ...protocol,document,console,URL,Event,Worker,Int32Array,Uint8Array,SharedArrayBuffer,Atomics,
  DEMOS:[],SOURCES:{'Demo/Graphics/Lines.HC':'// test source'},PointerEvent:true,crossOriginIsolated:true,performance,
  Speaker:class {resume(){} tone(){}},Framebuffer:class {present(){}},
  addEventListener:windowEvents.addEventListener.bind(windowEvents),
  dispatchEvent:windowEvents.dispatchEvent.bind(windowEvents),
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval:()=>1,clearInterval(){},
});
context.window=context;context.self=context;
const path=new URL('../../holyc-wasm/native/app.js',import.meta.url);
const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(path.href));
new vm.Script(source,{filename:path.pathname}).runInContext(context);
const api=context.__holycEditor,{CTRL,KEY_STATE_BASE}=protocol;
const emit=(target,type,fields={})=>{
  const event=new Event(type,{cancelable:true});Object.assign(event,fields);target.dispatchEvent(event);
};
assert.equal(api.captureMouse(),false,'stopped previews cannot capture');
await api.runIn(document.getElementById('screen'),'input probe');
const screen=document.getElementById('screen'),worker=workers.at(-1),ctrl=new Int32Array(worker.sent.controlSAB);
assert.equal(api.captureMouse(),true,'manual capture works without a game capture hint');
await flush();assert.equal(document.pointerLockElement,screen);
worker.onmessage({data:{type:'inputMode',capture:false}});
assert(api.isMouseCaptured(),'a delayed absolute-input hint must not undo manual capture');
emit(document,'mousemove',{movementX:12,movementY:-6});
assert.equal(ctrl[CTRL.MS_X],332);assert.equal(ctrl[CTRL.MS_Y],234);
emit(screen,'pointermove',{clientX:50,clientY:50});
assert.equal(ctrl[CTRL.MS_X],332,'fixed client coordinates cannot overwrite captured motion');
emit(windowEvents,'keydown',{code:'KeyW',key:'w'});
assert.equal(ctrl[KEY_STATE_BASE+0x11],1);
emit(windowEvents,'keydown',{code:'Escape',key:'Escape'});
await flush();assert.equal(api.isMouseCaptured(),false);
assert.equal(ctrl[KEY_STATE_BASE+0x11],0);assert.equal(ctrl[CTRL.MS_DX],0);
worker.onmessage({data:{type:'inputMode',capture:true}});
emit(screen,'pointerdown',{pointerType:'mouse',button:0,clientX:320,clientY:240});
assert.equal(api.isMouseCaptured(),false,'refocusing after Esc stays hybrid despite a new game hint');
api.captureMouse();await flush();assert.equal(document.pointerLockElement,screen);
api.releaseMouse();
emit(screen,'pointerdown',{pointerType:'mouse',button:0,clientX:320,clientY:240});
await flush();assert.equal(api.isMouseCaptured(),false,'Release is sticky before pointerlockchange arrives');
emit(screen,'pointerdown',{pointerType:'mouse',button:0,shiftKey:true});
await flush();assert(api.isMouseCaptured(),'Shift+click explicitly recaptures');
api.stop();await flush();assert.equal(api.isMouseCaptured(),false);assert.equal(api.isRunning(),false);
await api.runIn(screen,'rerun probe');
api.captureMouse();await flush();assert.equal(document.pointerLockElement,document.getElementById('screen'));
assert.notEqual(document.pointerLockElement,screen,'reruns capture the replacement canvas');
api.stop();await flush();
console.log('Native capture: manual and automatic input modes, 2D motion, Escape/key release, sticky hybrid, explicit recapture, stop and replacement canvas passed.');

// Exercise the actual editor controls against the same native controller.
const games=readFileSync(new URL('../games.js',import.meta.url),'utf8');
const router=games.slice(games.indexOf('const previewCapture='),games.indexOf('async function runInBrowser('));
context.previewOverlay={classList:{contains:()=>false}};
new vm.Script('let runnerTarget=null;const ovE=previewOverlay;'+router).runInContext(context);
assert.equal(context.__gameMouse.toggle(),false,'inactive previews leave desktop capture alone');
vm.runInContext("runnerTarget='editor';",context);
assert.equal(context.__gameMouse.toggle(),true,'loading previews cannot fall through to desktop capture');
await api.runIn(document.getElementById('screen'),'editor capture probe');
const captureButton=document.getElementById('gameCapture');
assert.equal(captureButton.disabled,false);
emit(captureButton,'click');await flush();assert(api.isMouseCaptured());
assert.equal(captureButton['aria-pressed'],'true');
assert.equal(captureButton.querySelector('span').textContent,'Release mouse');
context.__gameMouse.toggle();await flush();assert.equal(api.isMouseCaptured(),false);
assert.equal(captureButton['aria-pressed'],'false');
api.stop();await flush();assert.equal(captureButton.disabled,true);
console.log('Editor capture: active native canvas, desktop routing, release labels and stopped-preview cleanup passed.');
