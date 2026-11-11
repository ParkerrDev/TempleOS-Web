// QEMU's stopped long-mode register text is the input contract, not a saved task's FXSAVE area.
import {createHash} from "node:crypto";

const names=["RAX","RCX","RDX","RBX","RSP","RBP","RSI","RDI",
  "R8","R9","R10","R11","R12","R13","R14","R15"];
const hex=n=>"0x"+BigInt("0x"+n).toString(16).toUpperCase();

export function RegsRead(raw,count)
{
  if (count!==1 && count!==4) throw Error("Stock captures support one or four CPUs");
  const headers=[...raw.matchAll(/CPU#(\d+)/g)];
  if (headers.length!==count || headers.some((m,i)=>Number(m[1])!==i))
    throw Error("Missing, reordered or unsupported CPU topology");
  const cores=headers.map((header,index)=>{
    const text=raw.slice(header.index+header[0].length,headers[index+1]?.index);
    const match=re=>{const m=text.match(re);if(!m)throw Error(`CPU${index}: missing ${re}`);return m;};
    const value=name=>hex(match(new RegExp(`\\b${name}\\s*=([0-9a-f]+)\\b`,"i"))[1]);
    const segment=name=>{
      const m=match(new RegExp(`\\b${name}\\s*=([0-9a-f]+)\\s+([0-9a-f]+)\\s+`,"i"));
      return {selector:hex(m[1]),base:hex(m[2])};
    };
    const table=name=>{
      const m=match(new RegExp(`\\b${name}=\\s+([0-9a-f]+)\\s+([0-9a-f]+)`,"i"));
      return {base:hex(m[1]),limit:hex(m[2])};
    };
    const fpu=match(/FCW=([0-9a-f]+) FSW=([0-9a-f]+) \[ST=(\d+)\] FTW=([0-9a-f]+) MXCSR=([0-9a-f]+)/i);
    const cw=parseInt(fpu[1],16),sw=parseInt(fpu[2],16),top=Number(fpu[3]),tags=parseInt(fpu[4],16),mxcsr=parseInt(fpu[5],16);
    if (cw>65535 || sw>65535 || top>7 || top!==(sw>>11&7)) throw Error("Inconsistent x87 control/status/TOP");
    // HEMU has F64 slots, not architectural 80-bit slots or a tag register.
    // Only an empty live stack can be resumed without losing occupied values.
    if (tags!==0) throw Error("Occupied x87 stack is not representable by this stock capture format");
    if (sw&0x8080) throw Error("Pending x87 exception is not a quiescent capture");
    if (mxcsr!==0x1F80) throw Error("Unsupported MXCSR state");
    const fpr=Array.from({length:8},(_,i)=>{
      const m=match(new RegExp(`\\bFPR${i}=([0-9a-f]{16}) ([0-9a-f]{4})\\b`,"i"));
      return {significand:hex(m[1]),signExponent:hex(m[2])};
    });
    const xmm=Array.from({length:16},(_,i)=>{
      const m=match(new RegExp(`\\bXMM${String(i).padStart(2,"0")}=([0-9a-f]{16}) ([0-9a-f]{16})\\b`,"i"));
      return {hi:hex(m[1]),lo:hex(m[2])};
    });
    const core={regs:names.map(value),rip:value("RIP"),rfl:value("RFL"),
      cr0:value("CR0"),cr3:value("CR3"),cr4:value("CR4"),efer:value("EFER"),
      fs:segment("FS"),gs:segment("GS"),cs:segment("CS"),ss:segment("SS"),
      gdt:table("GDT"),idt:table("IDT"),cw:hex(fpu[1]),sw:hex(fpu[2]),top,tags,mxcsr,fpr,xmm};
    if (!/CPL=0\b/.test(text) || !/CS64\b/.test(text) || !/HLT=1\b/.test(text) ||
        !/II=0\b/.test(text) || !/SMM=0\b/.test(text) || !/A20=1\b/.test(text))
      throw Error("Capture requires halted ring-zero long mode without an interrupt shadow");
    if (!(BigInt(core.efer)&0x400n) || core.cs.base!=="0x0" || core.ss.base!=="0x0")
      throw Error("Unsupported non-flat long-mode state");
    return core;
  });
  for(const core of cores.slice(1)) for(const field of ["cr0","cr3","cr4","efer","cs","ss","gdt","idt"])
    if(JSON.stringify(core[field])!==JSON.stringify(cores[0][field])) throw Error(`Per-core ${field} is not shared`);
  return {cores,registerSha256:createHash("sha256").update(raw).digest("hex")};
}

export function RegsSource(capture)
{
  const {cores,registerSha256}=capture,lines=["//Stopped native registers SHA-256:",`//${registerSha256}`,
    "//Empty x87 slots have no live value; provenance retains their raw payloads.","U0 SetSnapRegs()","{",`  g_ncore=${cores.length};`];
  cores.forEach((c,k)=>{
    const p=`g_cpu_st[${k}]`;
    c.regs.forEach((v,i)=>lines.push(`  ${p}.f_reg[${i}]=${v};`));
    for(const [name,value] of Object.entries({rip:c.rip,rfl:c.rfl,halted:1,msr_fsbase:c.fs.base,
      msr_gsbase:c.gs.base,x87_cw:c.cw,x87_sw:c.sw,fsp:c.top})) lines.push(`  ${p}.f_${name}=${value};`);
    for(let i=0;i<8;i++)lines.push(`  ${p}.f_fpr[${i}]=0.0;`);
    c.xmm.forEach((v,i)=>lines.push(`  g_xmm_lo[${k}][${i}]=${v.lo};`,`  g_xmm_hi[${k}][${i}]=${v.hi};`));
  });
  const c=cores[0];
  lines.push(`  cr0=${c.cr0}; cr3=${c.cr3}; cr4=${c.cr4}; msr_efer=${c.efer};`,
    `  gdtr_base=${c.gdt.base}; gdtr_limit=${c.gdt.limit};`,
    `  idtr_base=${c.idt.base}; idtr_limit=${c.idt.limit};`,
    `  g_cs=${c.cs.selector}; g_ss=${c.ss.selector}; icount=0; g_badop=0;`,
    "  pic1_base=0x20; pic2_base=0x28;",
    "  pic1_mask=0xF8; pic2_mask=0xEF;",
    "  pic1_irr=pic2_irr=pic1_isr=pic2_isr=0;",
    "  pit_reload=pit_div=pit_counter=1192;",
    "  tsc=irq_count=hpet_ctr=rtc_idx=0;","}","");
  return lines.join("\n");
}
