"""Pixel comparison of all sprite cels across three priority backgrounds.

Uses original 322F/32DB dynamic and static renderers as development references.
Requires a decoded original RAM capture, Unicorn and a C++ compiler.
"""
from pathlib import Path
import argparse,re,subprocess,tempfile,ctypes,struct
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
parser=argparse.ArgumentParser(description='Compare all722 sprite cels with original PCjr renderer')
parser.add_argument('memory',type=Path)
parser.add_argument('--edges',action='store_true',help='Also check every cel at legal top-left and bottom-right positions')
args=parser.parse_args()
base=Path(__file__).resolve().parents[1]
s=(base/'Graphics.HC').read_text().split('U0 KqScale')[0]
s=s.replace('return p[0]+p[1]<<8;','return p[0]+(p[1]<<8);')
s=re.sub(r'case (\d+)\.\.\.(\d+):',r'case \1 ... \2:',s)
s=re.sub(r'0<=([^<\n]+)<([^ \)\n&|]+)',r'(0<=\1 && \1<\2)',s)
s=s.replace('KqResource("PIC"','KqResource((U8*)"PIC"').replace('KqResource("VIEW"','KqResource((U8*)"VIEW"')
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
runtime=(base/'Runtime.HC').read_text()
band=runtime.split('U0 KqStamp',1)[1].split('  width=p[1];',1)[1].split('MemCpy(kq_pic',1)[0]
band='p=KqCel(a->view,y,z);width=p[1];'+band
band=re.sub(r'0<=([^<\n]+)<([^ \)\n&|]+)',r'(0<=\1 && \1<\2)',band)
wrap="""extern "C" U8 *Native(int view,int loop,int cel,int pri,U8*background,int burn,int cx,int cy){
memcpy(kq_pri,background,KQ_PIXELS);memset(kq_pixels,3,KQ_PIXELS);
KqSprite(view,loop,cel,cx,cy,pri,burn);
if(burn){struct A{I64 view,x,y;};A actor={view,cx,cy};A*a=&actor;
I64 y=loop,z=cel,width,row,i,top;U8*p;
"""+band+"""}
static U8 result[KQ_PIXELS*2];memcpy(result,kq_pixels,KQ_PIXELS);
memcpy(result+KQ_PIXELS,kq_pri,KQ_PIXELS);return result;}
"""

cels=[]
for path in sorted((base/'Data').glob('VIEW*.BIN')):
 data=path.read_bytes()[2:]
 if data==b'\xff':continue
 p=17
 for loop in range(data[0]):
  length=int.from_bytes(data[1+loop*2:3+loop*2],'little');b=data[p:p+length];p+=length;cp=4+2*b[3]
  for cel in range(b[3]):
   n=int.from_bytes(b[4+cel*2:6+cel*2],'little');cels.append((int(path.stem[4:]),loop,cel,b[cp:cp+n]));cp+=n
ram=args.memory.read_bytes();ds=int.from_bytes(ram[0xb0b:0xb0d],'little');addr=ds*16
uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0,2**20);uc.mem_write(0,ram)
def hook(uc,a,size,data):
 if a==0x105ff:uc.emu_stop()
uc.hook_add(UC_HOOK_CODE,hook)
with tempfile.TemporaryDirectory() as td:
 p=Path(td);(p/'sprite.cpp').write_text(head+s+wrap)
 subprocess.run(['c++','-shared','-fPIC','-O2',str(p/'sprite.cpp'),'-o',str(p/'sprite.so')],check=True)
 dll=ctypes.CDLL(str(p/'sprite.so'));dll.Native.restype=ctypes.POINTER(ctypes.c_ubyte)
 import os;os.chdir(base)
 cases=0
 for variant in range(10 if args.edges else 6):
  pattern=variant%3 if variant<6 else 2;burn=variant//3 if variant<6 else variant%2
  background=bytes(1 if pattern==0 else (12 if y<90 else 1) if pattern==1 else (15 if x%13<4 and y<150 else 8 if y<100 else 2) for y in range(168) for x in range(160))
  packed=bytearray([0x31]*32768)
  for y in range(168):
   for x in range(160):packed[(y%4)*8192+(y//4)*160+x]=0x30|background[y*160+x]
  for view,loop,cel,data in cels:
   cx,cy=(50,140) if variant<6 else (0,data[0]-1) if variant<8 else (160-data[1],167)
   uc.mem_write(0x10000,bytes(packed));uc.mem_write(addr+0x7000,data)
   actor=bytearray(30);actor[0x16:0x18]=b'\0p';actor[0x1a:0x1c]=bytes([cx,cy]);actor[0x1d]=8
   uc.mem_write(addr+0x11e1,bytes(actor))
   for reg,v in [(UC_X86_REG_CS,0x60),(UC_X86_REG_DS,ds),(UC_X86_REG_ES,ds),(UC_X86_REG_SS,ds),(UC_X86_REG_SP,0x9000),(UC_X86_REG_BP,0x11e1),(UC_X86_REG_EFLAGS,2)]:uc.reg_write(reg,v)
   uc.mem_write(addr+0x9000,b'\xff\xff');uc.emu_start(0x600+(0x32db if burn else 0x322f),0,count=1000000)
   assert uc.reg_read(UC_X86_REG_IP)==0xffff
   buf=uc.mem_read(0x10000,32768);original=bytes(buf[(y%4)*8192+(y//4)*160+x]>>4 for y in range(168) for x in range(160))
   original+=bytes(buf[(y%4)*8192+(y//4)*160+x]&15 for y in range(168) for x in range(160))
   result=dll.Native(view,loop,cel,8,ctypes.c_char_p(background),burn,cx,cy);native=bytes(result[:53760])
   if native!=original:
    print('FAIL',burn,pattern,cx,cy,view,loop,cel,sum(a!=b for a,b in zip(native,original)));raise SystemExit(1)
   cases+=1
 print('PASS',cases,'sprite renders (722cels,3prioritybackgrounds,dynamic+burn) match original322F/32DB color and priority exactly')
