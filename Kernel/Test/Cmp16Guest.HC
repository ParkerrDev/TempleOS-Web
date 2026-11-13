asm {
_CMP16_INC::
  PUSH RBP
  MOV RBP,RSP
  PUSH RBX
  PUSH RDI
  PUSH RDX
  PUSH RCX
  MOV RDI,SF_ARG1[RBP]
@@1:
  MOV RAX,U64 [RDI]
  MOV RDX,U64 8[RDI]
  LEA RBX,1[RAX]
  MOV RCX,RBX
  NOT RCX
  DU8 0xF0,0x48,0x0F,0xC7,0x0F;
  JNZ @@1
  POP RCX
  POP RDX
  POP RDI
  POP RBX
  POP RBP
  RET1 8
}

_extern _CMP16_INC U0 Cmp16Inc(U64 *value);

U64 cmp16_done;

U0 Cmp16Work(U64 *value)
{
  I64 i;
  for (i=0;i<256;i++) {
    Cmp16Inc(value);
    if (!(i&31)) Yield;
  }
  LBts(&cmp16_done,Gs->num);
}

U0 Cmp16Guest()
{//Every successful exchange increments a complementary 128-bit pair.
  I64 i;
  U8 *buf=MAlloc(32);
  U64 *value=(buf+15)(U64)&~15;
  cmp16_done=0;value[0]=0;value[1]=-1;
  for (i=1;i<mp_cnt;i++) Spawn(&Cmp16Work,value,,i);
  Cmp16Work(value);
  while (cmp16_done!=1<<mp_cnt-1) Yield;
  if (value[0]!=256*mp_cnt || value[1]!=~value[0])
    throw('Cmp16Cnt',TRUE);
  Free(buf);
}

Cmp16Guest;
