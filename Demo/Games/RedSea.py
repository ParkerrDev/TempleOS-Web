"""Read RedSea discs and expand TempleOS .Z files without booting guest code.

Format and dictionary algorithm: Terry A. Davis, public-domain TempleOS,
Kernel/Compress.HC, Kernel/KernelA.HH and Doc/RedSea.DD (templeos.org/Downloads).
This Python implementation checks headers, ranges, dictionary cycles and lengths.
"""
from pathlib import Path
import struct

def expand(data):
    if len(data)<17:raise ValueError('Truncated compression header')
    packed,size=struct.unpack_from('<QQ',data)
    kind=data[16]
    if packed!=len(data) or size>128*1024*1024 or kind not in (1,2,3):raise ValueError('Invalid compression header')
    if kind==1:
        if size!=len(data)-17:raise ValueError('Invalid raw size')
        return data[17:]
    minimum=128 if kind==2 else 256
    bases=[0]*4096;chars=[0]*4096;children=[0]*4096;used=[False]*4096
    bits=minimum.bit_length();limit=1<<bits;free=minimum;current=None;following=None
    def entry():
        nonlocal bits,limit,free,current,following
        current=following
        if bits<12:
            following=free;free+=1
            if free==limit:bits+=1;limit=1<<bits
        else:
            for _ in range(4096):
                free+=1
                if free==limit:free=minimum
                if not children[free]:break
            else:raise ValueError('No free dictionary entry')
            following=free
            if used[free]:children[bases[free]]-=1;used[free]=False
    entry()
    bit=17*8
    def read():
        nonlocal bit
        if bit+bits>len(data)*8:raise ValueError('Truncated code')
        i=bit//8;v=int.from_bytes(data[i:i+3],'little')>>(bit%8)&((1<<bits)-1);bit+=bits;return v
    if not size:return b''
    last=read()
    if last>=minimum:raise ValueError('Invalid initial code')
    result=bytearray([last]);last_char=last;entry()
    while len(result)<size:
        base=read();code=base;stack=[]
        if current==base:stack.append(last_char);code=last
        for _ in range(4096):
            if code<minimum:break
            if not used[code]:raise ValueError('Invalid dictionary reference')
            stack.append(chars[code]);code=bases[code]
        else:raise ValueError('Dictionary cycle')
        stack.append(code);last_char=code
        bases[current]=last;chars[current]=last_char;children[last]+=1;used[current]=True
        entry();result.extend(reversed(stack));last=base
    if len(result)!=size:raise ValueError('Expanded length mismatch')
    return bytes(result)

def files(image):
    data=Path(image).read_bytes()
    boots=[a for a in range(0,min(len(data)-512,1024*1024),512) if data[a+3]==0x88 and data[a+510:a+512]==b'\x55\xaa']
    if len(boots)!=1:raise ValueError('Expected one RedSea boot record')
    root=struct.unpack_from('<Q',data,boots[0]+24)[0];size=struct.unpack_from('<Q',data,root*512+48)[0]
    seen=set();result={}
    def walk(block,size,parent=''):
        if block in seen:return
        seen.add(block)
        if size%64 or block*512+size>len(data):raise ValueError('Invalid directory')
        for at in range(block*512,block*512+size,64):
            attr=struct.unpack_from('<H',data,at)[0];name=data[at+2:at+40].split(b'\0')[0].decode('latin1');start,length=struct.unpack_from('<QQ',data,at+40)
            if not name or name in ('.','..') or start==block or attr&256:continue
            if '/' in name or '\\' in name:raise ValueError('Invalid filename')
            path=parent+'/'+name
            if attr&16:
                if start:walk(start,length,path)
            else:
                if start*512+length>len(data):raise ValueError('Invalid file range')
                result[path]=data[start*512:start*512+length]
    walk(root,size)
    return result

if __name__=='__main__':
    import sys
    image,out,prefix=sys.argv[1:]
    out=Path(out);count=0
    for path,data in files(image).items():
        if not path.startswith(prefix):continue
        path=path[len(prefix):].lstrip('/')
        if path.endswith('.Z'):data=expand(data);path=path[:-2]
        target=out/path
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);count+=1
    print('Extracted',count,'files to',out)
