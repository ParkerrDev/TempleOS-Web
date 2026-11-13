import assert from "node:assert/strict";
import {GuestHarness} from "./GuestHarness.mjs";

const h=await GuestHarness(),{ex,gx,Name}=h;
const base=Number(ex.GuestVar(Name("winmgr"))),
      updates=base+Number(ex.GuestMember(Name("CWinMgrGlbls"),Name("updates",0x7100))),
      sleep=Number(ex.GuestFun(Name("WinMgrSleep"))),wall=Number(ex.GuestFun(Name("WallPaper"))),
      originalSleep=gx.rdBytes(sleep,4096).slice(),originalWall=gx.rdBytes(wall,4096).slice();
const measurements=[];
assert.equal(ex.WinRateSet(47n),0n,"unsupported rates do not patch guest code");
for (const rate of [60,120,0,30]) {
  assert.equal(ex.WinRateSet(BigInt(rate)),1n,"named layout is recognized");
  await h.Run(20);
  const start=gx.rd64(updates);
  await h.Run(180);
  const hz=(gx.rd64(updates)-start)/(180*0.016);
  measurements.push({rate,hz});
  if (rate) assert.ok(Math.abs(hz-rate)<rate*0.1,JSON.stringify(measurements));
  else assert.ok(hz>120,"uncapped guest exceeds the selectable rates");
}
assert.deepEqual(gx.rdBytes(sleep,4096),originalSleep,"30 restores original pacing and FPS instructions");
assert.deepEqual(gx.rdBytes(wall,4096),originalWall,"30 restores original top-line formatting");
console.log("Guest refresh settings:",JSON.stringify(measurements));

for (const rate of [60,120,0]) {
  assert.equal(ex.WinRateSet(BigInt(rate)),1n);
  //A RAM-only import loses host patch metadata while retaining guest code.
  const dv=new DataView(ex.memory.buffer);
  dv.setBigUint64(Number(h.compiled.globals.get("win_rate_pool").addr),0n,true);
  assert.equal(ex.WinRateSet(30n),1n,"recognize prior patched RAM at "+rate);
  assert.deepEqual(gx.rdBytes(sleep,4096),originalSleep,"legacy rate restore is byte-exact");
  assert.deepEqual(gx.rdBytes(wall,4096),originalWall,"legacy format restore is byte-exact");
}
console.log("Legacy RAM snapshots recover all three modified timing layouts.");
