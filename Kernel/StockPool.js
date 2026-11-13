//Threads that inflate the parts of a stock RAM snapshot at once (StockPart.js).
//The engine worker starts them when it loads, so their modules load while the
//snapshot downloads, and ends them when the boot no longer needs them. Without
//shared memory (Safari is not cross-origin isolated) there are none, and the
//snapshot inflates whole as before.
import {StockParts,StockPartInflate} from "./StockPart.js";
import {STOCK_SEGMENTS} from "./StockSegments.js";

const THREADS_MAX=6,WAIT_MS=5000;

export function StockPoolStart()
{//Up to THREADS_MAX-1 helpers: the engine worker inflates one part itself.
  const res=[],n=Math.min(THREADS_MAX,globalThis.navigator?.hardwareConcurrency||1)-1;
  if(typeof Worker!=="function"||typeof SharedArrayBuffer!=="function"||!globalThis.crossOriginIsolated)
    return res;
  try {
    for(let i=0;i<n;i++) {
      //Each helper has a URL of its own: the browser revalidates one URL at a
      //time, so five requests for one file come one after another.
      const w=new Worker(new URL("./StockInflateWorker.js?"+i,import.meta.url),{type:"module"});
      w.failed="";
      w.onerror=e=>{e.preventDefault?.();w.failed=e.message||"an inflate thread failed";w.Done?.();};
      res.push(w);
    }
  } catch {StockPoolEnd(res);}
  return res;
}

export function StockPoolEnd(pool)
{
  for(const w of pool.splice(0))w.terminate();
}

function Help(w,part,buf)
{//The ranges one helper wrote.
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>w.Done(Error("an inflate thread did not answer")),WAIT_MS);
    w.Done=(error,wrote)=>{
      clearTimeout(timer);w.Done=null;
      if(error||w.failed)reject(error||Error(w.failed));
      else resolve(wrote);
    };
    if(w.failed) {w.Done();return;}
    w.onmessage=({data})=>w.Done?.(data.ok?null:Error(data.msg),data.wrote);
    w.onmessageerror=()=>w.Done?.(Error("an inflate thread could not read its part"));
    w.postMessage({part,buf},[part.bytes.buffer]);
  });
}

export async function StockPoolInflate(pool,gz,capture)
{//The RAM, the ranges written in it and the parts, or null when this
//snapshot has no cuts or there are no helpers: the caller then inflates it whole.
  const entry=STOCK_SEGMENTS[capture.gzipSha256];
  if(!pool.length||!entry||entry.size!==capture.ramBytes)return null;
  const parts=StockParts(gz,entry,pool.length+1),buf=new SharedArrayBuffer(entry.size),
    ram=new Uint8Array(buf),
    wrote=await Promise.all(parts.map((part,i)=>i?Help(pool[i-1],part,buf):StockPartInflate(part,ram)));
  return {ram,wrote:wrote.flat(),parts:parts.length};
}
