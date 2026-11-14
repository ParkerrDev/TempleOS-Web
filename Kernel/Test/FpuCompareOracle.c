/* Original x86 instructions, independent of the interpreter and JIT. */
#include <stdint.h>
#include <stdio.h>
#include <signal.h>
#include <stdlib.h>

#define COMPARE(insn) __asm__ volatile( \
  "fninit; fldl %2; fldl %3; fnclex; fldcw %5; pushq %4; popfq; " insn "; pushfq; popq %0; fnstsw %1" \
  : "=r"(flags),"=m"(sw) : "m"(b.d),"m"(a.d),"r"(seed),"m"(cw) : "cc","memory","st","st(1)")
static void unexpected_fault(int sig){_Exit(128+sig);}
int main(void)
{
  signal(SIGFPE,unexpected_fault);
  const uint64_t values[]={0,UINT64_C(0x8000000000000000),UINT64_C(0x3ff0000000000000),
    UINT64_C(0xbff0000000000000),UINT64_C(0x7ff0000000000000),
    UINT64_C(0xfff0000000000000),UINT64_C(0x7ff8000000000021)};
  for(unsigned i=0;i<sizeof(values)/sizeof(*values);i++)
    for(unsigned j=0;j<sizeof(values)/sizeof(*values);j++)
      for(int op=0;op<4;op++)for(int masked=0;masked<2;masked++)for(int set=0;set<2;set++) {
        union {uint64_t bits;double d;} a={values[i]},b={values[j]};
        uint64_t flags,seed=set?0xAD7:0xA92;
        uint16_t sw,cw=0x37E|masked;
        switch(op) {
          case 0: COMPARE("fcomi %%st(1),%%st"); break;
          case 1: COMPARE("fucomi %%st(1),%%st"); break;
          case 2: COMPARE("fcomip %%st(1),%%st"); break;
          default: COMPARE("fucomip %%st(1),%%st"); break;
        }
        printf("%016llx %016llx %d %x %llx %llx %x %d\n",(unsigned long long)a.bits,
          (unsigned long long)b.bits,op,cw,(unsigned long long)seed,(unsigned long long)(flags&0x8D5),
          sw&0x8081,((sw>>11)&7)==7);
      }
  __asm__ volatile("fninit");
  return 0;
}
