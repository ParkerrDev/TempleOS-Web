/* Exact x86 bit-string encodings; build with cc -O2 -mno-red-zone. */
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#define REG(insn,reg) __asm__ volatile("pushq %[initial]; popfq; " insn " " reg ",(%[ptr]); pushfq; popq %[flags]" : [flags] "=r"(flags) : [bit] "r"(bit),[ptr] "r"(mem+64),[initial] "r"(initial) : "cc","memory")
#define IMMV(insn,n) __asm__ volatile("pushq %[initial]; popfq; " insn " $" #n ",(%[ptr]); pushfq; popq %[flags]" : [flags] "=r"(flags) : [ptr] "r"(mem+64),[initial] "r"(initial) : "cc","memory")
#define IMM_CASE(insn,n) case n:IMMV(insn,n);break;
#define IMM(insn) switch(bit) {IMM_CASE(insn,0) IMM_CASE(insn,1) IMM_CASE(insn,15) IMM_CASE(insn,16) IMM_CASE(insn,31) IMM_CASE(insn,32) IMM_CASE(insn,63) IMM_CASE(insn,64) IMM_CASE(insn,127) IMM_CASE(insn,128) IMM_CASE(insn,255)}
#define WIDTH(insn) switch(size) {case 2:if(mode) {IMM(insn "w");} else {REG(insn "w","%w[bit]");} break;case 4:if(mode) {IMM(insn "l");} else {REG(insn "l","%k[bit]");} break;case 8:if(mode) {IMM(insn "q");} else {REG(insn "q","%[bit]");} break;}
int main(void)
{
  int64_t regbits[]={-257,-129,-65,-64,-33,-32,-17,-16,-1,0,1,15,16,31,32,63,64,127,128,255,257};
  int64_t immbits[]={0,1,15,16,31,32,63,64,127,128,255};
  for(int size=2;size<=8;size*=2)
    for(int op=0;op<4;op++)
      for(int mode=0;mode<2;mode++)
        for(unsigned n=0;n<(mode?sizeof(immbits)/sizeof(*immbits):sizeof(regbits)/sizeof(*regbits));n++)
          for(int f=0;f<2;f++) {
            uint8_t mem[128];
            for(int i=0;i<128;i++)mem[i]=(i*29+f*137)&255;
            int64_t bit=mode?immbits[n]:regbits[n];
            uint64_t initial=f?0xAD7:0x202,flags;
            switch(op) {case 0:WIDTH("bt");break;case 1:WIDTH("bts");break;case 2:WIDTH("btr");break;case 3:WIDTH("btc");break;}
            printf("%d %d %d %" PRId64 " %d %" PRIx64 " ",size,op,mode,bit,f,flags&0x41);
            for(int i=0;i<128;i++)printf("%02x",mem[i]);
            puts("");
          }
  return 0;
}
