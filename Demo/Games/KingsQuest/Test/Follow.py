"""Differential follow, move-to and condor tests against original 24BE code.

Original executable code is used solely by this development test. The shipped
runtime contains only native HolyC. Requires Unicorn and a C++ compiler.
"""
from pathlib import Path
import re,ctypes,struct,random,subprocess,tempfile,argparse
from unicorn import *
from unicorn.x86_const import *
parser=argparse.ArgumentParser(description='Compare native follow and obstacle avoidance with original PCjr code')
parser.add_argument('memory',type=Path)
args=parser.parse_args()
base=Path(__file__).resolve().parents[1]
tmp=tempfile.TemporaryDirectory()
work=Path(tmp.name)
s=(base/'Actors.HC').read_text();runtime=(base/'Runtime.HC').read_text();cl=runtime[:runtime.index('KqActor kq_actor')].replace('class KqActor','struct KqActor')
code='''#include <cstring>
#include <algorithm>
typedef long I64;typedef unsigned char U8;typedef bool Bool;typedef void U0;
#define TRUE true
#define FALSE false
I64 MinI64(I64 a,I64 b){return std::min(a,b);} I64 MaxI64(I64 a,I64 b){return std::max(a,b);} I64 SignI64(I64 a){return (a>0)-(a<0);}
'''+cl+'''KqActor kq_actor[111];U8 kq_var[256];I64 kq_block_x,kq_block_y;
U8 *KqCel(I64,I64,I64){static U8 cel[2]={20,8};return cel;}
'''+s[:s.index('I64 KqChase')]+s[s.index('I64 KqChase'):s.index('U0 KqActorTick')]+'''
extern "C" void Native(long *v,long *o){
memset(kq_actor,0,sizeof(kq_actor));memset(kq_var,0,sizeof(kq_var));KqActor*a=&kq_actor[14];KqActor*e=kq_actor;
a->x=v[0];a->y=v[1];e->x=v[2];e->y=v[3];a->mode=v[4];a->dir=v[5];a->step_x=v[6];a->step_y=v[7];a->distance=5;
a->last_x=v[8];a->last_y=v[9];a->avoid_phase=v[10];a->avoid_count=v[11];a->avoid_length=v[12];a->avoid_rx=v[13];a->avoid_ry=v[14];a->avoid_turn=v[15];a->barrier_detour=v[16];kq_block_x=v[17];kq_block_y=v[18];kq_var[6]=v[19];a->flags=v[20];a->distance=v[21];a->swoop=v[22];a->flight_side=v[23];a->target_x=v[24];kq_var[21]=v[25];a->target_y=v[26];
I64 id=14,dir;Bool kq_control=FALSE;switch(a->mode){MODE14default:dir=KqFollow(14);break;}a->last_x=a->x;a->last_y=a->y;o[0]=dir;o[1]=a->mode;o[2]=a->avoid_phase;o[3]=a->avoid_count;o[4]=a->avoid_length;o[5]=a->avoid_rx;o[6]=a->avoid_ry;o[7]=a->avoid_turn;o[8]=a->barrier_detour;o[9]=kq_var[6];o[10]=a->last_x;o[11]=a->last_y;o[12]=a->flags;o[13]=a->swoop;o[14]=a->flight_side;o[15]=a->target_x;o[16]=kq_var[21];o[17]=kq_var[8];
}
'''
code=code.replace('MODE14',s[s.index('      case 14:'):s.index('      case 16:')])
p=work/'follow.cpp';p.write_text(code);subprocess.run(['c++','-shared','-fPIC','-O2',str(p),'-o',str(work/'follow.so')],check=True)
dll=ctypes.CDLL(str(work/'follow.so'));ram=args.memory.read_bytes();ds=0x543;addr=ds*16
uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0,2**20)
def hook(uc,a,size,data):
 if a==0x105ff:uc.emu_stop()
 if a==0x600+0x4caf:
  sp=uc.reg_read(UC_X86_REG_SP);ret=int.from_bytes(uc.mem_read(addr+sp,2),'little');uc.reg_write(UC_X86_REG_SP,sp+2);uc.reg_write(UC_X86_REG_IP,ret)
uc.hook_add(UC_HOOK_CODE,hook)
def original(v):
 uc.mem_write(0,ram)
 def b(o,x):uc.mem_write(addr+o,bytes([x&255]))
 def w(o,x):uc.mem_write(addr+o,struct.pack('<H',x&65535))
 actor=0x11ff;uc.mem_write(addr+actor,bytes(30));uc.mem_write(addr+0x11e1,bytes(30))
 for o,x in [(actor+0x18,v[0]),(actor+0x19,v[1]),(0x11f9,v[2]),(0x11fa,v[3]),(actor+0xf,v[4]),(actor+0x10,v[5]),(actor+0xc,v[6]),(actor+0xd,v[7]),(0x180d,v[8]),(0x180e,v[9]),(0x1272,v[10]),(0x126b,v[11]),(0x1271,v[12]),(0x126c,255 if v[15] else 0),(0x1273,v[16]),(0x125c,v[17]),(0x125d,v[18]),(0x1009,v[19]),(actor+0xb,v[20]),(actor+5,14),(0x1266,0 if v[4]==17 else 5),(0x1267,v[21] if v[4]!=15 else 0),(0x1269,v[22]),(0x1268,v[21]),(0x126d,v[23]),(0x1264,v[24]),(0x1265,v[26]),(0x100b,0),(0x1018,v[25])]:b(o,x)
 w(actor+0x16,0x7000);w(0x11e1+0x16,0x7000);uc.mem_write(addr+0x7000,bytes([20,8]));w(0x17ee,v[13]);w(0x17f0,v[14]);uc.mem_write(addr+0x9000,struct.pack('<HHH',0xffff,v[4],actor))
 for reg,x in [(UC_X86_REG_CS,0x60),(UC_X86_REG_DS,ds),(UC_X86_REG_ES,ds),(UC_X86_REG_SS,ds),(UC_X86_REG_SP,0x9000),(UC_X86_REG_EFLAGS,2)]:uc.reg_write(reg,x)
 uc.emu_start(0x600+0x24be,0,count=100000)
 assert uc.reg_read(UC_X86_REG_IP)==0xffff
 def rb(o):return uc.mem_read(addr+o,1)[0]
 def rw(o):return int.from_bytes(uc.mem_read(addr+o,2),'little')
 return [rb(actor+0x10),rb(actor+0xf),rb(0x1272),rb(0x126b),rb(0x1271),rw(0x17ee),rw(0x17f0),int(rb(0x126c)!=0),rb(0x1273),rb(0x1009),rb(0x180d),rb(0x180e),rb(actor+0xb),rb(0x1269),rb(0x126d),rb(0x1264),rb(0x1018),rb(0x100b)]
r=random.Random(29)
for i in range(12000):
 v=[r.randrange(5,150),r.randrange(45,160),r.randrange(5,150),r.randrange(45,160),r.choice([12,14,15,17]),r.randrange(1,9),r.randrange(1,5),r.randrange(1,5),0,0,r.randrange(6),r.randrange(4),r.randrange(1,5),r.randrange(10),r.randrange(10),r.randrange(2),r.randrange(2),r.choice([0,70]),r.choice([0,100]),r.choice([0,0,14]),r.randrange(8),42,r.randrange(2),r.randrange(2),r.choice([0,150]),r.choice([0,14]),0]
 if v[4]!=17:v[21]=5
 if v[4]==14:v[24]=v[0]+r.randrange(-6,7);v[26]=v[1]+r.randrange(-6,7)
 v[8:10]=v[:2] if r.randrange(2) else [v[0]+1,v[1]+1]
 inp=(ctypes.c_long*len(v))(*v);out=(ctypes.c_long*18)();dll.Native(inp,out);want=original(v)
 if list(out)!=want:raise AssertionError((i,v,list(out),want))
else:print('PASS 12000 original/native follow, move-to, condor and obstacle detour states')
