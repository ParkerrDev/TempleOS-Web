import argparse
import base64
import collections
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time

class Qmp:
    def __init__(self, path):
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.settimeout(10)
        self.socket.connect(str(path))
        self.stream = self.socket.makefile("rwb", buffering=0)
        self.stream.readline()
        self.command("qmp_capabilities")

    def command(self, name, arguments=None):
        request = {"execute": name}
        if arguments:
            request["arguments"] = arguments
        self.stream.write((json.dumps(request) + "\n").encode())
        while True:
            line = self.stream.readline()
            if not line:
                raise RuntimeError("QEMU disconnected")
            response = json.loads(line)
            if "error" in response:
                raise RuntimeError(str(response["error"]))
            if "return" in response:
                return response["return"]

    def monitor(self, command):
        return self.command("human-monitor-command", {"command-line": command})

    def type(self, text):
        keys = {"\n": "ret", " ": "spc", "/": "slash", ":": "shift-semicolon",
                ";": "semicolon", '"': "shift-apostrophe", "#": "shift-3",
                ".": "dot", "_": "shift-minus"}
        for char in text:
            key = keys.get(char, "shift-" + char.lower() if char.isupper() else char)
            self.monitor("sendkey " + key + " 10")
            time.sleep(0.03)


def screen_text(path, font):
    data = path.read_bytes()
    header = re.match(rb"P6\s+(\d+)\s+(\d+)\s+255\s", data)
    if not header:
        raise RuntimeError("Unexpected QEMU screenshot format")
    width, height = map(int, header.groups())
    pixels = memoryview(data)[header.end():]
    glyphs = {font[ch * 8:ch * 8 + 8]: chr(ch) for ch in range(32, 127)}
    lines = []
    for y in range(0, height - 7, 8):
        line = ""
        for x in range(0, width - 7, 8):
            cell = [bytes(pixels[((y + row) * width + x + col) * 3:]
                          [:3]) for row in range(8) for col in range(8)]
            background = collections.Counter(cell).most_common(1)[0][0]
            bits = bytes(sum((cell[row * 8 + col] != background) << col
                             for col in range(8)) for row in range(8))
            line += glyphs.get(bits, " ")
        lines.append(line)
    return "\n".join(lines)


def Hash(path):
    with open(path,"rb") as stream:
        return hashlib.file_digest(stream,"sha256").hexdigest()


def Main(default_cores=1):
    parser=argparse.ArgumentParser(description="Capture a matched native TempleOS RAM/disk/register set")
    parser.add_argument("--cores",type=int,choices=(1,4),default=default_cores)
    parser.add_argument("--disk",type=Path,required=True)
    parser.add_argument("--font",type=Path,required=True,help="native font.js exported from TempleOS")
    parser.add_argument("--out",type=Path,required=True)
    parser.add_argument("--accel",choices=("kvm","tcg"),default="kvm")
    parser.add_argument("--timeout",type=float,default=180)
    args=parser.parse_args()
    work=args.out.resolve();work.mkdir(parents=True,exist_ok=False)
    disk=args.disk.resolve();image=work/"disk.raw"
    with tempfile.TemporaryDirectory(prefix="hemu-capture-") as temp:
        temp=Path(temp);decoded=temp/"disk"
        if disk.suffix==".gz":
            with gzip.open(disk,"rb") as src,decoded.open("wb") as dst:
                shutil.copyfileobj(src,dst)
        else:
            shutil.copyfile(disk,decoded)
        subprocess.run(["qemu-img","convert","-O","raw",str(decoded),str(image)],check=True)
        initial_disk=Hash(image)
        font=base64.b64decode(re.search(r'const B64 = "([^"]+)"',args.font.read_text())[1])
        socket_path=temp/"qmp.sock"
        command=["qemu-system-x86_64","-machine","pc","-accel",args.accel,
            "-cpu","host" if args.accel=="kvm" else "max","-m","384M","-smp",str(args.cores),
            "-drive",f"file={image},format=raw,if=ide,index=0","-vga","std","-display","none",
            "-qmp",f"unix:{socket_path},server=on,wait=off"]
        (work/"command.json").write_text(json.dumps(command,indent=2)+"\n")
        with (work/"qemu.log").open("wb") as errors:
            proc=subprocess.Popen(command,stdout=errors,stderr=errors)
            qmp=None;deadline=time.monotonic()+args.timeout;samples=[]
            def Wait(fn,reason):
                while time.monotonic()<deadline:
                    if proc.poll() is not None:raise RuntimeError(f"QEMU exited; see {work}")
                    if fn():return
                    time.sleep(.05)
                raise TimeoutError(f"{reason}; see {work}")
            try:
                Wait(socket_path.exists,"QMP socket");qmp=Qmp(socket_path)
                def Menu():
                    path=work/"vga.bin";qmp.monitor(f'pmemsave 0xb8000 4000 "{path}"')
                    return b"Selection:" in path.read_bytes()[::2]
                Wait(Menu,"native boot menu");qmp.type("1\n")
                def Desktop():
                    path=work/"screen.ppm";qmp.command("screendump",{"filename":str(path)})
                    text=screen_text(path,font);(work/"screen.txt").write_text(text)
                    return "Take Tour(y or n)?" in text
                # The question stays open: a visitor answers it, as on a fresh install.
                Wait(Desktop,"native shell")
                def Quiescent():
                    qmp.command("stop")
                    raw=qmp.monitor("info registers -a")
                    blocks=re.split(r"CPU#\d+",raw)[1:]
                    states=[]
                    for block in blocks:
                        m=re.search(r"FCW=([0-9a-f]+) FSW=([0-9a-f]+) \[ST=(\d+)\] FTW=([0-9a-f]+) MXCSR=([0-9a-f]+)",block,re.I)
                        states.append({"halted":"HLT=1" in block,"fpu":m.groups() if m else None})
                    samples.append(states)
                    (work/"last-registers.txt").write_text(raw)
                    if len(states)==args.cores and all(s["halted"] and s["fpu"] and
                            int(s["fpu"][3],16)==0 and int(s["fpu"][4],16)==0x1f80 for s in states):
                        (work/"registers.txt").write_text(raw)
                        return True
                    qmp.command("cont");return False
                Wait(Quiescent,"all CPUs halted with empty x87 stacks")
                # The same strict parser used by publication must accept this stopped state.
                script=Path(__file__).with_name("bake-regs-smp.mjs" if args.cores==4 else "bake-regs.mjs")
                subprocess.run(["node",str(script),str(work/"registers.txt"),str(work/"snapregs.HC")],check=True)
                if qmp.command("query-status")["status"]!="paused":raise RuntimeError("Capture resumed unexpectedly")
                qmp.monitor(f'pmemsave 0 0x18000000 "{work / "live.bin"}"')
                if (work/"live.bin").stat().st_size!=402653184:raise RuntimeError("Incomplete RAM capture")
                qmp.command("screendump",{"filename":str(work/"captured.ppm")})
                qmp.command("quit");proc.wait(timeout=10)
                evidence={"backend":subprocess.check_output(["qemu-system-x86_64","--version"],text=True).splitlines()[0],
                    "accel":args.accel,"cores":args.cores,"inputDiskSha256":Hash(disk),"inputRawDiskSha256":initial_disk,
                    "fontSha256":Hash(args.font),"captureScriptSha256":Hash(Path(__file__)),
                    "parserSha256":Hash(Path(__file__).with_name("Regs.mjs")),"samples":len(samples),
                    "files":{name:{"bytes":(work/name).stat().st_size,"sha256":Hash(work/name)}
                        for name in ("live.bin","disk.raw","registers.txt","snapregs.HC","captured.ppm")}}
                (work/"samples.json").write_text(json.dumps(samples,indent=2)+"\n")
                (work/"evidence.json").write_text(json.dumps(evidence,indent=2)+"\n")
                print(json.dumps(evidence))
            finally:
                if proc.poll() is None:
                    if qmp:
                        try:qmp.command("quit")
                        except (OSError,RuntimeError):pass
                    try:proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:proc.kill();proc.wait()


if __name__=="__main__":
    Main()
