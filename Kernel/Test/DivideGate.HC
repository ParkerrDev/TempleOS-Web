#include "DivideEntry"

U64 divide_gate_res[9];

U0 DivideGate()
{//Hardware faults ignore gate DPL and selector RPL; loading CS sets A.
  U64 old_gate[2],old_code=sys_gdt.cs64.lo,flags=GetRFlags,before,after;
  U8 code[4],*sp,*idt=dev.idt;
  I64 test;
  MemCpy(old_gate,dev.idt,16);
  code[0]=0x48;code[1]=0xF7;code[2]=0xF1;code[3]=0xC3;
  for (test=0;test<3;test++) {
    SetRFlags(flags&~0x200);
    IntEntrySet(I_DIV_ZERO,DIVIDE_ENTRY);
    if (test==0) idt[5]|=0x60;
    if (test==1) idt[2]|=3;
    sys_gdt.cs64.lo=old_code&~(1(U64)<<40);
    before=sys_gdt.cs64.lo;
    divide_record[10]=code+3;
    sp=(divide_stack+4000)(U64)&~15;
    DivideRun(divide_record,sp,code,23,0,0,2);
    after=sys_gdt.cs64.lo;
    MemCpy(dev.idt,old_gate,16);
    sys_gdt.cs64.lo=old_code;
    SetRFlags(flags);
    divide_gate_res[test*3]=before;
    divide_gate_res[test*3+1]=after;
    divide_gate_res[test*3+2]=divide_record[6];
    "%d %016X %016X %016X\n",test,before,after,divide_record[6];
  }
}

DivideGate;
