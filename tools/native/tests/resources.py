import json
import os
import resource
import subprocess
import sys
import time

start = time.monotonic()
run = subprocess.run(
    [sys.argv[1], "check", sys.argv[2]],
    env={**os.environ, "QT_QPA_PLATFORM": "offscreen"},
    capture_output=True,
    text=True,
)
usage = resource.getrusage(resource.RUSAGE_CHILDREN)
print(json.dumps({
    "exit": run.returncode,
    "wallSeconds": time.monotonic() - start,
    "userSeconds": usage.ru_utime,
    "systemSeconds": usage.ru_stime,
    "maxRssKiB": usage.ru_maxrss,
    "load": os.getloadavg(),
    "stdout": run.stdout,
    "stderr": run.stderr,
}))
