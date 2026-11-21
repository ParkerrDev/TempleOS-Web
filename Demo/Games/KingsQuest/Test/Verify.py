"""Compare generated native rules with the original PCjr evaluator.

Requires a C compiler, Python unicorn, original disk and its decoded RAM capture.
Only the condition evaluator runs as x86 in this build-time verification tool.
The shipping HolyC game contains no executable interpreter or disk.
"""
import argparse,pathlib,re,subprocess,tempfile,ctypes,random,struct,sys
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
base=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('disk',type=pathlib.Path)
parser.add_argument('memory',type=pathlib.Path)
args=parser.parse_args()
disk=args.disk.read_bytes()
sys.path.insert(0,str(base/'Test'));from Extract import ARGS, STOP
src=(base/'Rooms.HC').read_text()
src=re.sub(r'return (Kq(?:Input|Idle)\d+);',r'return \1();',src)
src=re.sub(r'KqAction\(([^)]+)\);',lambda m:'KqAction('+','.join((m[1].split(',')+['0']*3)[:4])+');',src)
head='''typedef long I64; typedef int Bool; typedef unsigned char U8;
#define TRUE 1
#define FALSE 0
U8 kq_var[256]; int kq_text_room,kq_input_matched,x,y,verb,noun,n;
int trace[32768];
int KqPos(int a,int b,int c,int d) {return x>=a&&y>=b&&x<=c&&y<=d;}
int KqSaid(int a,int b) {return (a==250||a==verb)&&(b==250||b==noun);}
void KqAction(int op,int a,int b,int c) {
trace[n++]=op;trace[n++]=a;trace[n++]=b;trace[n++]=c;
if(op==8)kq_var[a]=1;if(op==9)kq_var[a]=0;
if(op==16)kq_var[a]++;if(op==17)kq_var[a]--;if(op==18)kq_var[a]=b;
}
'''
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp);(p/'native.c').write_text(head+src)
 subprocess.run(['cc','-shared','-fPIC','-O0',str(p/'native.c'),'-o',str(p/'native.so')],check=True)
 dll=ctypes.CDLL(str(p/'native.so'))
 cv=(ctypes.c_ubyte*256).in_dll(dll,'kq_var');ct=(ctypes.c_int*32768).in_dll(dll,'trace')
 globals={name:ctypes.c_int.in_dll(dll,name) for name in ['x','y','verb','noun','n','kq_input_matched']}
 ram=args.memory.read_bytes()
 uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0,2**20);uc.mem_write(0,ram)
 state={}
 def hook(uc,address,size,data):
  if address==0x600+0xffff:uc.emu_stop();return
  if address!=0x600+0x1aac:return
  sp=uc.reg_read(UC_X86_REG_SP);ss=uc.reg_read(UC_X86_REG_SS)*16
  ret,off=struct.unpack('<HH',uc.mem_read(ss+sp,4));act=state['act'];stop=0
  while act[off]!=255:
   op=act[off];off+=1;args=[]
   for w in ARGS[op]:args.append(int.from_bytes(act[off:off+w],'little'));off+=w
   a,b,c=(args+[0,0,0])[:3];state['trace'] += [op,a,b,c]
   if op in (8,9,16,17,18):
    old=uc.mem_read(0x600+0x1003+a,1)[0]
    val={8:1,9:0,16:(old+1)&255,17:(old-1)&255,18:b}[op]
    uc.mem_write(0x600+0x1003+a,bytes([val]))
   if op in STOP:stop=1;break
  uc.reg_write(UC_X86_REG_AX,stop);uc.reg_write(UC_X86_REG_SP,sp+2);uc.reg_write(UC_X86_REG_IP,ret)
 uc.hook_add(UC_HOOK_CODE,hook)
 rng=random.Random(401);cases=0
 import json
 ir=json.loads((base/'Test/Rooms.json').read_text())
 for room in range(85):
  entry=disk[0x500+room*4:0x504+room*4]
  pos=(((entry[2]&3)<<8)|entry[3])*512+entry[0]+((entry[1]&128)<<1)
  total=8+sum(struct.unpack_from('<4H',disk,pos))
  raw=disk[pos:pos+total]
  a,i,c,m=struct.unpack_from('<4H',raw);act=raw[8:8+a]
  for mode,buf,start in [('Idle',raw[8+a:8+a+i],0x47ee),('Input',raw[8+a+i:8+a+i+c],0x47e1)]:
   if room==64 and mode=='Input':buf=b'\xff'
   for iteration in range(max(60,len(ir[room]['rules'][mode])*2)):
    values=bytes(rng.randrange(0,5) if iteration else 0 for _ in range(256))
    xx,yy=rng.randrange(160),rng.randrange(168);vv,nn=rng.randrange(256),rng.randrange(256)
    rows=ir[room]['rules'][mode];row=rows[iteration%len(rows)]
    for co in row.get('cond',[]):
     if co.startswith('KqSaid'):vv,nn=map(int,re.findall(r'\d+',co))
     if co.startswith('KqPos'):
      x1,y1,x2,y2=map(int,re.findall(r'\d+',co));xx=(x1+x2)//2;yy=(y1+y2)//2
    if iteration%2:
     values=bytearray(values)
     for co in row.get('cond',[]):
      if co.startswith('kq_var'):
       v,value=map(int,re.findall(r'\d+',co));values[v]=value if '==' in co else (value+1)&255
     values=bytes(values)
    for j,v in enumerate(values):cv[j]=v
    for name,value in [('x',xx),('y',yy),('verb',vv),('noun',nn),('n',0),('kq_input_matched',0)]:globals[name].value=value
    actual=getattr(dll,'Kq'+mode)(room)
    state.update(act=act,trace=[])
    uc.mem_write(0x600+0x9000,buf);uc.mem_write(0x600+0xfb6,struct.pack('<HH',0x9000,0x9000))
    uc.mem_write(0x600+0x1003,values);uc.mem_write(0x600+0x11f9,bytes([xx,yy]));uc.mem_write(0x600+0xeaf,bytes([vv,nn]));uc.mem_write(0x600+0xe29,b'\0\0')
    for reg,value in [(UC_X86_REG_CS,0x60),(UC_X86_REG_DS,0x60),(UC_X86_REG_ES,0x60),(UC_X86_REG_SS,0x1000),(UC_X86_REG_SP,0xff00),(UC_X86_REG_BP,0),(UC_X86_REG_EFLAGS,2)]:uc.reg_write(reg,value)
    uc.mem_write(0x1ff00,b'\xff\xff')
    uc.emu_start(0x600+start,0,count=100000)
    expected=uc.reg_read(UC_X86_REG_AX)
    trace=list(ct[:globals['n'].value]);nativevars=bytes(cv);origvars=bytes(uc.mem_read(0x600+0x1003,256))
    if trace!=state['trace'] or actual!=expected or nativevars!=origvars:
     print('FAIL',room,mode,iteration,'ret',actual,expected,'traces',trace,state['trace']);raise SystemExit(1)
    cases+=1
 print('PASS',cases,'native room rule executions matched original PCjr interpreter at47E1/47EE, action traces and var mutations')
