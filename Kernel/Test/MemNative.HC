U8 *mem;
U64 mem_size=8192,hpet_ctr=0x123456789ABCDEFF,
      g_icr_high[8],g_ipi_pending[8];
I64 g_ncore=4,mem_core;

I64 MemCore()
{
  return mem_core;
}

//Supply the host's core ID while testing every slot on one native CPU.
#define MyCore MemCore
#include "Mem"

U0 MemProbe()
{
  I64 width,a,k,dest,mode;
  U64 alias=0x10000000000,value=0xFEDCBA9876543210;
  mem=MAlloc(mem_size+16);
  for (width=1;width<=8;width*=2)
    for (a=0;a<16;a++) {
      MemSet(mem,0xA5,mem_size+16);
      WrMem(a,width,value);
      "%016X %016X %016X\n",RdMem(a,width),
	    RdMem(alias+a,width),RdMem(a+width,1);
      WrMem(alias+mem_size-1,width,value);
      "%016X %016X\n",RdMem(mem_size-1,width),
	    RdMem(alias+mem_size-1,width);
    }
  for (mem_core=0;mem_core<4;mem_core++) {
    "%016X %016X %016X %016X %016X\n",
	  RdMem(0xFEE00020,4),RdMem(0xFEE00030,4),
	  RdMem(0xFED000F0,8),RdMem(0xFED000F8,4),
	  RdMem(0xFEE00200,4);
    for (dest=0;dest<6;dest++)
      for (mode=0;mode<8;mode++) {
	for (k=0;k<8;k++)
	  g_ipi_pending[k]=0x1122334455667788;
	WrMem(0xFEE00310,4,dest<<24);
	WrMem(0xFEE00300,4,mode<<8|0x5A);
	"%016X %016X %016X %016X\n",g_ipi_pending[0],
	      g_ipi_pending[1],g_ipi_pending[2],g_ipi_pending[3];
      }
  }
  Free(mem);
}
MemProbe;
