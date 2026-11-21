"""Compare every native room picture/priority map with the original PCjr renderer.

Requires a decoded original 1 MiB RAM capture, Python Unicorn and a C++ compiler.
The original renderer runs only in this development test, never in the game.
The native code is taken directly from Graphics.HC with mechanical syntax fixes.
"""
from pathlib import Path
import argparse,re,subprocess,tempfile,struct,json,hashlib
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('memory',type=Path)
parser.add_argument('--dump',type=Path,help='Keep original/native row-major pixels and hashes here')
args=parser.parse_args()
base=Path(__file__).resolve().parents[1]
root=base/'Data'
temporary=tempfile.TemporaryDirectory()
work=args.dump or Path(temporary.name)
work.mkdir(parents=True,exist_ok=True)
original=work/'original';original.mkdir(exist_ok=True)
ram=args.memory.read_bytes()
ds=int.from_bytes(ram[0xb0b:0xb0d],'little');data_base=ds*16
uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0,2**20)
def hook(uc,address,size,data):
    if address==0x105ff:uc.emu_stop()
uc.hook_add(UC_HOOK_CODE,hook)
def call(addr,si=0):
    for reg,value in [(UC_X86_REG_CS,0x60),(UC_X86_REG_DS,ds),
                      (UC_X86_REG_ES,ds),(UC_X86_REG_SS,ds),
                      (UC_X86_REG_SP,0x9000),(UC_X86_REG_BP,0),
                      (UC_X86_REG_SI,si),(UC_X86_REG_EFLAGS,2)]:
        uc.reg_write(reg,value)
    uc.mem_write(data_base+0x9000,b'\xff\xff')
    uc.emu_start(0x600+addr,0,count=5000000)
    assert uc.reg_read(UC_X86_REG_IP)==0xffff,'Original renderer did not return'
records=[]
for room in range(85):
    uc.mem_write(0,ram)
    call(0x615)
    call(0x353f,0x1981)
    uc.mem_write(0xf000,(root/f'PIC{room:03}.BIN').read_bytes())
    call(0x3534)
    screen=bytes(uc.mem_read(0x18000,32768))
    priority=bytes(uc.mem_read(0x10000,32768))
    screen=bytes(screen[(y%4)*8192+(y//4)*160+x]>>4
                 for y in range(168) for x in range(160))
    priority=bytes(priority[(y%4)*8192+(y//4)*160+x]&15
                   for y in range(168) for x in range(160))
    (original/f'PIC{room:03}.BIN').write_bytes(screen)
    (original/f'PRI{room:03}.BIN').write_bytes(priority)
    records.append(dict(room=room,picture=hashlib.sha256(screen).hexdigest(),
                        priority=hashlib.sha256(priority).hexdigest()))
(work/'Hashes.json').write_text(json.dumps(records,indent=2)+'\n')
s=(base/'Graphics.HC').read_text().split('U8 *KqView')[0]
s=s.replace('return p[0]+p[1]<<8;','return p[0]+(p[1]<<8);')
s=re.sub(r'case (\d+)\.\.\.(\d+):',r'case \1 ... \2:',s)
s=re.sub(r'0<=([a-z_]+)<([A-Z_]+)',r'(0<=\1 && \1<\2)',s)
s=s.replace('0<=x+xx<KQ_W','(0<=x+xx && x+xx<KQ_W)')
s=s.replace('KqResource("PIC"','KqResource((U8*)"PIC"')
head='''#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <algorithm>
#include <unistd.h>
typedef long I64; typedef bool Bool; typedef unsigned char U8; typedef void U0;
#define TRUE true
#define FALSE false
struct CDC;
#define MemSet memset
#define Free free
I64 MinI64(I64 a,I64 b){return std::min(a,b);}
I64 MaxI64(I64 a,I64 b){return std::max(a,b);}
void StrPrint(U8 *dst,const char *fmt,U8 *kind,I64 n){sprintf((char*)dst,fmt,kind,(int)n);}
U8 *FileRead(U8 *path,I64 *size){FILE*f=fopen((char*)path,"rb");if(!f)return NULL;fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);U8*p=(U8*)malloc(n);fread(p,1,n,f);fclose(f);if(size)*size=n;return p;}
'''
main='''int main(int argc,char**argv){chdir(argv[1]);char path[512];for(int r=0;r<85;r++){KqPicture(r);sprintf(path,"%s/PIC%03d.BIN",argv[2],r);FILE*f=fopen(path,"wb");fwrite(kq_pic,1,KQ_PIXELS,f);fclose(f);sprintf(path,"%s/PRI%03d.BIN",argv[2],r);f=fopen(path,"wb");fwrite(kq_pri,1,KQ_PIXELS,f);fclose(f);}return 0;}
'''
out=work/'native';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as t:
 p=Path(t);(p/'render.cpp').write_text(head+s+main)
 subprocess.run(['c++','-O2',str(p/'render.cpp'),'-o',str(p/'render')],check=True)
 subprocess.run([str(p/'render'),str(base),str(out)],check=True)

failures=[]
for room in range(85):
    for kind in ('PIC','PRI'):
        name=f'{kind}{room:03}.BIN'
        actual=(out/name).read_bytes();expected=(original/name).read_bytes()
        if actual!=expected:
            failures.append((name,sum(a!=b for a,b in zip(actual,expected))))
assert not failures,failures
print('PASS all85 color pictures and85 priority maps exactly match original PCjr renderer;4569600 bytes')
