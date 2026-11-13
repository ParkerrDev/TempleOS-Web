#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#define MEM(op) __asm__ volatile("pushq %[initial]; popfq; " op " (%[ptr]); pushfq; popq %[flags]" : "+a"(ax),"+d"(dx),"+b"(bx),"+c"(cx),[flags] "=r"(flags),"+m"(value) : [ptr] "r"(&value),[initial] "r"(initial) : "cc","memory")
#define REG(op) __asm__ volatile("pushq %[initial]; popfq; " op "; pushfq; popq %[flags]" : "+a"(ax),"+d"(dx),"+b"(bx),"+c"(cx),[flags] "=r"(flags) : [initial] "r"(initial) : "cc")
int main(void)
{
  for(int kind=0;kind<3;kind++)for(int size=1;size<=8;size*=2)if(kind<2||size==8)
    for(int v=0;v<2;v++)for(int match=0;match<2;match++)for(int seed=0;seed<2;seed++) {
      uint64_t value=v?0xD123456789ABCDEFULL:0,mask=UINT64_MAX>>(64-size*8),
        ax=(0xA123456789ABCDEFULL&~mask)|(value&mask),dx=0xD1234567ABCDEF01ULL,
        bx=0xB1234567AABBCCDDULL,cx=0xC123456788776655ULL,initial=seed?0xAD7:0x202,flags;
      if(kind==1)dx=value;
      if(kind==2){ax=0xA123456700000000ULL|(uint32_t)value;dx=0xD123456700000000ULL|(value>>32);}
      if(!match)ax^=1;
      printf("%d %d %d %d %d %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " ",kind,size,v,match,seed,value,ax,dx,bx,cx,initial);
      if(kind==2){MEM("cmpxchg8b");}
      else if(kind==1)switch(size) {
        case 1:REG("cmpxchgb %%cl,%%dl");break;case 2:REG("cmpxchgw %%cx,%%dx");break;
        case 4:REG("cmpxchgl %%ecx,%%edx");break;case 8:REG("cmpxchgq %%rcx,%%rdx");break;
      } else switch(size) {
        case 1:MEM("cmpxchgb %%cl,");break;case 2:MEM("cmpxchgw %%cx,");break;
        case 4:MEM("cmpxchgl %%ecx,");break;case 8:MEM("cmpxchgq %%rcx,");break;
      }
      printf("%016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 " %016" PRIX64 "\n",value,ax,dx,bx,cx,flags&0xED5);
    }
  return 0;
}
