#define _GNU_SOURCE
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <signal.h>
#include <setjmp.h>
#include <ucontext.h>
#include <sys/mman.h>
#include <string.h>
#include <unistd.h>
static sigjmp_buf escape;
static volatile uint64_t instruction,got[8];
static void Fault(int signal,siginfo_t *info,void *context)
{
  (void)signal;(void)info;
  const ucontext_t *u=context;
  got[0]=u->uc_mcontext.gregs[REG_TRAPNO];
  got[1]=u->uc_mcontext.gregs[REG_ERR];
  got[2]=(uint64_t)u->uc_mcontext.gregs[REG_RIP]-instruction;
  got[3]=u->uc_mcontext.gregs[REG_RAX];
  got[4]=u->uc_mcontext.gregs[REG_RDX];
  got[5]=u->uc_mcontext.gregs[REG_RBX];
  got[6]=u->uc_mcontext.gregs[REG_RCX];
  got[7]=u->uc_mcontext.gregs[REG_EFL]&0xED5;
  siglongjmp(escape,1);
}
#define RUN(op) __asm__ volatile("leaq 0f(%%rip),%%r8; movq %%r8,%[ip]; pushq %[flags]; popfq; 0: " op : "+a"(a),"+d"(d),"+b"(b),"+c"(c),[ip] "=m"(instruction) : [ptr] "r"(ptr),[flags] "r"(flags) : "r8","cc","memory")
static int Row(int kind,int lock,int offset,int match,int seed,uint8_t *mem,size_t page)
{
  uint64_t lo=0xFEDCBA9876543210ULL,hi=0x8123456789ABCDEFULL;
  uint8_t *ptr=mem+offset;
  memcpy(ptr,&lo,8);memcpy(ptr+8,&hi,8);
  volatile uint64_t a=lo^(match==1),d=hi^(match==2),b=1,c=2,flags=seed?0xAD7:0x202;
  if(kind==2&&mprotect(mem,page,PROT_READ))return 3;
  if(!sigsetjmp(escape,1)) {
    if(kind==1) {
      if(lock){RUN(".byte 0xf0,0x48,0x0f,0xc7,0xc8");}
      else {RUN(".byte 0x48,0x0f,0xc7,0xc8");}
    } else if(lock){RUN("lock cmpxchg16b (%[ptr])");}
    else {RUN("cmpxchg16b (%[ptr])");}
    fprintf(stderr,"Missing expected fault\n");return 4;
  }
  if(kind==2&&mprotect(mem,page,PROT_READ|PROT_WRITE))return 5;
  uint64_t after[2];memcpy(after,ptr,16);
  if(after[0]!=lo||after[1]!=hi)return 6;
  if(got[0]!=(kind==0?13:kind==1?6:14)||got[1]!=(kind==2?7:0)||got[2]||
     got[3]!=(lo^(match==1))||got[4]!=(hi^(match==2))||got[5]!=1||got[6]!=2||got[7]!=(flags&0xED5))return 7;
  printf("%d %d %d %d %d",kind,lock,offset,match,seed);
  for(int i=0;i<8;i++)printf(" %016" PRIX64,got[i]);
  putchar('\n');return 0;
}
int main(void)
{
  size_t page=sysconf(_SC_PAGESIZE);
  uint8_t *mem=mmap(NULL,page,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
  if(mem==MAP_FAILED)return 1;
  struct sigaction h={0};h.sa_sigaction=Fault;h.sa_flags=SA_SIGINFO;
  sigemptyset(&h.sa_mask);sigaction(SIGSEGV,&h,NULL);sigaction(SIGILL,&h,NULL);
  for(int kind=0;kind<3;kind++)for(int lock=0;lock<2;lock++)for(int match=0;match<3;match++)for(int seed=0;seed<2;seed++)
    for(int offset=kind?0:1;offset<(kind?1:16);offset++) {
      int result=Row(kind,lock,offset,match,seed,mem,page);
      if(result)return result;
    }
  return 0;
}
