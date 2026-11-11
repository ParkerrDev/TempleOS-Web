import argparse
import base64
import gzip
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
from Capture import Qmp,screen_text,Hash

parser=argparse.ArgumentParser(description="Independent native XMM lane/x87 TOP capture witness")
for name in ("disk","font","out"):parser.add_argument("--"+name,type=Path,required=True)
parser.add_argument("--occupied",action="store_true")
parser.add_argument("--record",action="store_true",help="replace the native register/evidence fixtures")
args=parser.parse_args();here=Path(__file__).resolve().parent
work=args.out.resolve();work.mkdir(parents=True,exist_ok=False)
source=(here/"fixtures/Xmm.HC").read_text()
if args.occupied:
    needle="  DU8 0xD9,0xF7,0xD9,0xF7,0xD9,0xF7;"
    assert source.count(needle)==1
    source=source.replace(needle,needle+"\n  DU8 0xD9,0xE8;")
(work/"Probe.HC").write_text(source)
font=base64.b64decode(re.search(r'const B64 = "([^"]+)"',args.font.read_text())[1])
with tempfile.TemporaryDirectory(prefix="fpu-proof-") as temp:
    temp=Path(temp)
    with gzip.open(args.disk,"rb") as src,(temp/"disk").open("wb") as dst:shutil.copyfileobj(src,dst)
    image=work/"disk.raw"
    subprocess.run(["qemu-img","convert","-O","raw",str(temp/"disk"),str(image)],check=True)
    subprocess.run(["node",str(here/"Inject.mjs"),str(image),str(work/"Probe.HC")],check=True)
    sock=temp/"qmp.sock";log=work/"debug.log"
    cmd=["qemu-system-x86_64","-accel","kvm","-cpu","host","-m","384M","-smp","1",
        "-drive",f"file={image},format=raw,if=ide,index=0","-vga","std","-display","none",
        "-qmp",f"unix:{sock},server=on,wait=off","-debugcon",f"file:{log}"]
    with (work/"qemu.log").open("wb") as errors:
        proc=subprocess.Popen(cmd,stdout=errors,stderr=errors);qmp=None;deadline=time.monotonic()+120
        def Wait(fn,why):
            while time.monotonic()<deadline:
                if proc.poll() is not None:raise RuntimeError("QEMU exited")
                if fn():return
                time.sleep(.1)
            raise TimeoutError(why)
        def Screen():
            p=work/"screen.ppm";qmp.command("screendump",{"filename":str(p)})
            text=screen_text(p,font);(work/"screen.txt").write_text(text);return text
        try:
            Wait(sock.exists,"QMP");qmp=Qmp(sock)
            def Menu():
                p=work/"vga.bin";qmp.monitor(f'pmemsave 0xb8000 4000 "{p}"')
                return b"Selection:" in p.read_bytes()[::2]
            Wait(Menu,"boot menu");qmp.type("1\n")
            Wait(lambda:"Take Tour(y or n)?" in Screen(),"native desktop")
            qmp.monitor("sendkey ctrl-alt-t 10");time.sleep(.25)
            qmp.type('#include "C:/Home/SNAPFPU.HC";\n')
            def Ready():
                if log.exists() and b"~" in log.read_bytes():return True
                text=Screen()
                if "Except:Compiler" in text or "Fault:0x" in text:raise RuntimeError(text)
                return False
            Wait(Ready,"native register witness");qmp.command("stop")
            raw=qmp.monitor("info registers -a");(work/"registers.txt").write_text(raw)
            values=[0x0123456789ABCDEF+i*0x0101010101010101 for i in range(32)]
            for i in range(16):
                m=re.search(f"XMM{i:02d}=([0-9a-f]+) ([0-9a-f]+)",raw,re.I)
                assert m and int(m[1],16)==values[2*i+1] and int(m[2],16)==values[2*i],(i,m)
            fpu=re.search(r"FCW=([0-9a-f]+) FSW=([0-9a-f]+) \[ST=(\d+)\] FTW=([0-9a-f]+)",raw,re.I)
            assert int(fpu[1],16)==0x77f and int(fpu[2],16)==(0x1000 if args.occupied else 0x1800)
            assert int(fpu[3])==(2 if args.occupied else 3) and int(fpu[4],16)==(4 if args.occupied else 0)
            evidence={"backend":subprocess.check_output(["qemu-system-x86_64","--version"],text=True).splitlines()[0],
                "accel":"kvm","mode":"occupied" if args.occupied else "empty","cw":fpu[1],"sw":fpu[2],"top":int(fpu[3]),"ftw":fpu[4],
                "sourceSha256":Hash(work/"Probe.HC"),"registerSha256":Hash(work/"registers.txt"),
                "inputDiskSha256":Hash(args.disk),"fontSha256":Hash(args.font),"driverSha256":Hash(Path(__file__)),
                "xmm":[{"lo":hex(values[2*i]),"hi":hex(values[2*i+1])} for i in range(16)]}
            (work/"evidence.json").write_text(json.dumps(evidence,indent=2)+"\n")
            if args.record:
                name="occupied" if args.occupied else "xmm"
                shutil.copyfile(work/"registers.txt",here/f"fixtures/{name}.txt")
                shutil.copyfile(work/"evidence.json",here/f"fixtures/{name}.json")
            print(json.dumps(evidence))
        finally:
            if proc.poll() is None:
                if qmp:
                    try:qmp.command("quit")
                    except (OSError,RuntimeError):pass
                try:proc.wait(timeout=5)
                except subprocess.TimeoutExpired:proc.kill();proc.wait()
