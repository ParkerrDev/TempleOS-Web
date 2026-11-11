import assert from "node:assert/strict";
import {createGuestFpsMeter} from "../guest-fps.js";

const meter=createGuestFpsMeter();
assert.equal(meter.text(),"FPS: \u2014");
meter.sample(29,10);
assert.equal(meter.text(),"FPS: 29");
for (let n=0;n<120;n++)
  meter.sample(60,10);
assert.equal(meter.text(),"FPS: 29","duplicate frames cannot invent FPS");
meter.sample(24,11);
assert.equal(meter.text(),"FPS: 24");
meter.sample(24,9);
assert.equal(meter.text(),"FPS: 24","out-of-order frames do not change the label");
for (const [fps,updates] of [[NaN,13],[Infinity,13],[-1,13],[30,NaN],
  [30,1.5],[30,-1],[30,Number.MAX_SAFE_INTEGER+1],[29.6,13]])
  meter.sample(fps,updates);
assert.equal(meter.text(),"FPS: 24","only displayed integers are valid");
meter.setPaused(true);
assert.equal(meter.paused,true);
assert.equal(meter.text(),"FPS: 24","pausing retains the frozen screen's label");
meter.setPaused(false);
meter.sample(null,14);
assert.equal(meter.text(),"FPS: \u2014","a covered guest label has no invented FPS");
meter.sample(120,15);
assert.equal(meter.text(),"FPS: 120");
meter.reset();
meter.sample(10,0);
assert.equal(meter.text(),"FPS: 10","reset accepts a restarted frame counter");
console.log("Guest FPS label: exact frame values, duplicates, invalid data, "+
  "covered labels, pause and restart passed.");
