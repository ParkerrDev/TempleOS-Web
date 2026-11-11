#define _GNU_SOURCE
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <signal.h>
#include <setjmp.h>
#include <ucontext.h>

static sigjmp_buf escape;
static volatile uint64_t fault_a,fault_d;
static uint64_t random_state=0xC39A4F8192756DB1ULL;
static uint64_t Random(void)
{
  random_state^=random_state<<13;random_state^=random_state>>7;
  random_state^=random_state<<17;
  return random_state;
}
static void DivideFault(int signal,siginfo_t *info,void *context)
{
  (void)signal;(void)info;
  ucontext_t *state=context;
  fault_a=state->uc_mcontext.gregs[REG_RAX];
  fault_d=state->uc_mcontext.gregs[REG_RDX];
  siglongjmp(escape,1);
}

#define ASM(insn) __asm__ volatile("pushq %[initial]; popfq; " insn "; pushfq; popq %[flags]" : "+a"(a),"+d"(d),[flags] "=r"(flags) : "c"(arg),[initial] "r"(initial) : "cc","memory")
#define WIDTH(insn) switch(size) {case 1:ASM(insn "b %%cl");break;case 2:ASM(insn "w %%cx");break;case 4:ASM(insn "l %%ecx");break;case 8:ASM(insn "q %%rcx");break;}
#define IMUL(source) switch(size) {case 2:ASM("imulw " source "%%cx,%%ax");break;case 4:ASM("imull " source "%%ecx,%%eax");break;case 8:ASM("imulq " source "%%rcx,%%rax");break;}
static void Row(int op,int size,int seed,uint64_t low,uint64_t high,uint64_t arg)
{
  volatile uint64_t a=low,d=high,flags=0,initial=seed?0xAD7:0x202;
  int fault=sigsetjmp(escape,1);
  if (!fault) {
    switch(op) {
      case 0:WIDTH("mul");break;
      case 1:WIDTH("imul");break;
      case 2:IMUL("");break;
      case 3:IMUL("$-3,");break;
      case 4:IMUL("$257,");break;
      case 5:WIDTH("div");break;
      case 6:WIDTH("idiv");break;
    }
  } else {a=fault_a;d=fault_d;}
  printf("%d %d %d %016" PRIx64 " %016" PRIx64 " %016" PRIx64 " %d %016" PRIx64 " %016" PRIx64 " %03" PRIx64 "\n",
    op,size,seed,low,high,arg,fault,a,d,op<5?flags&0x801:0);
}

int main(void)
{
  struct sigaction handler={0};
  handler.sa_sigaction=DivideFault;handler.sa_flags=SA_SIGINFO;
  sigemptyset(&handler.sa_mask);sigaction(SIGFPE,&handler,NULL);
  for(int size=1;size<=8;size*=2) {
    uint64_t mask=size==8?UINT64_MAX:(1ULL<<(size*8))-1,
      values[]={0,1,2,3,7,16,127,128,255,256,mask>>1,(mask>>1)+1,mask-1,mask};
    for(int op=0;op<7;op++) {
      if(size==1 && 2<=op && op<=4)continue;
      for(unsigned i=0;i<sizeof(values)/sizeof(*values);i++)
        for(unsigned j=0;j<sizeof(values)/sizeof(*values);j++)
          for(int mode=0;mode<(op>=5?4:1);mode++)
            for(int seed=0;seed<2;seed++) {
              uint64_t high=mode==0?0:mode==1?1:mode==2?mask:(values[i]>>(size*8-1)&1?mask:0),
                low=values[i]&mask,arg=values[j]&mask;
              if(size==1 && op>=5)low|=(high&255)<<8;
              low|=0xA123456789ABCD00ULL&~(size==1 && op>=5?0xFFFF:mask);
              high|=0xD123456789ABCD55ULL&~mask;
              if(op<5 || size==1)high=0xD123456789ABCD55ULL;
              Row(op,size,seed,low,high,arg);
            }
      for(int n=0;n<256;n++) {
        uint64_t low=Random(),high=Random(),arg=Random();
        if(op>=5 && arg&mask) {
          high%=arg&mask;
          if(n&1)high=~high;
        }
        Row(op,size,n&1,low,high,arg);
      }
    }
  }
  return 0;
}
