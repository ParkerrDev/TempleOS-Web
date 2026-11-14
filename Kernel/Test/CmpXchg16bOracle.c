#include <cpuid.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#define RUN(prefix) __asm__ volatile("pushq %[initial]; popfq; " prefix "cmpxchg16b (%[ptr]); pushfq; popq %[flags]" : "+a"(ax),"+d"(dx),"+b"(bx),"+c"(cx),[flags] "=r"(flags),"+m"(value) : [ptr] "r"(value),[initial] "r"(initial) : "cc","memory")
int main(void)
{
  unsigned a,b,c,d;
  __cpuid_count(1,0,a,b,c,d);
  if(!(c&(1U<<13)))return 2;
  uint64_t values[]={0,1,UINT64_C(0xFEDCBA9876543210),UINT64_MAX};
  for(int lock=0;lock<2;lock++)for(int v=0;v<4;v++)for(int h=0;h<4;h++)
    for(int arg=0;arg<4;arg++)for(int match=0;match<3;match++)for(int f=0;f<2;f++) {
      _Alignas(16) uint64_t value[2]={values[v],values[h]};
      uint64_t ax=value[0],dx=value[1],bx=values[arg],cx=~values[arg],initial=f?0xAD7:0x202,flags;
      if(match==1)ax^=1;
      if(match==2)dx^=1;
      printf("%d %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " ",lock,value[0],value[1],ax,dx,bx,cx,initial);
      if(lock){RUN("lock ");}else{RUN("");}
      printf("%016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 "\n",value[0],value[1],ax,dx,bx,cx,flags&0xED5);
    }
  return 0;
}
