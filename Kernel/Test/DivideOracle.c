#define _GNU_SOURCE
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <signal.h>
#include <setjmp.h>
#include <ucontext.h>

static sigjmp_buf escape;
static volatile uint64_t instruction,got[7];
static void Fault(int signal,siginfo_t *info,void *context)
{
  (void)signal;
  const ucontext_t *u=context;
  got[0]=u->uc_mcontext.gregs[REG_TRAPNO];
  got[1]=u->uc_mcontext.gregs[REG_ERR];
  got[2]=(uint64_t)u->uc_mcontext.gregs[REG_RIP]-instruction;
  got[3]=u->uc_mcontext.gregs[REG_EFL];
  got[4]=u->uc_mcontext.gregs[REG_RAX];
  got[5]=u->uc_mcontext.gregs[REG_RDX];
  got[6]=info->si_code;
  siglongjmp(escape,1);
}
#define ASM(op) __asm__ volatile("leaq 0f(%%rip),%%r8; movq %%r8,%[ip]; pushq %[flags]; popfq; 0: " op : "+a"(a),"+d"(d),[ip] "=m"(instruction) : "c"(divisor),[flags] "r"(flags) : "r8","cc","memory")
#define WIDTH(op) switch(size) {case 1:ASM(op "b %%cl");break;case 2:ASM(op "w %%cx");break;case 4:ASM(op "l %%ecx");break;case 8:ASM(op "q %%rcx");break;}
static void Row(int size,int sign,int kind,int seed,uint64_t low,uint64_t high,uint64_t divisor)
{
  volatile uint64_t a=low,d=high,flags=seed?0xAD7:0x202;
  if(!sigsetjmp(escape,1)) {
    if(sign){WIDTH("idiv");}else{WIDTH("div");}
    fprintf(stderr,"Expected a divide fault\n");return;
  }
  printf("%d %d %d %d %016" PRIx64 " %016" PRIx64 " %016" PRIx64,size,sign,kind,seed,low,high,divisor);
  for(int i=0;i<7;i++)printf(" %016" PRIx64,got[i]);
  putchar('\n');
}
int main(void)
{
  struct sigaction handler={0};handler.sa_sigaction=Fault;handler.sa_flags=SA_SIGINFO;
  sigemptyset(&handler.sa_mask);sigaction(SIGFPE,&handler,NULL);
  for(int size=1;size<=8;size*=2)for(int sign=0;sign<2;sign++)for(int kind=0;kind<3;kind++)for(int seed=0;seed<2;seed++) {
    uint64_t mask=size==8?UINT64_MAX:(1ULL<<(size*8))-1,bit=1ULL<<(size*8-1),a=23,d=0,divisor=0;
    if(kind==1){a=sign?bit:0;d=sign?0:1;divisor=1;}
    if(kind==2){a=sign?bit:mask;d=divisor=mask;}
    if(size==1){a=(a&mask)|((d&mask)<<8)|0xA123456789AB0000ULL;d=0xD123456789ABCDEFULL;}
    else {a|=0xA123456789ABCDEFULL&~mask;d|=0xD123456789ABCDEFULL&~mask;}
    Row(size,sign,kind,seed,a,d,divisor);
  }
  return 0;
}
