/* Physical COMISD/UCOMISD flags; MXCSR exceptions are masked. */
#include <stdint.h>
#include <stdio.h>
#define CMP(insn) __asm__ volatile( \
  "movq %1,%%xmm0; movq %2,%%xmm1; pushq %3; popfq; " insn " %%xmm1,%%xmm0; pushfq; popq %0" \
  : "=r"(flags) : "r"(values[i]),"r"(values[j]),"r"(seed) : "cc","xmm0","xmm1","memory")
int main(void)
{
  const uint64_t values[]={0,UINT64_C(0x8000000000000000),UINT64_C(0x3ff0000000000000),
    UINT64_C(0xbff0000000000000),UINT64_C(0x7ff0000000000000),UINT64_C(0xfff0000000000000),
    UINT64_C(0x7ff8000000000021),UINT64_C(0xfff8000000000021)};
  uint32_t mxcsr=0x1f80;
  __asm__ volatile("ldmxcsr %0"::"m"(mxcsr));
  for(int i=0;i<8;i++)for(int j=0;j<8;j++)for(int op=0;op<2;op++)for(int set=0;set<2;set++) {
    uint64_t seed=set?0xAD7:0x202,flags;
    if(op) {CMP("comisd");} else {CMP("ucomisd");}
    printf("%016llx %016llx %d %llx %llx\n",(unsigned long long)values[i],
      (unsigned long long)values[j],op,(unsigned long long)seed,(unsigned long long)(flags&0x8d5));
  }
  return 0;
}
