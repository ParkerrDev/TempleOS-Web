import socket, json, subprocess, time, os
# Capture a snapshot with the WinMgr in its NORMAL timer-refresh loop: dismiss the
# AutoComplete popup (ESC) first, let it settle, THEN pause+dump. bootdump6 caught it
# blocked in AutoComplete-standby (an IPC message-wait), so nothing redrew on resume.
p=subprocess.Popen(["qemu-system-x86_64","-machine","pc","-m","384M","-accel","tcg",
  "-drive","file=/tmp/hemusnap/disk.qcow2,format=qcow2,if=ide,index=0","-boot","c",
  "-vga","std","-display","none","-qmp","unix:/tmp/hemusnap/qmpS.sock,server,nowait"],
  stderr=open("/tmp/hemusnap/qS.err","w"))
s=socket.socket(socket.AF_UNIX)
for _ in range(80):
  try: s.connect("/tmp/hemusnap/qmpS.sock"); break
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
time.sleep(12); hmp("sendkey ret"); hmp("sendkey 1")
time.sleep(108)
# Start God Song (F6) -> spawns a live music task (CurSongTask). Capture WHILE it plays so the
# snapshot has a live, running task (not the quiesced idle state).
hmp("sendkey f6"); time.sleep(0.6)
q("stop"); time.sleep(1)
reg=hmp("info registers"); open("/tmp/hemusnap/regs_song.txt","w").write(reg)
r=q("dump-guest-memory", paging=False, protocol="file:/tmp/hemusnap/core_song.elf")
sz=os.path.getsize("/tmp/hemusnap/core_song.elf") if os.path.exists("/tmp/hemusnap/core_song.elf") else 0
open("/tmp/hemusnap/RESULTS","w").write("dump_ret=%s\nelf=%d\n%s"%(json.dumps(r),sz,reg))
hmp("quit"); p.terminate()
print("done; elf=%d" % sz)
