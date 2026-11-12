import {makeDisk} from "./qcow2.js";

export const STOCK_SECTION="hemu.stock";
const ROOT=new URL("../hemu/",import.meta.url),RAM_BYTES=402653184;
const Fail=message=>{throw Error("Stock TempleOS capture: "+message);};
export const StockHash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
const HashValid=value=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
let pendingManifest;

export function StockManifestCheck(meta)
{
  if(meta?.version!==1||!meta.base||!Array.isArray(meta.captures)||meta.captures.length!==2)
    Fail("unsupported manifest");
  const b=meta.base;
  if(b.file!=="../vendor/images/templeos-hd.qcow2.gz"||!HashValid(b.gzipSha256)||!HashValid(b.rawSha256)||!Number.isSafeInteger(b.decodedBytes)||
      b.decodedBytes<512||b.decodedBytes>1024*1024*1024||b.virtualBytes!==268435456)
    Fail("invalid base disk identity");
  for(const [i,c] of meta.captures.entries()) {
    if(c.cores!==[1,4][i]||c.ramBytes!==RAM_BYTES||
        ["ramSha256","gzipSha256","registerSha256","sourceSha256","overlaySha256","diskSha256"].some(k=>!HashValid(c[k]))||
        ["ram","overlay","registers"].some(k=>typeof c[k]!=="string"||!/^[a-z0-9.-]+$/.test(c[k]))||
        !Number.isSafeInteger(c.overlayBytes)||c.overlayBytes<0||c.overlayBytes%516||c.overlayBytes>1024*1024)
      Fail("invalid capture identity");
  }
  return meta;
}

async function FetchBytes(url)
{//The server's cache headers decide: the site revalidates its own files, and
//the CDN paths it redirects to are named by commit and never change.
  const r=await fetch(url);
  if(!r.ok)Fail("fetch "+r.status+": "+url);
  return new Uint8Array(await r.arrayBuffer());
}

export async function StockManifest()
{
  pendingManifest??=FetchBytes(new URL("stock.json",ROOT)).then(bytes=>
    StockManifestCheck(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)))).catch(error=>{
      pendingManifest=null;throw error;
    });
  return pendingManifest;
}

export async function StockInflate(gz,size)
{
  const out=new Uint8Array(size),reader=new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  let offset=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done)break;
      if(offset+value.length>size)Fail("inflated image is larger than its captured size");
      out.set(value,offset);offset+=value.length;
    }
    if(offset!==size)Fail("truncated inflated image");
    return out;
  } finally {await reader.cancel().catch(()=>{});}
}

export async function StockIdentify(gz,cores,manifest)
{
  manifest??=await StockManifest();
  StockManifestCheck(manifest);
  if(cores!=null&&cores!==1&&cores!==4)Fail("unsupported CPU topology");
  const gzipHash=await StockHash(gz),candidates=manifest.captures.filter(c=>cores==null||c.cores===cores);
  const known=manifest.captures.find(c=>c.gzipSha256===gzipHash);
  if(known&&cores!=null&&known.cores!==cores)Fail("RAM-only image has mismatched CPU topology");
  let capture=candidates.find(c=>c.gzipSha256===gzipHash),ram;
  if(!capture) {
    ram=await StockInflate(gz,RAM_BYTES);
    const hash=await StockHash(ram);
    capture=candidates.find(c=>c.ramSha256===hash);
  }
  if(!capture)Fail("RAM-only image has missing or mismatched CPU state. Use a matching stock capture or a full .hemu saved session.");
  return {capture,manifest,ram};
}

export async function StockInspect(gz,cores)
{
  return (await StockIdentify(gz,cores)).capture;
}

export function StockModuleRecord(capture,manifest)
{
  return {version:1,cores:capture.cores,ramSha256:capture.ramSha256,
    registerSha256:capture.registerSha256,sourceSha256:capture.sourceSha256,
    diskSha256:capture.diskSha256,overlaySha256:capture.overlaySha256,baseSha256:manifest.base.gzipSha256};
}

export function StockModuleCheck(module,capture,manifest)
{
  const parts=WebAssembly.Module.customSections(module,STOCK_SECTION);
  if(parts.length!==1)Fail("engine has no matching captured CPU state");
  let actual;
  try {actual=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(parts[0]));}
  catch {Fail("engine capture metadata is invalid");}
  if(!actual||typeof actual!=="object"||Array.isArray(actual))Fail("engine capture metadata is invalid");
  const expected=StockModuleRecord(capture,manifest);
  if(Object.keys(actual).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>actual[k]!==v))
    Fail("engine CPU state does not match this RAM/disk capture");
}

export function StockOverlayApply(disk,bytes,capture)
{//Validate the whole ordered patch before writing any sector.
  if(bytes.byteLength!==capture.overlayBytes||bytes.byteLength%516)Fail("overlay size");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let previous=-1;
  for(let offset=0;offset<bytes.length;offset+=516) {
    const lba=view.getUint32(offset,true);
    if(lba<=previous||lba*512+512>disk.virtualSize)Fail("unordered or out-of-range overlay sector");
    previous=lba;
  }
  for(let offset=0;offset<bytes.length;offset+=516)
    disk.writeInto(view.getUint32(offset,true),1,bytes,offset+4);
  return disk;
}

export async function StockDiskFiles(capture,manifest)
{//The checked base image, inflated, and the capture's checked overlay.
  manifest??=await StockManifest();
  const [base,patch]=await Promise.all([FetchBytes(new URL("../vendor/images/templeos-hd.qcow2.gz",import.meta.url)),
    FetchBytes(new URL(capture.overlay,ROOT))]);
  if(await StockHash(base)!==manifest.base.gzipSha256)Fail("base disk checksum");
  if(await StockHash(patch)!==capture.overlaySha256)Fail("disk overlay checksum");
  return {raw:await StockInflate(base,manifest.base.decodedBytes),patch};
}

export function StockDiskMake({raw,patch},capture,manifest)
{
  const disk=makeDisk(raw);
  if(disk.virtualSize!==manifest.base.virtualBytes)Fail("base disk dimensions");
  return StockOverlayApply(disk,patch,capture);
}

export async function StockDiskLoad(capture,manifest)
{
  manifest??=await StockManifest();
  return StockDiskMake(await StockDiskFiles(capture,manifest),capture,manifest);
}

export async function StockDiskAside(capture,manifest)
{//StockDiskLoad, with the fetch, hashes and inflate in a worker of their own,
//so the emulator's thread keeps drawing frames. Where a worker cannot start
//one, it is done here.
  manifest??=await StockManifest();
  if(typeof Worker==="undefined")return StockDiskLoad(capture,manifest);
  const files=await new Promise((resolve,reject)=>{
    let worker;
    try {worker=new Worker(new URL("./StockDiskWorker.js",import.meta.url),{type:"module"});}
    catch {resolve(null);return;}
    worker.onmessage=e=>{
      worker.terminate();
      if(e.data?.ok)resolve(e.data);
      else reject(new Error(e.data?.msg||"Stock TempleOS capture: disk worker failed"));
    };
    worker.onerror=e=>{e.preventDefault?.();worker.terminate();resolve(null);};
    worker.postMessage({capture,manifest});
  });
  return files?StockDiskMake(files,capture,manifest):StockDiskLoad(capture,manifest);
}
