/* x86 CMPXCHG8B register and flag results; cc -O2 -mno-red-zone. */
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#define RUN(prefix) __asm__ volatile("pushq %[initial]; popfq; " prefix "cmpxchg8b (%[ptr]); pushfq; popq %[flags]" : "+a"(ax),"+d"(dx),"+b"(bx),"+c"(cx),[flags] "=r"(flags),"+m"(value) : [ptr] "r"(&value),[initial] "r"(initial) : "cc","memory")
int main(void)
{
  uint64_t values[]={0,1,UINT64_C(0xFEDCBA9876543210),UINT64_MAX};
  for(int lock=0;lock<2;lock++)
    for(int v=0;v<4;v++)
      for(int a=0;a<4;a++)
        for(int match=0;match<2;match++)
          for(int high=0;high<2;high++)
            for(int f=0;f<2;f++) {
              uint64_t value=values[v],ax=(uint32_t)value,dx=value>>32,
                bx=values[a],cx=~values[a],initial=f?0xAD7:0x202,flags;
              if(!match)ax^=1;
              if(high){ax|=UINT64_C(0x1234567800000000);dx|=UINT64_C(0x8765432100000000);}
              printf("%d %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %" PRIx64 " ",lock,value,ax,dx,bx,cx,initial);
              if(lock){RUN("lock ");}else{RUN("");}
              printf("%016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %" PRIx64 "\n",value,ax,dx,bx,cx,flags&0xED5);
            }
  return 0;
}
