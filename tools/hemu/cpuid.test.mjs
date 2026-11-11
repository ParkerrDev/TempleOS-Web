import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";

const nativeSource=readFileSync(new URL("./CpuIdNative.HC",import.meta.url)),
  nativeHash=createHash("sha256").update(nativeSource).digest("hex"),
  nativeFile=new URL("./cpuid-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  assert.ok(process.env.HOLYC_QEMU_ORACLE,"Set HOLYC_QEMU_ORACLE to the original-TempleOS runner.");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),
    result=await QemuRun([nativeSource],{timeout:120});
  assert.equal(result.results[0].except,"");
  writeFileSync(nativeFile,JSON.stringify({sourceHash:nativeHash,backend:result.backend,
    evidence:result.evidence,out:result.results[0].out},null,2)+"\n");
}
const native=JSON.parse(readFileSync(nativeFile,"utf8"));
assert.equal(native.sourceHash,nativeHash,"refresh the native consumer reference after source changes");
for(const rows of [native.out.trim().split("\n"),OpcodeOracle("cpuid")]) {
  assert.equal(rows.length,5);
  const records=rows.map(line=>line.split(" ").map(word=>BigInt("0x"+word))),vendor=Buffer.alloc(12);
  for(const row of records)assert.ok(row.every(n=>n<=0xFFFFFFFFn));
  [records[0][2],records[0][4],records[0][3]].forEach((n,i)=>vendor.writeUInt32LE(Number(n),i*4));
  assert.match(vendor.toString(),/^(GenuineIntel|AuthenticAMD)$/,"native EBX/EDX/ECX vendor order");
  assert.ok(records[3][4]&(1n<<29n),"original 64-bit execution advertises long mode in EDX");
  const width=Number(records[1][2]>>8n&255n)*8;
  assert.ok(width>0&&(width&(width-1))===0,"native SysGlblsInit consumes a power-of-two cache-line size");
}

const leaves=[0,1,2,0xD,0x80000000,0x80000001,0x80000008,0xFFFFFFFF],
  features=[0,4,5,8,9,15,24].reduce((mask,bit)=>mask|1n<<BigInt(bit),0n);
let cases=0;
for(const smp of [false,true]) {
  const c=compileHemu({smp,exports:["InitMem","IdBegin","IdAddr"],extraSource:`
U0 IdBegin(I64 cores,U64 leaf,U64 subleaf)
{
  I64 i;
  for (i=0;i<16;i++) reg[i]=0xFEDCBA9800000000+i;
  reg[0]=leaf;reg[1]=subleaf;
  g_ncore=cores;rip=4096;rfl=0xAD7;halted=g_badop=0;
}
U64 IdAddr(I64 n)
{
  switch (n) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return &halted;
  }
  return 0;
}`}),host=createHemuHost();
  assert.deepEqual(c.warnings,[]);
  if(smp)host.env.mem=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true});
  const {instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
  host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
  const bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),
    base=Number(ex.RamBase()),get=p=>view.getBigUint64(p,true);
  for(let cores=1;cores<=(smp?4:1);cores++)for(let core=0;core<cores;core++) {
    ex.__core.value=BigInt(core);
    const [regs,flags,rip,halted]=[0,1,2,3].map(n=>Number(ex.IdAddr(BigInt(n))));
    for(const leaf of leaves)for(const upper of [0n,0xABCDEF0100000000n])
      for(const subleaf of [0n,1n,0xFEDCBA9876543210n]) {
        ex.IdBegin(BigInt(cores),upper|BigInt(leaf),subleaf);
        const preserved=bytes.slice(regs+32,regs+128);
        bytes.set([0x0F,0xA2],base+4096);ex.Step();
        const actual=[0,3,1,2].map(n=>get(regs+n*8));
        let expected=[0n,0n,0n,0n];
        if(leaf===0)expected=[1n,0x756E6547n,0x6C65746En,0x49656E69n];
        if(leaf===1)expected=[0x6FBn,BigInt(core)*2n**24n+BigInt(cores)*65536n+2048n,
          0n,features|(cores>1?1n<<28n:0n)];
        if(leaf===0x80000000)expected=[0x80000001n,0n,0n,0n];
        if(leaf===0x80000001)expected=[0n,0n,0n,1n<<29n];
        assert.deepEqual(actual,expected,`leaf ${leaf.toString(16)}, core ${core}/${cores}, subleaf ${subleaf}`);
        assert.deepEqual(bytes.slice(regs+32,regs+128),preserved,"CPUID preserves the other twelve registers");
        assert.equal(get(flags),0xAD7n);assert.equal(get(rip),4098n);assert.equal(get(halted),0n);
        if(leaf===0) {
          const vendor=Buffer.alloc(12);
          [actual[1],actual[3],actual[2]].forEach((n,i)=>vendor.writeUInt32LE(Number(n),i*4));
          assert.equal(vendor.toString(),"GenuineIntel","architectural EBX/EDX/ECX vendor order");
        }
        if(leaf===1)assert.equal(Number(actual[1]>>8n&255n)*8,64,"SysGlblsInit cache-line expression");
        cases++;
      }
    //BootDVD's 32-bit-register capability decision, executed in this long-mode
    //engine. This does not exercise its 16-bit BIOS loader or a DVD cold boot.
    bytes.set([0xB8,0,0,0,0x80,0x0F,0xA2,0x3D,1,0,0,0x80,0x72,13,
      0xB8,1,0,0,0x80,0x0F,0xA2,0x0F,0xBA,0xE2,29,0x72,6,
      0xB8,0,0,0,0,0xF4,0xB8,1,0,0,0,0xF4],base+4096);
    ex.IdBegin(BigInt(cores),0n,0n);
    for(let step=0;!get(halted)&&step<20;step++)ex.Step();
    assert.equal(get(halted),1n);assert.equal(get(regs),1n,"BootDVD accepts the advertised long-mode CPU");
  }
}
console.log(`${cases} CPUID states: vendor/order, named feature subset, topology, subleaf/high-input handling, unchanged flags/registers and BootDVD capability decision pass.`);
