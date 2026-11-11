import assert from "node:assert/strict";
import {KEY,KeyInput,KeyRoute} from "../Keyboard.js";

let bytes=[],state=[],input=KeyInput(function (part) {
  bytes.push(...part);
  state.push(input.held());
});
input.down("left",KEY.ControlLeft);
input.down("right",KEY.ControlRight);
input.up("left");
assert.deepEqual(input.held(),[0x11D]);
input.up("right");
assert.deepEqual(bytes,[0x1D,0xE0,0x1D,0x9D,0xE0,0x9D]);
assert.deepEqual(state[1],[0x1D,0x11D],"held state accompanies its make byte");

bytes=[];
input.down("keypad",KEY.Numpad8);
input.down("arrow",KEY.ArrowUp);
input.reset();
assert.deepEqual(bytes,[0x48,0xE0,0x48,0xC8,0xE0,0xC8]);
assert.deepEqual(input.held(),[]);

bytes=[];
input.down("physical",KEY.ShiftLeft);
input.down("button",KEY.ShiftLeft);
input.up("button");
input.text("!");
assert.deepEqual(bytes,[0x2A,0x02,0x82]);
assert.deepEqual(input.held(),[0x2A],"text cannot release a physical modifier");
input.up("physical");
assert.equal(bytes.at(-1),0xAA);

bytes=[];
input.down("hold",KEY.KeyW);
input.down("hold",KEY.KeyW);
input.up("unrelated");
assert.deepEqual(bytes,[0x11],"host repeat is controlled by the BIOS setting");
input.reset();
input.reset();
assert.deepEqual(bytes,[0x11,0x91]);

bytes=[];
for (let ch of "aA~\n")
  assert(input.text(ch));
assert(!input.text("\u2603"));
assert.deepEqual(bytes,[0x1E,0x9E,0x2A,0x1E,0x9E,0xAA,
  0x2A,0x29,0xA9,0xAA,0x1C,0x9C]);

bytes=[];
input.tap(KEY.PrintScreen);
input.tap(KEY.Pause);
assert.deepEqual(bytes,[0xE0,0x2A,0xE0,0x37,0xE0,0xB7,0xE0,0xAA,
  0xE1,0x1D,0x45,0xE1,0x9D,0xC5]);
assert.deepEqual(input.held(),[]);
console.log("Keyboard: set-1 qualifiers, source ownership, text and release-all passed.");

const streams=[[],[]],destinations=streams.map(bytes=>KeyInput(part=>bytes.push(...part)));
let destination=0;
const route=KeyRoute(()=>destinations[destination]);
route.down('held',KEY.Space);destination=1;
route.up('held');route.tap(KEY.Enter);
assert.deepEqual(streams,[[0x39,0xb9],[0x1c,0x9c]],'A release returns to the device that accepted its press.');
destination=0;route.down('button',KEY.ShiftLeft);destinations[0].reset();destination=1;
route.up('button');assert.deepEqual(destinations[1].held(),[]);
console.log('Key routes retain press ownership through focus changes and device resets.');

const resetDuringPress=KeyInput(()=>resetDuringPress.reset());
assert.equal(resetDuringPress.down('overflow',KEY.Space),false,'A reset during delivery cancels acceptance of the press.');
const rejectedRoute=KeyRoute(()=>resetDuringPress);
assert.equal(rejectedRoute.down('overflow',KEY.Space),false);
assert.equal(rejectedRoute.up('overflow'),false,'Rejected presses leave no destination owner.');
