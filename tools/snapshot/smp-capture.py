import socket, json, subprocess, time, os
# M3: capture a MULTI-CORE TempleOS snapshot for hemu SMP. Boots -smp N, settles to the desktop with
# all cores idle (HLT) in the scheduler, pauses, dumps raw guest RAM (pmemsave, 384MiB) + every core's
# registers (info registers -a). Mirrors capture-snapshot.py's clean-desktop timing.
N = int(os.environ.get("SMP", "4"))
p=subprocess.Popen(["qemu-system-x86_64","-machine","pc","-m","384M","-accel","tcg","-smp",str(N),
  "-drive","file=/tmp/hemusnap/disk.qcow2,format=qcow2,if=ide,index=0","-boot","c",
  "-vga","std","-display","none","-qmp","unix:/tmp/hemusnap/qmpC.sock,server,nowait"],
  stderr=open("/tmp/hemusnap/qC.err","w"))
s=socket.socket(socket.AF_UNIX)
for _ in range(80):
  try: s.connect("/tmp/hemusnap/qmpC.sock"); break
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
print("cpus:", len(q("query-cpus-fast").get("return",[])))
time.sleep(12); hmp("sendkey ret"); hmp("sendkey 1")
time.sleep(120)
for _ in range(3):
  hmp("sendkey esc"); time.sleep(0.5)
time.sleep(4)
q("stop"); time.sleep(1)
regs=hmp("info registers -a"); open("/tmp/hemusnap/regs_smp.txt","w").write(regs)
hmp("screendump /tmp/hemusnap/smp_cap.ppm")
# raw physical RAM (0..384MiB) - exactly what hemu loads as guest RAM (QMP form: typed args)
print("pmemsave:", q("pmemsave", val=0, size=402653184, filename="/tmp/hemusnap/live-smp.bin"))
time.sleep(2)
sz=os.path.getsize("/tmp/hemusnap/live-smp.bin") if os.path.exists("/tmp/hemusnap/live-smp.bin") else 0
print("live-smp.bin bytes:", sz, " rip_blocks:", regs.count("RIP="))
hmp("quit"); p.terminate()
print("done")
