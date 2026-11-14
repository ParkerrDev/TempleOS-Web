/* Original x86-64 memory RMW results; build with cc -O2 -mno-red-zone. */
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#define RUN(insn,reg) __asm__ volatile("pushq %[initial]; popfq; " insn " " reg ",(%[ptr]); pushfq; popq %[flags]" : [rhs] "+d"(rhs),[acc] "+a"(acc),[flags] "=r"(flags),"+m"(value) : [ptr] "r"(&value),[initial] "r"(initial) : "cc","memory")
#define BINARY(insn) switch(size) {case 1:RUN(insn "b","%b[rhs]");break;case 2:RUN(insn "w","%w[rhs]");break;case 4:RUN(insn "l","%k[rhs]");break;case 8:RUN(insn "q","%[rhs]");break;}
#define ONE(insn) __asm__ volatile("pushq %[initial]; popfq; " insn " (%[ptr]); pushfq; popq %[flags]" : [flags] "=r"(flags),"+m"(value) : [ptr] "r"(&value),[initial] "r"(initial) : "cc","memory")
#define UNARY(insn) switch(size) {case 1:ONE(insn "b");break;case 2:ONE(insn "w");break;case 4:ONE(insn "l");break;case 8:ONE(insn "q");break;}
int main(void)
{
  for(int size=1;size<=8;size*=2) {
    uint64_t mask=UINT64_MAX>>(64-size*8),sign=UINT64_C(1)<<(size*8-1);
    uint64_t values[]={0,1,15,16,sign-1,sign,mask-1,mask,UINT64_C(0xFEDCBA9876543210)};
    for(int op=0;op<14;op++)
      for(unsigned v=0;v<sizeof(values)/sizeof(*values);v++)
        for(unsigned a=0;a<(op>=7&&op<=10?1:sizeof(values)/sizeof(*values));a++)
          for(int f=0;f<2;f++) {
            uint64_t value=values[v],rhs=values[a],acc=f?value:~value,
              initial=f?0xAD7:0x202,flags;
            printf("%d %d %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %" PRIx64 " ",size,op,value,rhs,acc,initial);
            switch(op) {
              case 0:BINARY("lock add");break;
              case 1:BINARY("lock or");break;
              case 2:BINARY("lock adc");break;
              case 3:BINARY("lock sbb");break;
              case 4:BINARY("lock and");break;
              case 5:BINARY("lock sub");break;
              case 6:BINARY("lock xor");break;
              case 7:UNARY("lock inc");break;
              case 8:UNARY("lock dec");break;
              case 9:UNARY("lock not");break;
              case 10:UNARY("lock neg");break;
              case 11:BINARY("xchg");break;
              case 12:BINARY("lock xadd");break;
              case 13:BINARY("lock cmpxchg");break;
            }
            printf("%016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %" PRIx64 "\n",value,rhs,acc,flags&0xED5);
          }
  }
  return 0;
}
