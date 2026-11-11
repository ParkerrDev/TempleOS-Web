import gzip
import hashlib
from pathlib import Path
import subprocess
import tempfile

import sys
binary=Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory() as name:
    work=Path(name);source=work/"in.gz";output=work/"out.gz"
    payload=bytes((i*37+i//71)&255 for i in range(400001))
    encoded=gzip.compress(payload)
    def Run(mode="read"):
        return subprocess.run([str(binary),mode,str(source),*([str(output)] if mode!="read" else [])],capture_output=True,text=True)
    expected=f"{len(payload)} {hashlib.sha256(payload).hexdigest()}\n"
    for data in (encoded,gzip.compress(payload[:65536])+gzip.compress(payload[65536:])):
        source.write_bytes(data);result=Run()
        assert result.returncode==0 and result.stdout==expected,result
        result=Run("write");assert result.returncode==0,result.stderr
        assert gzip.decompress(output.read_bytes())==payload
    original=output.read_bytes()
    for data in (encoded[:-1],encoded[:-8],encoded[:10],encoded[:-8]+b"12345678",encoded+b"junk",payload):
        source.write_bytes(data);result=Run();assert result.returncode==1,result
        result=Run("write");assert result.returncode==1 and output.read_bytes()==original,result
    source.write_bytes(encoded);result=Run("cancel")
    assert result.returncode==1 and output.read_bytes()==original
    assert sorted(path.name for path in work.iterdir())==["in.gz","out.gz"]
    print("Native bounded gzip: single/concatenated members, chunk boundaries, CRC/truncation/trailing corruption and atomic failure/cancel preservation passed.")
