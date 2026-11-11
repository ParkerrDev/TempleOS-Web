import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";

export async function GrNew(source)
{
  const compiled=compileHolyC(source,{filename:"Gr.HC",lenient:false,resilient:false,
    exports:["SpriteGrRead","SpriteGrWrite","SpriteGrError","SpriteGrMax","MAlloc","Free","StrLen"]}),
    host=createHost({}),
    {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),
    fn=instance.exports,decoder=new TextDecoder();
  if (compiled.warnings.length) throw new Error(compiled.warnings.join("\n"));
  host.attach(instance);fn.__main();
  const maxSize=Number(fn.SpriteGrMax());
  function Convert(write,bytes,width,height)
  {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected sprite bytes.");
    if (bytes.length>maxSize) throw new Error("Sprite data exceeds the maximum GR size.");
    if (write && (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)))
      throw new Error("Sprite dimensions must be integers.");
    let input=0n,output=0n;
    try {
      input=fn.MAlloc(BigInt(bytes.length+16),0n);
      new Uint8Array(fn.memory.buffer).set(bytes,Number(input+16n));
      if (write) output=fn.SpriteGrWrite(input+16n,BigInt(bytes.length),
        BigInt(width),BigInt(height),input);
      else output=fn.SpriteGrRead(input+16n,BigInt(bytes.length),input,input+8n);
      const error=Number(fn.SpriteGrError());
      if (error) {
        const length=Number(fn.StrLen(BigInt(error))),
          message=new Uint8Array(fn.memory.buffer,error,length);
        throw new Error(decoder.decode(message));
      }
      const meta=new DataView(fn.memory.buffer),first=Number(meta.getBigInt64(Number(input),true));
      let size=first;
      if (!write) {
        width=first;height=Number(meta.getBigInt64(Number(input+8n),true));
        size=width*height;
      }
      const result=new Uint8Array(fn.memory.buffer,Number(output),size).slice();
      return write?result:{width,height,indices:result};
    } finally {
      fn.Free(output);fn.Free(input);
    }
  }
  return {maxSize,encodeGR:(bytes,width,height)=>Convert(true,bytes,width,height),
    decodeGR:bytes=>Convert(false,bytes)};
}

let pending;
export function GrLoad()
{
  if (!pending) pending=(async function () {
    const response=await fetch(new URL("Gr.HC",import.meta.url));
    if (!response.ok) throw new Error("Could not load the TempleOS sprite codec.");
    return GrNew(await response.text());
  })().catch(error=>{pending=null;throw error;});
  return pending;
}
