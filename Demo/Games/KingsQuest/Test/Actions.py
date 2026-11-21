"""Compare actual native action cases with original PCjr action handlers.

Requires the decoded original RAM capture, Python Unicorn and a C++ compiler.
Drawing helpers are intercepted; this tests state effects, not rendering.
"""
from pathlib import Path
import argparse,re,subprocess,tempfile,ctypes,struct,random
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
from Extract import ARGS
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('memory',type=Path)
args=parser.parse_args()
base=Path(__file__).resolve().parents[1]
s=(base/'Runtime.HC').read_text()
pre=s.split('U8 *KqText')[0].replace('class KqActor','struct KqActor')
body=s.split('U0 KqAction',1)[1]
start=body.index('    case 1:')
selected={8,9,11,12,13,16,17,18,19,20,21,22,23,24,25,26,27,29,30,31,34,47,52,53,54,56,57,58,59}
parts=re.split(r'(?=    case \d+:)',body[start:])
cases=''.join(p for p in parts if p and int(re.search(r'case (\d+)',p)[1]) in selected)
fields=['loop','cel','x','y','mode','cycle','priority','flags','block']
offsets=[3,8,24,25,15,14,29,11,4]
header='''#include <cstring>
#include <algorithm>
typedef long I64;typedef unsigned char U8;typedef bool Bool;typedef void U0;
#define TRUE true
#define FALSE false
I64 MinI64(I64 a,I64 b){return std::min(a,b);}
U8 *KqLoop(I64,I64){static U8 p[4]={1,1,1,8};return p;}
U0 KqUnderDrop(I64,Bool=FALSE){}
U0 KqStamp(I64){}
'''
code=header+pre+'U0 KqAction'+body[:start]+cases+'  }\n}\n'
code+='''extern "C" void Reset(U8*vars,U8*objs){memcpy(kq_var,vars,256);memcpy(kq_object,objs,888);memset(kq_actor,0,sizeof(kq_actor));}
extern "C" void Action(int op,int x,int y,int z){KqAction(op,x,y,z);}
extern "C" U8* Vars(){return kq_var;}
extern "C" U8* Objects(){return kq_object;}
'''
code+='extern "C" I64 Field(int id,int field,I64 value,int write){I64*p;switch(field){'
for i,f in enumerate(fields):code+='case %d:p=&kq_actor[id].%s;break;'%(i,f)
code+='default:return 0;}if(write)*p=value;return *p;}\n'
ram=args.memory.read_bytes();ds=int.from_bytes(ram[0xb0b:0xb0d],'little');data=ds*16
uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0,2**20)
def hook(uc,address,size,ctx):
    off=address-0x600
    if off==0xffff:uc.emu_stop();return
    if off in (0x2c73,0x2cae,0x4c5a):
        sp=uc.reg_read(UC_X86_REG_SP)
        ret=int.from_bytes(uc.mem_read(data+sp,2),'little')
        uc.reg_write(UC_X86_REG_SP,sp+2);uc.reg_write(UC_X86_REG_AX,8)
        uc.reg_write(UC_X86_REG_IP,ret)
uc.hook_add(UC_HOOK_CODE,hook)
with tempfile.TemporaryDirectory() as t:
    p=Path(t);(p/'actions.cpp').write_text(code)
    subprocess.run(['c++','-shared','-fPIC','-O0',str(p/'actions.cpp'),'-o',str(p/'actions.so')],check=True)
    lib=ctypes.CDLL(str(p/'actions.so'))
    lib.Vars.restype=lib.Objects.restype=ctypes.POINTER(ctypes.c_ubyte)
    lib.Field.restype=ctypes.c_long
    rng=random.Random(580);fails=[];count=0
    for op in sorted(selected):
        for iteration in range(24):
            x=0 if iteration%3==0 else 5;y=iteration%8;z=70
            var=bytes(rng.randrange(256) for _ in range(256))
            obj=bytearray(rng.randrange(256) for _ in range(888))
            obj[7]=0;obj[5*8+7]=1
            lib.Reset(ctypes.c_char_p(var),ctypes.c_char_p(bytes(obj)))
            uc.mem_write(0,ram);uc.mem_write(data+0x1003,var);uc.mem_write(data+0x1361,bytes(obj))
            for actor,slot in [(0,0),(5,1)]:
                raw=bytearray(30);raw[7]=8
                values=[1,4,40+actor,110+actor,0,0,5,iteration%8,0]
                for field,(off,value) in enumerate(zip(offsets,values)):
                    raw[off]=value;lib.Field(actor,field,value,1)
                uc.mem_write(data+0x11e1+slot*30,bytes(raw))
            operands=[x,y,z][:len(ARGS[op])]
            script=bytes([op]+operands+[255])
            uc.mem_write(data+0x8000,script);uc.mem_write(data+0xfb4,b'\0\x80')
            for reg,value in [(UC_X86_REG_CS,0x60),(UC_X86_REG_DS,ds),
                              (UC_X86_REG_ES,ds),(UC_X86_REG_SS,ds),
                              (UC_X86_REG_SP,0x9000),(UC_X86_REG_BP,0),
                              (UC_X86_REG_EFLAGS,2)]:uc.reg_write(reg,value)
            uc.mem_write(data+0x9000,b'\xff\xff\0\0')
            uc.emu_start(0x600+0x1aac,0,count=100000)
            assert uc.reg_read(UC_X86_REG_IP)==0xffff,op
            lib.Action(op,x,y,z)
            actual=bytes(lib.Vars()[:256])+bytes(lib.Objects()[:888])
            expected=bytes(uc.mem_read(data+0x1003,256))+bytes(uc.mem_read(data+0x1361,888))
            if actual!=expected:fails.append((op,iteration,'variables/objects',[(i,a,b) for i,(a,b) in enumerate(zip(actual,expected)) if a!=b]))
            for actor,slot in [(0,0),(5,1)]:
                for field,off in enumerate(offsets):
                    actual=lib.Field(actor,field,0,0)
                    expected=uc.mem_read(data+0x11e1+slot*30+off,1)[0]
                    if actual!=expected:fails.append((op,iteration,actor,fields[field],actual,expected))
            count+=1
    assert not fails,fails[:24]
    print('PASS',count,'action-state comparisons covering',len(selected),'original opcodes')
