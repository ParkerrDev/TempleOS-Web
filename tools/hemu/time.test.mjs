import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";

const r=compileHemu({exports:["InitMem","TimeRst","TimeFrame","TimeRun",
      "TimeAdd","TscRead","IoOut","IoIn","Run","RunCore","RigInit",
      "RigClock","RigCount"],extraSource:`
U0 RigInit()
{
  I64 i;
  Reset;
  for (i=0;i<NCORES;i++) {
    g_cpu_st[i].f_rip=4096;
    g_cpu_st[i].f_rfl=0;
    g_cpu_st[i].f_halted=0;
    g_cpu_st[i].f_icount=0;
  }
  mem[4096]=0x90;mem[4097]=0xEB;mem[4098]=0xFD;
}
U64 RigClock(I64 n)
{
  switch (n) {
    case 0: return tsc;
    case 1: return hpet_ctr;
    case 2: return pic1_irr;
    case 3: return pit_div;
  }
  return 0;
}
I64 RigCount(I64 core) {return g_cpu_st[core].f_icount;}
`});
assert.deepEqual(r.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(r.bytes,
      {env:host.env}),ex=instance.exports;
host.attach(instance);
ex.__rt_init();
ex.InitMem(8192n);

ex.TimeRst();
let elapsed=0n;
for (const ns of [1n,999n,12345678n,16666667n,16666666n,421n]) {
  ex.TimeFrame(ns,10003n);
  ex.TimeRun(3333n);
  ex.TimeRun(3333n);
  ex.TimeRun(3337n);
  elapsed+=ns;
  assert.equal(ex.RigClock(0n),elapsed,"fractional frame time is conserved");
  assert.equal(ex.RigClock(1n),elapsed/10n,"HPET fractions survive frames");
}
for (let n=0;n<10000;n++)
  ex.TscRead();
assert.equal(ex.RigClock(0n),elapsed,"reading TSC cannot speed up time");

ex.TimeRst();
ex.IoOut(0x43n,0x34n);
ex.IoOut(0x40n,0xA9n);
ex.IoOut(0x40n,0x04n);
ex.TimeAdd(500000n);
ex.IoOut(0x43n,0n);
const lo=ex.IoIn(0x40n);
ex.TimeAdd(200000n);
const hi=ex.IoIn(0x40n);
assert.equal(lo+(hi<<8n),1193n-596n,"both latch bytes describe one instant");
assert.equal(ex.RigClock(2n)&1n,0n,"PIT cannot interrupt early");
ex.TimeAdd(300000n);
assert.equal(ex.RigClock(2n)&1n,1n,"programmed PIT period raises IRQ0");
ex.TimeFrame(17n,1n);
ex.TimeRun(1n);
assert.equal(ex.RigClock(3n),1193n,"a frame cannot reprogram the PIT");

ex.RigInit();
ex.TimeFrame(1000000n,4000n);
ex.Run(1000n);
assert.equal(ex.RigClock(0n),250000n);
ex.__core.value=1n;
assert.equal(ex.RunCore(500n),500n);
ex.__core.value=0n;
assert.equal(ex.RigCount(0n),1000n,"an AP cannot spend the BSP budget");
assert.equal(ex.RigClock(0n),250000n,"an AP cannot advance device time");
ex.Run(4000n);
assert.equal(ex.RigClock(0n),1000000n);
console.log("Clock: fractional elapsed time, PIT reload/latch/IRQ, read-only TSC, independent core budgets.");
