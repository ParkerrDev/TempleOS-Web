import assert from "node:assert/strict";
import {KEY,KeyInput,KeyRoute} from "./Keyboard.js";

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
const rejectedRoute=KeyRoute(()=>resetDuringPress);
assert.equal(rejectedRoute.down('overflow',KEY.Space),false);
assert.equal(rejectedRoute.up('overflow'),false,'Rejected presses leave no destination owner.');
