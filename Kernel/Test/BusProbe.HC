U0 BusPrep()
{//Two real x86 instructions with a field crossing an aligned word.
  I64 i;
  MemSet(g_cpu_st,0,sizeof(g_cpu_st));
  for (i=0;i<NCORES;i++) {
    g_cpu_st[i].f_reg[7]=0x3007;
    g_cpu_st[i].f_rip=4096+i*256;
    g_cpu_st[i].f_rfl=0x202;
  }
  g_ncore=NCORES;
  *(mem+0x3007)(U64 *)=1;
  mem[4096]=0xF0;mem[4097]=0x48;mem[4098]=0xFF;mem[4099]=7;
  mem[4352]=0x48;mem[4353]=0xC7;mem[4354]=7;
  *(mem+4355)(U32 *)=10;mem[4359]=0xF4;
}

U64 BusAddr(I64 which)
{
  switch (which) {
    case 0:return reg;
    case 1:return &rfl;
    case 2:return &rip;
    case 3:return &halted;
  }
  return 0;
}
