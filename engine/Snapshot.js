import {BusModuleVersion} from "./CoreBus.js";

const MAGIC=new TextEncoder().encode("HEMUSNP1"),PAGE=65536,CHUNK=131072;
const Fail=msg=>{throw new Error("Invalid HEMU snapshot: "+msg);};
const Int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const Hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");

function HeaderCheck(m)
{
  if (!m || ![1,2].includes(m.version)) Fail("unsupported version");
  if (m.version===1 && m.requiredBusProtocol!==undefined && m.requiredBusProtocol!==0 ||
      m.version===2 && (m.requiredBusProtocol!==1 || m.cores!==4)) Fail("unsupported RAM ownership requirement");
  if (m.guestPatches===undefined) m.guestPatches=[];
  if (!Array.isArray(m.guestPatches) || m.guestPatches.some(p=>p!=="doc-sprite-clip-v1") ||
      new Set(m.guestPatches).size!==m.guestPatches.length) Fail("unsupported guest patches");
  if (m.heapAbi===undefined) m.heapAbi=0;
  if (![0,1].includes(m.heapAbi)) Fail("unsupported allocator ABI");
  if (![1,4].includes(m.cores) || !Int(m.memoryBytes,32*1024*1024,512*1024*1024) || m.memoryBytes%PAGE ||
      !Int(m.wasmBytes,8,2*1024*1024) || !Int(m.diskBytes,512,1024*1024*1024) || m.diskBytes%512 ||
      !Int(m.heapPtr,1,m.memoryBytes) || !Int(m.base,1,m.memoryBytes-402653184) ||
      !Int(m.sp,1,32*1024*1024) || !Int(m.ipiAddr,0,m.memoryBytes-32) ||
      !/^[a-f0-9]{64}$/.test(m.engineHash) || typeof m.paused!=="boolean" ||
      ![0,30,60,120].includes(m.rate) || ![null,0,30,60,120].includes(m.actualRate) ||
      typeof m.repeat!=="boolean" || !Int(m.budget,1,24000000)) Fail("bad machine dimensions or settings: "+JSON.stringify({cores:m.cores,memoryBytes:m.memoryBytes,wasmBytes:m.wasmBytes,diskBytes:m.diskBytes,heapPtr:m.heapPtr,base:m.base,sp:m.sp,ipiAddr:m.ipiAddr,paused:m.paused,rate:m.rate,actualRate:m.actualRate,repeat:m.repeat,budget:m.budget}));
  if (!m.keyboard || !Array.isArray(m.keyboard.queue) || m.keyboard.queue.length>65536 ||
      m.keyboard.queue.some(n=>!Int(n,0,255)) || !Array.isArray(m.keyboard.held) ||
      m.keyboard.held.length>256 || m.keyboard.held.some(n=>!Int(n,0,383)) ||
      ![0,256].includes(m.keyboard.prefix) || !Int(m.keyboard.pause,0,5)) Fail("bad keyboard state");
  const p=m.pointer;
  if (!p || ["x","y","b","wheel","dx","dy","frameX","frameY"].some(k=>!Number.isFinite(p[k])) ||
      ["relative","reset"].some(k=>typeof p[k]!=="boolean")) Fail("bad pointer state");
  if (m.launch!==null && (!m.launch || typeof m.launch.name!=="string" || m.launch.name.length>4096 ||
      !Int(m.launch.slot,0,63) || !Int(m.launch.task,1,402653183))) Fail("bad launch state");
  return m;
}

function Reader(gz)
{//Bounded reads avoid a second full copy of the inflated machine.
  const reader=new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  let chunk=new Uint8Array(0),pos=0;
  async function Take(n,dst=new Uint8Array(n)) {
    let at=0;
    while (at<n) {
      if (pos===chunk.length) {
        const next=await reader.read();
        if (next.done) Fail("truncated data");
        chunk=next.value;pos=0;
      }
      const count=Math.min(n-at,chunk.length-pos);
      dst.set(chunk.subarray(pos,pos+count),at);pos+=count;at+=count;
    }
    return dst;
  }
  async function End() {
    if (pos!==chunk.length || !(await reader.read()).done) Fail("trailing data");
  }
  return {Take,End,Close:()=>reader.cancel().catch(()=>{})};
}

export async function SnapshotOpen(gz,{busProtocol=0}={})
{//null denotes the original stock RAM-only format, which keeps its old loader.
  const rd=Reader(gz);
  try {
    const sig=await rd.Take(8);
    if (!sig.every((v,i)=>v===MAGIC[i])) {await rd.Close();return null;}
    const n=new DataView((await rd.Take(4)).buffer).getUint32(0,true);
    if (!Int(n,2,65536)) Fail("header length");
    const meta=HeaderCheck(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await rd.Take(n))));
    if(meta.requiredBusProtocol && busProtocol!==meta.requiredBusProtocol)
      Fail("requires shared RAM protocol "+meta.requiredBusProtocol);
    const wasm=await rd.Take(meta.wasmBytes);
    if (await Hash(wasm)!==meta.engineHash || !WebAssembly.validate(wasm)) Fail("engine checksum or module");
    if(meta.requiredBusProtocol && BusModuleVersion(new WebAssembly.Module(wasm))!==meta.requiredBusProtocol)
      Fail("engine does not implement its required RAM protocol");
    return {meta,wasm,Close:rd.Close,async Restore(memory,{busProtocol=0}={}) {
      if(meta.requiredBusProtocol && busProtocol!==meta.requiredBusProtocol)
        Fail("requires shared RAM protocol "+meta.requiredBusProtocol);
      if (memory.buffer.byteLength>meta.memoryBytes) Fail("engine memory size");
      memory.grow((meta.memoryBytes-memory.buffer.byteLength)/PAGE);
      await rd.Take(meta.memoryBytes,new Uint8Array(memory.buffer));
      // Sparse disk chunks retain the complete image without allocating its empty sectors.
      const chunks=new Map(),overlay=new Map();
      for (let off=0;off<meta.diskBytes;off+=CHUNK) {
        const data=await rd.Take(Math.min(CHUNK,meta.diskBytes-off));
        if (data.some(v=>v!==0)) chunks.set(off/CHUNK,data);
      }
      await rd.End();
      return {virtualSize:meta.diskBytes,overlay,
        readInto(lba,count,dst,at) {
          for (let i=0;i<count;i++) {
            const offset=(lba+i)*512,buf=overlay.get(lba+i)||chunks.get(Math.floor(offset/CHUNK));
            const from=overlay.has(lba+i)?0:offset%CHUNK;
            if (buf) dst.set(buf.subarray(from,from+512),at+i*512);
            else dst.fill(0,at+i*512,at+(i+1)*512);
          }
        },
        writeInto(lba,count,src,at) {
          for (let i=0;i<count;i++) overlay.set(lba+i,src.slice(at+i*512,at+(i+1)*512));
        }};
    }};
  } catch (err) {await rd.Close();throw err;}
}

export async function SnapshotInspect(gz,options)
{//Read the engine and topology before creating the worker's shared memory.
  const saved=await SnapshotOpen(gz,options);
  if (!saved) return null;
  await saved.Close();
  return {meta:saved.meta,wasm:saved.wasm};
}

export async function SnapshotSave({meta,wasm,memory,disk})
{//Call with every guest core stopped until this promise settles.
  const header=HeaderCheck({...meta,version:meta.requiredBusProtocol?2:1,memoryBytes:memory.buffer.byteLength,
    diskBytes:disk.virtualSize,wasmBytes:wasm.byteLength,engineHash:await Hash(wasm)});
  if(header.requiredBusProtocol && BusModuleVersion(new WebAssembly.Module(wasm))!==header.requiredBusProtocol)
    Fail("engine does not implement its required RAM protocol");
  const json=new TextEncoder().encode(JSON.stringify(header));
  if (json.length>65536) Fail("header too long");
  const lead=new Uint8Array(12+json.length);
  lead.set(MAGIC);new DataView(lead.buffer).setUint32(8,json.length,true);lead.set(json,12);
  let stage=0,off=0;
  const source=new ReadableStream({pull(c) {
    if (stage===0) {c.enqueue(lead);stage++;}
    else if (stage===1) {c.enqueue(wasm);stage++;}
    else if (stage===2) {
      const end=Math.min(off+CHUNK,header.memoryBytes);
      c.enqueue(new Uint8Array(memory.buffer).slice(off,end));off=end;
      if (off===header.memoryBytes) {stage++;off=0;}
    } else if (off<header.diskBytes) {
      const bytes=new Uint8Array(Math.min(CHUNK,header.diskBytes-off));
      disk.readInto(off/512,bytes.length/512,bytes,0);off+=bytes.length;c.enqueue(bytes);
    } else c.close();
  }});
  return new Response(source.pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}
