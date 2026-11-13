U64 cpuid_done,cpuid_bad;

U0 CpuIdWork(I64)
{
  I64 core=Gs->num;
  U8 vendor[16];
  CRAXRBCRCXRDX r;
  CPUId(0,&r);
  MemCpy(vendor,&r.rbx,4);MemCpy(vendor+4,&r.rdx,4);
  MemCpy(vendor+8,&r.rcx,4);vendor[12]=0;
  if (r.rax!=1 || StrCmp(vendor,"GenuineIntel"))
    LBts(&cpuid_bad,core);
  CPUId(1,&r);
  if (r.rbx.u8[1]*8!=64 || r.rbx.u8[2]!=mp_cnt ||
	r.rbx.u8[3]!=core || r.rcx || r.rdx&~(1<<28)!=0x1008331)
    LBts(&cpuid_bad,core);
  if (Bt(&r.rdx,28) ^^ mp_cnt>1)
    LBts(&cpuid_bad,core);
  CPUId(0x80000000,&r);
  if (r.rax!=0x80000001) LBts(&cpuid_bad,core);
  CPUId(0x80000001,&r);
  if (r.rax || r.rbx || r.rcx || r.rdx!=1<<29)
    LBts(&cpuid_bad,core);
  LBts(&cpuid_done,core);
}

U0 CpuIdGuest()
{//Run the stock CPUId wrapper on every actual guest core.
  I64 i;
  cpuid_done=cpuid_bad=0;
  for (i=1;i<mp_cnt;i++) Spawn(&CpuIdWork,NULL,,i);
  CpuIdWork(0);
  while (cpuid_done!=1<<mp_cnt-1) Yield;
  if (cpuid_bad) throw('CPUId',TRUE);
}

CpuIdGuest;
