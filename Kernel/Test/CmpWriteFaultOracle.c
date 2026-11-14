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
static int Row(int kind,int size,int offset,int match,int seed,uint8_t *mem,size_t page)
{
  const uint64_t value=0xD123456789ABCDEFULL,mask=UINT64_MAX>>(64-size*8);
  uint8_t *ptr=mem+offset;
  memcpy(ptr,&value,8);
  volatile uint64_t a=(0xA123456789ABCDEFULL&~mask)|(value&mask),d=0xD1234567ABCDEF01ULL,
    b=0xB1234567AABBCCDDULL,c=0xC123456788776655ULL,flags=seed?0xAD7:0x202;
  if(kind){a=0xA123456700000000ULL|(uint32_t)value;d=0xD123456700000000ULL|(value>>32);}
  if(!match)a^=1;
  const uint64_t before[]={a,d,b,c,flags&0xED5};
  if(mprotect(mem,page,PROT_READ))return 3;
  if(!sigsetjmp(escape,1)) {
    if(kind){RUN("cmpxchg8b (%[ptr])");}
    else switch(size) {
      case 1:RUN("cmpxchgb %%cl,(%[ptr])");break;
      case 2:RUN("cmpxchgw %%cx,(%[ptr])");break;
      case 4:RUN("cmpxchgl %%ecx,(%[ptr])");break;
      case 8:RUN("cmpxchgq %%rcx,(%[ptr])");break;
    }
    fprintf(stderr,"Missing expected write fault\n");return 4;
  }
  if(mprotect(mem,page,PROT_READ|PROT_WRITE))return 5;
  uint64_t after;memcpy(&after,ptr,8);
  if(after!=value)return 6;
  if(got[0]!=14||got[1]!=7||got[2])return 7;
  for(int i=0;i<5;i++)if(got[3+i]!=before[i])return 8;
  printf("%d %d %d %d %d",kind,size,offset,match,seed);
  for(int i=0;i<8;i++)printf(" %016" PRIX64,got[i]);
  putchar('\n');return 0;
}
int main(void)
{
  size_t page=sysconf(_SC_PAGESIZE);
  uint8_t *mem=mmap(NULL,page,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
  if(mem==MAP_FAILED)return 1;
  struct sigaction h={0};h.sa_sigaction=Fault;h.sa_flags=SA_SIGINFO;
  sigemptyset(&h.sa_mask);sigaction(SIGSEGV,&h,NULL);
  for(int kind=0;kind<2;kind++)for(int size=1;size<=8;size*=2)if(!kind||size==8)
    for(int offset=0;offset<2;offset++)for(int match=0;match<2;match++)for(int seed=0;seed<2;seed++) {
      int result=Row(kind,size,offset,match,seed,mem,page);
      if(result)return result;
    }
  return 0;
}
