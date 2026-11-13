asm {
_BUS_INC::
  PUSH RBP
  MOV RBP,RSP
  MOV RAX,SF_ARG1[RBP]
  LOCK INC U64 [RAX]
  POP RBP
  RET1 8
}

_extern _BUS_INC U0 BusInc(U64 *value);

U64 bus_done;

U0 BusWork(U64 *value)
{
  I64 i;
  for (i=0;i<256;i++) {
    BusInc(value);
    if (!(i&31)) Yield;
  }
  LBts(&bus_done,Gs->num);
}

U0 BusGuest()
{//The same unaligned locked counter runs on all four TempleOS CPUs.
  I64 i;
  U8 *buf=MAlloc(192),*p=(buf+64)(U64)&~63;
  U64 *value=p+63;
  bus_done=0;*value=0;
  for (i=1;i<4;i++) Spawn(&BusWork,value,,i);
  BusWork(value);
  while (bus_done!=15) Yield;
  if (*value!=1024) throw('BusCnt',TRUE);
  Free(buf);
}

BusGuest;
