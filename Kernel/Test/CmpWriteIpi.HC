U64 cmp_ipi_cnt;

interrupt U0 CmpIpiInt()
{
  cmp_ipi_cnt++;
  *(dev.uncached_alias+LAPIC_EOI)(U32 *)=0;
}

asm {
_CMP_IPI::
  PUSH RBP
  MOV RBP,RSP
  PUSH RDI
  PUSH RCX
  MOV RDI,SF_ARG1[RBP]
  MOV EAX,0
  MOV ECX,0xE2
  CMPXCHG U32 [RDI],ECX
  POP RCX
  POP RDI
  POP RBP
  RET1 8
}

_extern _CMP_IPI U64 CmpIpi(U32 *addr);

U0 CmpIpiProbe()
{//Failed compare must resend the prior APIC command through its write cycle.
  U64 old_gate[2],old_high,observed,prior,res;
  U32 *low=dev.uncached_alias+LAPIC_ICR_LOW,
	*high=dev.uncached_alias+LAPIC_ICR_HIGH;
  I64 i;
  MemCpy(old_gate,dev.idt+0xE1*2,16);
  old_high=*high;
  cmp_ipi_cnt=0;
  IntEntrySet(0xE1,&CmpIpiInt);
  *high=*(dev.uncached_alias+LAPIC_APIC_ID)(U32 *);
  *low=0xE1;
  for (i=0;i<1000 && !cmp_ipi_cnt;i++) Sleep(1);
  prior=cmp_ipi_cnt;
  observed=*low;
  res=CmpIpi(low);
  for (i=0;i<1000 && cmp_ipi_cnt<2;i++) Sleep(1);
  MemCpy(dev.idt+0xE1*2,old_gate,16);
  *high=old_high;
  "%016X %016X %016X %016X\n",prior,observed,res,cmp_ipi_cnt;
}

CmpIpiProbe;
