I64 cpu_id_leaf[5]={0,1,0x80000000,0x80000001,0x80000008};

U0 CpuIdProbe()
{
  I64 i;
  CRAXRBCRCXRDX r;
  for (i=0;i<5;i++) {
    CPUId(cpu_id_leaf[i],&r);
    "%08X %08X %08X %08X %08X\n",cpu_id_leaf[i],r.rax,r.rbx,r.rcx,r.rdx;
  }
}
CpuIdProbe;
