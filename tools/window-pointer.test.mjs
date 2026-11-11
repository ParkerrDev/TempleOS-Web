import assert from "node:assert/strict";
import {PointerDrag} from "../WinPointer.js";

const win=new EventTarget;
class Border extends EventTarget
{
  ownerDocument={defaultView:win};
  captured=new Set;
  setPointerCapture(id) {this.captured.add(id);}
  hasPointerCapture(id) {return this.captured.has(id);}
  releasePointerCapture(id) {this.captured.delete(id);Emit(this,"lostpointercapture",id);}
}
function Emit(el,type,id)
{
  let e=new Event(type,{cancelable:true});
  e.pointerId=id;
  el.dispatchEvent(e);
  return e;
}
function Start(el,id,Move,End)
{
  el.addEventListener("pointerdown",function (e) {
    PointerDrag(e,Move,End);
  },{once:true});
  return Emit(el,"pointerdown",id);
}
let a=new Border,b=new Border,moves=0,ends=0;
assert(Start(a,7,function () {moves++;},function () {ends++;}).defaultPrevented);
Emit(a,"pointermove",8);
Emit(a,"pointerup",8);
assert(a.hasPointerCapture(7));
Emit(a,"pointermove",7);
assert.equal(moves,1);
Emit(a,"pointercancel",7);
assert.equal(ends,1);
assert(!a.hasPointerCapture(7));
Emit(a,"pointermove",7);
assert.equal(moves,1);
Start(a,9,function () {moves++;},function () {ends++;});
Start(b,10,function () {moves++;},function () {ends++;});
assert.equal(ends,2);
assert(!a.hasPointerCapture(9));
win.dispatchEvent(new Event("blur"));
assert.equal(ends,3);
assert(!b.hasPointerCapture(10));
Start(a,11,function () {moves++;},function () {ends++;});
Emit(a,"lostpointercapture",11);
assert.equal(ends,4);
Emit(a,"pointerup",11);
assert.equal(ends,4);
console.log("Window gestures: pointer ownership, replacement, cancellation, lost capture and blur passed.");
