import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";

export async function ClipProgram(file,exports,error_name)
{
  let response=await fetch(new URL(file,import.meta.url));
  if (!response.ok) throw new Error("Could not load the clip program.");
  const compiled=compileHolyC(await response.text(),{filename:file,
    lenient:false,exports}),host=createHost({}),
    {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),
    fn=instance.exports;
  host.attach(instance);fn.__main();
  function Alloc(size)
  {
    const ptr=host.env.__malloc(BigInt(size));
    if (!ptr) throw new Error("Not enough memory for this clip.");
    return ptr;
  }
  function Put(bytes)
  {
    const ptr=Alloc(bytes.length);
    new Uint8Array(fn.memory.buffer).set(bytes,Number(ptr));
    return ptr;
  }
  function Call(name,...args)
  {
    let result,error;
    try {result=fn[name](...args);} catch (e) {error=e;}
    const p=Number(fn[error_name]());
    if (p) {
      const mem=new Uint8Array(fn.memory.buffer),end=mem.indexOf(0,p);
      throw new Error(new TextDecoder().decode(mem.subarray(p,end)));
    }
    if (error) throw error;
    return result;
  }
  function Copy(at,size)
  {
    return new Uint8Array(fn.memory.buffer).slice(Number(at),Number(at+size)).buffer;
  }
  function Input(name,bytes,...args)
  {
    const ptr=Put(bytes);
    try {return Call(name,ptr,BigInt(bytes.length),...args);}
    finally {host.env.__free(ptr);}
  }
  return {fn,Put,Call,Copy,Input,Alloc};
}
