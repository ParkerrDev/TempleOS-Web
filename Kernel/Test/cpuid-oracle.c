#include <cpuid.h>
#include <stdio.h>
int main(void) {
  unsigned leaf[]={0,1,0x80000000,0x80000001,0x80000008};
  for(unsigned i=0;i<5;i++) {
    unsigned a,b,c,d;
    __cpuid_count(leaf[i],0,a,b,c,d);
    printf("%08X %08X %08X %08X %08X\n",leaf[i],a,b,c,d);
  }
  return 0;
}
