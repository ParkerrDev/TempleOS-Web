/* Original x86-64 shift/rotate results; build with cc -O2 -mno-red-zone. */
#include <stdint.h>
#include <stdio.h>

#define RUN(insn,arg) __asm__ volatile("pushq %3; popfq; " insn " %%cl," arg "; pushfq; popq %1" : "+a"(result),"=d"(flags) : "c"(count),"r"(initial) : "cc")
#define WIDTH(insn) switch(size) { case 1: RUN(insn "b","%b0"); break; case 2: RUN(insn "w","%w0"); break; case 4: RUN(insn "l","%k0"); break; case 8: RUN(insn "q","%0"); break; }
int main(void)
{
  uint64_t values[]={0,1,0xFEDCBA9876543210ULL,0xFFFFFFFFFFFFFFFFULL};
  unsigned counts[]={0,1,2,7,8,9,15,16,17,31,32,33,63,64,65,127,255};
  for(int size=1;size<=8;size*=2)
    for(int op=0;op<8;op++)
      if(op!=6)
        for(unsigned v=0;v<sizeof(values)/sizeof(*values);v++)
          for(unsigned c=0;c<sizeof(counts)/sizeof(*counts);c++)
            for(int f=0;f<2;f++) {
              uint64_t value=values[v],result=value,initial=f?0xAD7:0x202,flags;
              unsigned count=counts[c];
              switch(op) {
                case 0: WIDTH("rol"); break;
                case 1: WIDTH("ror"); break;
                case 2: WIDTH("rcl"); break;
                case 3: WIDTH("rcr"); break;
                case 4: WIDTH("shl"); break;
                case 5: WIDTH("shr"); break;
                case 7: WIDTH("sar"); break;
              }
              printf("%d %d %u %016llx %llx %016llx %llx\n",size,op,count,
                (unsigned long long)value,(unsigned long long)initial,
                (unsigned long long)result,(unsigned long long)(flags&0xED5));
            }
  return 0;
}
