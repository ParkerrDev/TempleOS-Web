import socket, json, subprocess, time, os
# SMP feasibility: boot TempleOS under QEMU -smp 4 (TCG), confirm it reaches the desktop with 4
# CPUs online, screendump it, and dump all cores' registers (info registers -a). Decides whether
# a multi-core snapshot is capturable for hemu SMP.
N = int(os.environ.get("SMP", "4"))
p=subprocess.Popen(["qemu-system-x86_64","-machine","pc","-m","384M","-accel","tcg","-smp",str(N),
  "-drive","file=/tmp/hemusnap/disk.qcow2,format=qcow2,if=ide,index=0","-boot","c",
  "-vga","std","-display","none","-qmp","unix:/tmp/hemusnap/qmpF.sock,server,nowait"],
  stderr=open("/tmp/hemusnap/qF.err","w"))
s=socket.socket(socket.AF_UNIX)
for _ in range(80):
  try: s.connect("/tmp/hemusnap/qmpF.sock"); break
  except Exception: time.sleep(0.5)
f=s.makefile("rwb",buffering=0)
def rj():
  while True:
    ln=f.readline()
    if not ln: return None
    try: return json.loads(ln)
    except Exception: continue
rj()
def q(ex,**a):
  m={"execute":ex}
  if a: m["arguments"]=a
  f.write((json.dumps(m)+"\n").encode())
  while True:
    r=rj()
    if r is None: return {}
    if "return" in r or "error" in r: return r
def hmp(c): return q("human-monitor-command", **{"command-line":c}).get("return","")
q("qmp_capabilities")
cpus=q("query-cpus-fast").get("return",[])
print("CPUs reported by QEMU:", len(cpus))
time.sleep(12); hmp("sendkey ret"); hmp("sendkey 1")
time.sleep(120)
for _ in range(3):
  hmp("sendkey esc"); time.sleep(0.5)
time.sleep(4)
q("stop"); time.sleep(1)
hmp("screendump /tmp/hemusnap/smp_screen.ppm"); time.sleep(1)
regs=hmp("info registers -a")
open("/tmp/hemusnap/regs_smp.txt","w").write(regs)
# count per-CPU blocks + whether each looks like it's in long mode running real code
ncpu_blocks = regs.count("RIP=")
open("/tmp/hemusnap/SMPRESULT","w").write("qemu_cpus=%d\nrip_blocks=%d\n\n%s"%(len(cpus),ncpu_blocks,regs[:4000]))
print("rip_blocks (per-CPU reg dumps):", ncpu_blocks)
ppm = os.path.getsize("/tmp/hemusnap/smp_screen.ppm") if os.path.exists("/tmp/hemusnap/smp_screen.ppm") else 0
print("screendump bytes:", ppm)
hmp("quit"); p.terminate()
print("done")
