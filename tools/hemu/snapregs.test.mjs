import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHemuHost} from "../../engine/host.js";
import {hemuIncludeResolver} from "../../engine/compile.js";

const dir=mkdtempSync(join(tmpdir(),"hemu-regs-")),names=["RAX","RCX","RDX","RBX","RSP","RBP","RSI","RDI",
  "R8","R9","R10","R11","R12","R13","R14","R15"],
  dump=core=>names.map((name,i)=>`${name}=${(0x1000+core*256+i).toString(16)}`).join(" ")+`
RIP=${(0x5000+core).toString(16)} RFL=246 HLT=${core?1:0}
FS =0060 ${(0x6000+core).toString(16)}
GS =0060 ${(0x7000+core).toString(16)}
TR =0020 8000
CS =0040 0
SS =0060 0
CR0=80000031 CR3=509000 CR4=b0 EFER=500
GDT= 8020 107f
IDT= 9000 fff
`;
try {
  mkdirSync(join(dir,"tools/snapshot"),{recursive:true});
  mkdirSync(join(dir,"hemu/src"),{recursive:true});
  for(const smp of [false,true]) {
    const suffix=smp?"-smp":"",script=`bake-regs${suffix}.mjs`,out=`snapregs${suffix}.HC`;
    copyFileSync(new URL("../snapshot/"+script,import.meta.url),join(dir,"tools/snapshot",script));
    writeFileSync(join(dir,"regs.txt"),smp?Array.from({length:4},(_,core)=>`CPU#${core}\n${dump(core)}`).join("\n"):dump(0));
    const generated=spawnSync(process.execPath,[join(dir,"tools/snapshot",script),join(dir,"regs.txt")],{encoding:"utf8"});
    assert.equal(generated.status,0,generated.stderr);
    const source=readFileSync(join(dir,"hemu/src",out),"utf8"),
      probe=`U64 RegProbe(I64 n,I64 core=0) {
        switch(n) {
          case 0:return pit_reload;case 1:return pit_div;case 2:return pit_counter;
          case 3:return rtc_idx;case 4:return g_cpu_st[core].f_rip;
          case 5:return g_cpu_st[core].f_reg[4];
          case 6:return g_cpu_st[core].f_msr_fsbase;
          case 7:return g_cpu_st[core].f_msr_gsbase;
        }return 0;
      }`,
      compiled=compileHolyC('#include "cpu.HC"\n'+source+probe,{filename:out,lenient:false,
        exports:["SetSnapRegs","RegProbe"],includeResolver:hemuIncludeResolver});
    assert.deepEqual(compiled.warnings,[]);
    const host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
    host.attach(instance);instance.exports.__rt_init();instance.exports.SetSnapRegs();
    const get=(n,core=0)=>instance.exports.RegProbe(BigInt(n),BigInt(core));
    // V5.03 KernelA.HH SYS_TIMER0_PERIOD = 65536*182/10/JIFFY_FREQ.
    assert.deepEqual([get(0),get(1),get(2)],[1192n,1192n,1192n]);
    assert.equal(get(3),0n);
    for(let core=0;core<(smp?4:1);core++)
      assert.deepEqual([get(4,core),get(5,core),get(6,core),get(7,core)],
        [0x5000+core,0x1004+core*256,0x6000+core,0x7000+core].map(BigInt));
  }
  console.log("Snapshot generators: one/four-core QEMU registers compile against current CPU state; native1192-count PIT and CMOS selection survive regeneration.");
} finally {rmSync(dir,{recursive:true,force:true});}
