import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {createHemuHost} from "../../engine/host.js";
import {makeDisk} from "../../engine/qcow2.js";
import {SnapshotSave} from "../../engine/Snapshot.js";

export async function LegacySnapshot()
{//Historical CPU and RAM become a full fixture; the live stock loader never guesses their pairing.
  const meta=JSON.parse(readFileSync(new URL("./fixtures/legacy-smp.json",import.meta.url))),
    wasm=readFileSync(new URL("./fixtures/legacy-smp.wasm",import.meta.url)),
    gz=readFileSync(new URL("./fixtures/legacy-smp.ram.gz",import.meta.url)),
    diskGz=readFileSync(new URL("../../vendor/images/templeos-hd.qcow2.gz",import.meta.url)),
    Hash=b=>createHash("sha256").update(b).digest("hex");
  assert.equal(Hash(wasm),meta.sha256);assert.equal(Hash(gz),meta.ramSha256);
  assert.equal(Hash(diskGz),meta.diskSha256);
  const ram=gunzipSync(gz),memory=new WebAssembly.Memory({initial:512,maximum:8192,shared:true});
  let base=0;
  const host=createHemuHost({heapAbi:meta.heapAbi,snapLoad(a,u8){base=a;u8.set(ram,a);}});
  Object.assign(host.env,{mem:memory,__host_ns:()=>0n,__host_budget:()=>0n});
  const {instance}=await WebAssembly.instantiate(wasm,{env:host.env});host.attach(instance);
  instance.exports.__rt_init();instance.exports.__main();
  assert.ok(base>0);assert.equal(instance.exports.RamBase(),BigInt(base));
  const disk=makeDisk(gunzipSync(diskGz));
  return SnapshotSave({wasm,memory,disk,meta:{cores:4,base,heapAbi:meta.heapAbi,
    heapPtr:host.state.heapPtr,sp:Number(instance.exports.__sp.value),ipiAddr:meta.globals.g_ipi_pending,
    paused:true,rate:30,actualRate:30,repeat:false,budget:12000000,launch:null,guestPatches:[],
    keyboard:{queue:[],held:[],prefix:0,pause:0},
    pointer:{x:320,y:240,b:0,wheel:0,dx:0,dy:0,frameX:320,frameY:240,relative:false,reset:false}}});
}
