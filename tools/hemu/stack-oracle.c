#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>

extern void StackRun(void *code,void *stack,uint64_t *out);
extern char StackCapture;
__asm__(
  ".text\n.globl StackRun\nStackRun:\n"
  "push %rbx\npush %rbp\npush %r12\npush %r13\npush %r14\npush %r15\n"
  "mov %rsp,%r15\nmov %rdx,%r14\npushq $0xAD7\npopfq\n"
  "mov %rsi,%rsp\nmovabs $0xFEDCBA9876543210,%rax\nmov $0x1000180,%rbp\nmov $0x1000100,%r12\nmov $16,%rcx\n"
  "jmp *%rdi\n.globl StackCapture\nStackCapture:\n"
  "mov %rsp,0(%r14)\nmov %rax,8(%r14)\nmov %rbp,16(%r14)\nmov %r12,40(%r14)\n"
  "mov %r15,%rsp\npushfq\npopq 24(%r14)\ncld\n"
  "pop %r15\npop %r14\npop %r13\npop %r12\npop %rbp\npop %rbx\nret\n");

static void Thunk(uint8_t *p,uint64_t marker)
{
  const uint8_t head[]={0x49,0xBB},store[]={0x4D,0x89,0x5E,0x20},jump[]={0x41,0xFF,0xE3};
  uint64_t capture=(uintptr_t)&StackCapture;
  memcpy(p,head,2);memcpy(p+2,&marker,8);memcpy(p+10,store,4);
  memcpy(p+14,head,2);memcpy(p+16,&capture,8);memcpy(p+24,jump,3);
}

int main(void)
{
  static const struct {uint8_t len,code[8];unsigned sp;} cases[]={
    {1,{0x54},256},{2,{0xFF,0xF4},256},{1,{0x5C},256},{2,{0x8F,0xC4},256},
    {3,{0x8F,0x04,0x24},256},{4,{0x8F,0x44,0x24,8},256},{4,{0x8F,0x44,0x24,0xF8},256},
    {4,{0xFF,0x74,0x24,0xF8},256},{2,{0x66,0x54},256},{2,{0x66,0x5C},256},
    {2,{0x66,0x50},256},{2,{0x66,0x58},256},
    {4,{0x66,0xFF,0x34,0x24},256},{4,{0x66,0x8F,0x04,0x24},256},
    {1,{0xC9},256},{2,{0x66,0xC9},256},
    {2,{0xFF,0xD4},512},{4,{0xFF,0x54,0x24,0xF8},256},
    {1,{0xC3},256},{3,{0xC2,0x18,0},256},
    {1,{0x50},256},{1,{0x58},256},{2,{0x6A,0xA5},256},
    {3,{0x66,0x6A,0xA5},256},{5,{0x68,0x78,0x56,0x34,0x12},256},
    {4,{0x66,0x68,0x78,0xF6},256},
    {3,{0x66,0x48,0x54},256},{3,{0x66,0x48,0x5C},256},
    {3,{0x66,0x48,0x50},256},{3,{0x66,0x48,0x58},256},
    {3,{0x66,0x48,0xC9},256},{5,{0x66,0x48,0xFF,0x34,0x24},256},
    {5,{0x66,0x48,0x8F,0x04,0x24},256},
    {4,{0x41,0x8F,0x04,0x24},256},{4,{0x41,0xFF,0x34,0x24},256},
    {5,{0x66,0x41,0x8F,0x04,0x24},256},
    {3,{0x8F,0x04,0x4C},256},{4,{0x41,0x8F,0x04,0x4C},256},
    {6,{0x8F,0x05,0xBA,0xFD,0xFF,0xFF},256},
    {7,{0x66,0x8F,0x05,0xB9,0xFD,0xFF,0xFF},256},
    {2,{0x41,0x54},256},{2,{0x41,0x5C},256},
    {3,{0x66,0x41,0x54},256},{3,{0x66,0x41,0x5C},256}
  };
  uint8_t *mem=mmap((void *)0x1000000,65536,PROT_READ|PROT_WRITE|PROT_EXEC,
    MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED_NOREPLACE,-1,0);
  if(mem==MAP_FAILED){perror("fixed private oracle mapping");return 1;}
  for(unsigned n=0;n<sizeof(cases)/sizeof(*cases);n++) {
    uint8_t before[640];uint64_t out[6]={0},target=(uintptr_t)(mem+512),value=0x1122334455667788;
    memset(mem,0xA5,65536);memcpy(mem+256,&target,8);memcpy(mem+248,&target,8);
    memcpy(mem+384,&value,8);memcpy(mem+1024,cases[n].code,cases[n].len);
    Thunk(mem+512,(uintptr_t)(mem+512));
    Thunk(mem+1024+cases[n].len,(uintptr_t)(mem+1024+cases[n].len));
    memcpy(before,mem,640);
    StackRun(mem+1024,mem+cases[n].sp,out);
    printf("%u %u ",n,cases[n].sp);
    for(unsigned i=0;i<cases[n].len;i++)printf("%02x",cases[n].code[i]);
    for(unsigned i=0;i<6;i++)printf(" %016" PRIx64,out[i]);
    putchar(' ');for(unsigned i=0;i<640;i++)printf("%02x",before[i]);
    putchar(' ');for(unsigned i=0;i<640;i++)printf("%02x",mem[i]);putchar('\n');
  }
  return munmap(mem,65536)!=0;
}
