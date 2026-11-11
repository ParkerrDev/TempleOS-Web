import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHemuHost} from "../../engine/host.js";
import {hemuIncludeResolver} from "../../engine/compile.js";
import {RegsRead,RegsSource} from "../snapshot/Regs.mjs";

const dir=mkdtempSync(join(tmpdir(),"hemu-regs-"));
const fixture=name=>readFileSync(new URL(`../snapshot/fixtures/${name}.txt`,import.meta.url),"utf8");
const one=fixture("one"),four=fixture("four"),xmm=fixture("xmm");
const Hash=bytes=>createHash("sha256").update(bytes).digest("hex"),
  nativeSource=readFileSync(new URL("../snapshot/fixtures/Xmm.HC",import.meta.url),"utf8"),
  needle="  DU8 0xD9,0xF7,0xD9,0xF7,0xD9,0xF7;";
assert.equal(nativeSource.split(needle).length,2);
for(const name of ["xmm","occupied"]) {
  const meta=JSON.parse(readFileSync(new URL(`../snapshot/fixtures/${name}.json`,import.meta.url))),
    source=name==="xmm"?nativeSource:nativeSource.replace(needle,needle+"\n  DU8 0xD9,0xE8;");
  assert.equal(Hash(source),meta.sourceSha256,"native witness source identity");
  assert.equal(Hash(fixture(name)),meta.registerSha256,"native register evidence identity");
}
try {
  for(const [count,raw] of [[1,one],[4,four],[1,xmm]]) {
    const capture=RegsRead(raw,count),script=`bake-regs${count===4?"-smp":""}.mjs`,out=join(dir,"regs.HC"),input=join(dir,"regs.txt");
    writeFileSync(input,raw);
    const generated=spawnSync(process.execPath,[new URL("../snapshot/"+script,import.meta.url).pathname,input,out],{encoding:"utf8"});
    assert.equal(generated.status,0,generated.stderr);
    assert.equal(readFileSync(out,"utf8"),RegsSource(capture));
    const source=RegsSource(capture),probe=`U64 RegProbe(I64 n,I64 core=0,I64 i=0) {
      switch(n) {
        case 0:return pit_reload;case 1:return pit_div;case 2:return pit_counter;
        case 3:return rtc_idx;case 4:return g_cpu_st[core].f_rip;
        case 5:return g_cpu_st[core].f_reg[i];
        case 6:return g_cpu_st[core].f_msr_fsbase;
        case 7:return g_cpu_st[core].f_msr_gsbase;
        case 8:return g_cpu_st[core].f_x87_cw;case 9:return g_cpu_st[core].f_x87_sw;
        case 10:return g_cpu_st[core].f_fsp;case 11:return g_cpu_st[core].f_halted;
        case 12:return g_xmm_lo[core][i];case 13:return g_xmm_hi[core][i];
      }return 0;
    }`;
    const compiled=compileHolyC('#include "cpu.HC"\n'+source+probe,{filename:out,lenient:false,
      exports:["SetSnapRegs","RegProbe"],includeResolver:hemuIncludeResolver});
    assert.deepEqual(compiled.warnings,[]);
    const host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
    host.attach(instance);instance.exports.__rt_init();instance.exports.SetSnapRegs();
    const get=(n,core=0,i=0)=>instance.exports.RegProbe(BigInt(n),BigInt(core),BigInt(i));
    assert.deepEqual([get(0),get(1),get(2)],[1192n,1192n,1192n]);
    assert.equal(get(3),0n);
    for(let core=0;core<count;core++) {
      const c=capture.cores[core];
      assert.deepEqual([get(4,core),get(6,core),get(7,core)], [c.rip,c.fs.base,c.gs.base].map(BigInt));
      for(let i=0;i<16;i++)assert.equal(get(5,core,i),BigInt(c.regs[i]));
      assert.deepEqual([get(8,core),get(9,core),get(10,core),get(11,core)], raw===xmm?[0x77Fn,0x1800n,3n,1n]:[0x37Fn,core?0n:0x20n,0n,1n]);
      for(let i=0;i<16;i++) {
        const expected=lane=>raw===xmm?0x0123456789ABCDEFn+BigInt(lane)*0x0101010101010101n:0n;
        assert.equal(get(12,core,i),expected(i*2));
        assert.equal(get(13,core,i),expected(i*2+1));
      }
    }
  }
  const rejects=[
    [fixture("occupied"),1,/Occupied x87/],
    [one.replace(/FCW=[^\r\n]+/,""),1,/missing/],
    [one.replace("FTW=00","FTW=01"),1,/Occupied x87/],
    [one.replace("FSW=0020","FSW=0820"),1,/TOP/],
    [one.replace("FSW=0020","FSW=00a0"),1,/Pending x87/],
    [one.replace("MXCSR=00001f80","MXCSR=00009f80"),1,/MXCSR/],
    [one.replace("HLT=1","HLT=0"),1,/halted/],
    [one.replace("CPL=0","CPL=3"),1,/ring-zero/],
    [one.replace(/XMM15=[^\r\n]+/,""),1,/missing/],
    [four.replace("CPU#2","CPU#1"),4,/topology/],
    [four.replace("CR3=000000000010b000","CR3=000000000010c000"),4,/cr3/],
    [one,4,/topology/],[four,1,/topology/],[one,8,/one or four/],
  ];
  for(const [raw,n,error] of rejects)assert.throws(()=>RegsRead(raw,n),error);
  console.log(`Snapshot generators: native one/four-core GPR, FPU, HLT, distinct native XMM lanes/TOP3 and 1192-count PIT state; ${rejects.length} malformed/unrepresentable captures rejected.`);
} finally {rmSync(dir,{recursive:true,force:true});}
