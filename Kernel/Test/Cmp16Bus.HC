U0 BusPrep()
{//Pause the pair after its first write while another core tries two stores.
  I64 i;
  MemSet(g_cpu_st,0,sizeof(g_cpu_st));
  for (i=0;i<NCORES;i++) {
    g_cpu_st[i].f_reg[7]=0x3000;
    g_cpu_st[i].f_rip=4096+i*256;
    g_cpu_st[i].f_rfl=0x202;
  }
  g_cpu_st[0].f_reg[0]=1;g_cpu_st[0].f_reg[2]=2;
  g_cpu_st[0].f_reg[3]=5;g_cpu_st[0].f_reg[1]=6;
  g_ncore=NCORES;
  *(mem+0x3000)(U64 *)=1;*(mem+0x3008)(U64 *)=2;
  mem[4096]=0xF0;mem[4097]=0x48;mem[4098]=0x0F;
  mem[4099]=0xC7;mem[4100]=0x0F;
  mem[4352]=0x48;mem[4353]=0xC7;mem[4354]=7;
  *(mem+4355)(U32 *)=10;
  mem[4359]=0x48;mem[4360]=0xC7;mem[4361]=0x47;
  mem[4362]=8;*(mem+4363)(U32 *)=20;mem[4367]=0xF4;
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
