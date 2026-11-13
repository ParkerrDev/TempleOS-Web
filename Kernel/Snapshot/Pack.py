import argparse
import gzip
import hashlib
import json
import mmap
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile


def Hash(path):
    with open(path,"rb") as stream:
        return hashlib.file_digest(stream,"sha256").hexdigest()


def Pack(base,one,four,out):
    out.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="stock-disk-") as temp:
        temp=Path(temp)
        with gzip.open(base,"rb") as src,(temp/"disk").open("wb") as dst:
            shutil.copyfileobj(src,dst)
        subprocess.run(["qemu-img","convert","-O","raw",str(temp/"disk"),str(temp/"base.raw")],check=True)
        base_hash=Hash(temp/"base.raw")
        meta={"version":1,"base":{"file":"../vendor/images/templeos-hd.qcow2.gz",
            "gzipSha256":Hash(base),"decodedBytes":(temp/"disk").stat().st_size,
            "rawSha256":base_hash,"virtualBytes":(temp/"base.raw").stat().st_size},"captures":[]}
        for cores,folder in [(1,one),(4,four)]:
            evidence=json.loads((folder/"evidence.json").read_text())
            if evidence["cores"]!=cores or evidence["inputRawDiskSha256"]!=base_hash or evidence["inputDiskSha256"]!=Hash(base):
                raise ValueError("Capture does not belong to this base disk/topology")
            for name,record in evidence["files"].items():
                if Hash(folder/name)!=record["sha256"] or (folder/name).stat().st_size!=record["bytes"]:
                    raise ValueError("Changed capture artifact: "+name)
            suffix="-smp" if cores==4 else ""
            ram=f"live{suffix}.bin.gz";overlay=f"stock{suffix}.disk";registers=f"capture{suffix}.txt"
            with (folder/"live.bin").open("rb") as src,(out/ram).open("wb") as stream:
                with gzip.GzipFile(filename="",mode="wb",fileobj=stream,compresslevel=9,mtime=0) as dst:
                    shutil.copyfileobj(src,dst)
            with (temp/"base.raw").open("rb") as a,(folder/"disk.raw").open("rb") as b:
                with mmap.mmap(a.fileno(),0,access=mmap.ACCESS_READ) as old,mmap.mmap(b.fileno(),0,access=mmap.ACCESS_READ) as new:
                    if len(old)!=len(new):raise ValueError("Changed disk dimensions")
                    patch=b"".join(struct.pack("<I",i//512)+new[i:i+512] for i in range(0,len(old),512) if old[i:i+512]!=new[i:i+512])
            (out/overlay).write_bytes(patch)
            shutil.copyfile(folder/"registers.txt",out/registers)
            subprocess.run(["node",str(Path(__file__).with_name(f"bake-regs{suffix}.mjs")),str(out/registers),str(out/f"snapregs{suffix}.HC")],check=True)
            record={"cores":cores,"ram":ram,"ramBytes":402653184,"ramSha256":Hash(folder/"live.bin"),
                "gzipSha256":Hash(out/ram),"registers":registers,"registerSha256":Hash(out/registers),
                "sourceSha256":Hash(out/f"snapregs{suffix}.HC"),"parserSha256":Hash(Path(__file__).with_name("Regs.mjs")),"overlay":overlay,"overlayBytes":len(patch),
                "overlaySha256":Hash(out/overlay),"diskSha256":Hash(folder/"disk.raw"),"evidence":evidence}
            meta["captures"].append(record)
        (out/"stock.json").write_text(json.dumps(meta,indent=2)+"\n")
        print(json.dumps({"captures":[{"cores":x["cores"],"ram":x["ramSha256"],"overlayBytes":x["overlayBytes"]} for x in meta["captures"]]}))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description="Package verified matched stock captures and tiny disk overlays")
    for name in ("base","one","four","out"):parser.add_argument("--"+name,type=Path,required=True)
    a=parser.parse_args();Pack(a.base,a.one,a.four,a.out)
