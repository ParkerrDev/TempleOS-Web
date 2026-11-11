/* Actual x86 instructions; the fixtures do not call HEMU. */
#include <stdint.h>
#include <stdio.h>

#define MOVE(insn) __asm__ volatile( \
  "fninit; fldl %3; fldl %2; pushq %4; popfq; " insn "; pushfq; popq %1; fstpl %0" \
  : "=m"(res),"=r"(flags) : "m"(a),"m"(b),"r"(seed) : "cc","memory","st","st(1)")
#define ICOMP(insn,value) __asm__ volatile( \
  "fninit; fldl %1; " insn " %2; fnstsw %0" \
  : "=m"(sw) : "m"(a),"m"(value) : "memory","st")
int main(void)
{
  const double a=1.25,b=-3.5;
  for(int op=0;op<8;op++)for(int bits=0;bits<8;bits++) {
    uint64_t flags,seed=0xA92|(bits&1)|((bits&2)<<1)|((bits&4)<<4);
    union {double d;uint64_t bits;} res;
    switch(op) {
      case 0: MOVE("fcmovb %%st(1),%%st"); break;
      case 1: MOVE("fcmove %%st(1),%%st"); break;
      case 2: MOVE("fcmovbe %%st(1),%%st"); break;
      case 3: MOVE("fcmovu %%st(1),%%st"); break;
      case 4: MOVE("fcmovnb %%st(1),%%st"); break;
      case 5: MOVE("fcmovne %%st(1),%%st"); break;
      case 6: MOVE("fcmovnbe %%st(1),%%st"); break;
      default: MOVE("fcmovnu %%st(1),%%st"); break;
    }
    printf("MOVE %d %llx %016llx %llx\n",op,(unsigned long long)seed,
      (unsigned long long)res.bits,(unsigned long long)flags);
  }
  for(int n=0;n<8;n++) {
    uint16_t before,after;
    __asm__ volatile("fninit; fldz; fldz; fdivp" ::: "st","st(1)");
    for(int i=0;i<n;i++)__asm__ volatile("fincstp");
    __asm__ volatile("fnstsw %0; fnclex; fnstsw %1" : "=m"(before),"=m"(after));
    printf("STATUS %d %x %x\n",(7+n)&7,before,after);
  }
  for(int width=2;width<=4;width+=2)for(int pop=0;pop<2;pop++)
    for(int x=-5;x<=5;x+=5)for(int y=-2;y<=2;y+=2) {
      double a=x;int16_t small=y;int32_t big=y;uint16_t sw;
      if(width==2) {if(pop) ICOMP("ficomps",small); else ICOMP("ficoms",small);}
      else {if(pop) ICOMP("ficompl",big); else ICOMP("ficoml",big);}
      printf("ICOMP %d %d %d %d %x\n",width,pop,x,y,sw);
    }
  __asm__ volatile("fninit");
}
