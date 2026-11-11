#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define RUN(insn,reg) __asm__ volatile("pushq %[initial]; popfq; " insn " " reg ",(%[ptr]); pushfq; popq %[flags]" : [rhs] "+d"(rhs),[acc] "+a"(acc),[flags] "=r"(flags) : [ptr] "r"(ptr),[initial] "r"(initial) : "cc","memory")
#define BINARY(insn) switch(size) {case 2:RUN(insn "w","%w[rhs]");break;case 4:RUN(insn "l","%k[rhs]");break;case 8:RUN(insn "q","%[rhs]");break;}
#define ONE(insn) __asm__ volatile("pushq %[initial]; popfq; " insn " (%[ptr]); pushfq; popq %[flags]" : [flags] "=r"(flags) : [ptr] "r"(ptr),[initial] "r"(initial) : "cc","memory")
#define UNARY(insn) switch(size) {case 2:ONE(insn "w");break;case 4:ONE(insn "l");break;case 8:ONE(insn "q");break;}

int main(void)
{
  _Alignas(64) uint8_t buf[256];
  uint8_t *base=buf+64;
  for(int size=2;size<=8;size*=2)for(int op=0;op<=14;op++)if(op<14||size==8)
    for(int offset=7;offset<=31;offset=offset*2+1)for(int seed=0;seed<3;seed++) {
      uint64_t mask=UINT64_MAX>>(64-size*8),sign=UINT64_C(1)<<(size*8-1),
        value=seed==1?sign-1:seed==2?mask:0,rhs=seed==1?1:seed==2?0x12345678&mask:mask,
        acc=seed==2?value:~value,bx=UINT64_C(0x0123456789ABCDEF),cx=UINT64_C(0xFEDCBA9876543210),
        initial=seed==1?0xAD7:0x202,flags;
      uint8_t *ptr=base+offset;
      memset(buf,0xA5,sizeof(buf));
      for(int i=0;i<128;i++)base[i]=i*29+seed*137;
      memcpy(ptr,&value,8);
      if(op==14){acc=UINT64_C(0xA123456700000000)|(acc&0xFFFFFFFF);rhs=UINT64_C(0xD123456700000000)|(value>>32);}
      switch(op) {
        case 0:BINARY("lock add");break;case 1:BINARY("lock or");break;
        case 2:BINARY("lock adc");break;case 3:BINARY("lock sbb");break;
        case 4:BINARY("lock and");break;case 5:BINARY("lock sub");break;
        case 6:BINARY("lock xor");break;case 7:UNARY("lock inc");break;
        case 8:UNARY("lock dec");break;case 9:UNARY("lock not");break;
        case 10:UNARY("lock neg");break;case 11:BINARY("xchg");break;
        case 12:BINARY("lock xadd");break;case 13:BINARY("lock cmpxchg");break;
        case 14:__asm__ volatile("pushq %[initial]; popfq; lock cmpxchg8b (%[ptr]); pushfq; popq %[flags]"
          : "+a"(acc),"+d"(rhs),"+b"(bx),"+c"(cx),[flags] "=r"(flags)
          : [ptr] "r"(ptr),[initial] "r"(initial):"cc","memory");break;
      }
      printf("%d %d %d %d %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " ",
        size,op,offset,seed,acc,rhs,bx,cx,flags&(op==1||op==4||op==6?0xEC5:0xED5));
      for(int i=-8;i<16;i++)printf("%02X",ptr[i]);
      putchar('\n');
    }
  return 0;
}
