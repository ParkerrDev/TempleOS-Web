/* Independent x86 masked integer-store oracle. No HEMU/compiler code runs here. */
#include <stdint.h>
#include <stdio.h>
#include <math.h>

#define STORE(insn) __asm__ volatile("fninit; fldcw %2; fldl %3; " insn " %0; fnstsw %1" : "+m"(out),"=m"(sw) : "m"(cw),"m"(value) : "st")
int main(void)
{
  double values[]={0.0,-0.0,0.49,-0.49,0.5,-0.5,1.5,-1.5,2.5,-2.5,2.9,-2.9,
    32767.4,32767.5,32767.9,32768.0,-32768.4,-32768.5,-32768.9,-32769.0,
    2147483647.4,2147483647.5,2147483647.9,2147483648.0,-2147483648.9,
    0x1p63-1024.0,0x1p63,-0x1p63,-0x1p63-2048.0,1e30,-1e30,INFINITY,-INFINITY,NAN};
  for (unsigned i=0;i<sizeof(values)/sizeof(*values);i++)
    for (int rc=0;rc<4;rc++)
      for (int size=2;size<=8;size*=2)
        for (int trunc=0;trunc<2;trunc++) {
          double value=values[i];
          uint16_t cw=0x37F|(rc<<10),sw;
          union {double d;uint64_t u;} bits={value};
          uint64_t out=0;
          if (trunc) {
            if(size==2) STORE("fisttps");
            if(size==4) STORE("fisttpl");
            if(size==8) STORE("fisttpll");
          } else {
            if(size==2) STORE("fistps");
            if(size==4) STORE("fistpl");
            if(size==8) STORE("fistpll");
          }
          printf("%016llx %d %d %d %016llx %x\n",(unsigned long long)bits.u,rc,size,trunc,(unsigned long long)out,sw&0x221);
        }
  __asm__ volatile("fninit");
  return 0;
}
