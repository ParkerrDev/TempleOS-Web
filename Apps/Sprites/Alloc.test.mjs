import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {GrNew} from "./Gr.js";

const wasm=await readFile(new URL("../../build/Gr.wasm",import.meta.url));
async function Load(kind)
{
  const instantiate=WebAssembly.instantiate,live=new Map();
  let calls=0,failAt=0,failFree=false,codec,ex;
  try {
    WebAssembly.instantiate=async (bytes,imports)=>{
      const env=imports.env,alloc=env.__malloc,free=env.__free;
      env.__malloc=(...args)=>{
        if (++calls===failAt) return 0n;
        const pointer=alloc(...args);
        if (pointer) live.set(pointer,Number(args[0]));
        return pointer;
      };
      env.__free=pointer=>{
        live.delete(pointer);free(pointer);
        if (pointer && failFree) {failFree=false;throw new Error("Injected free error");}
      };
      const result=await instantiate(bytes,imports);
      ex=result.instance.exports;
      return result;
    };
    codec=await GrNew(wasm);
  } finally {WebAssembly.instantiate=instantiate;}
  function Run()
  {
    return kind==="gif"?codec.encodeGIF([Uint8Array.of(6)],1,1,40):
      codec.quantize(Uint8Array.of(75,55,43,255),1,1,
        kind===2?"stable":kind===1,128,{strength:35});
  }
  return {Run,live,Fail(at=0){calls=0;failAt=at;},Calls:()=>calls,Stack:()=>ex.__sp.value,
    FailFree(){failFree=true;},Sizes:()=>[...live.values()].sort((a,b)=>a-b)};
}

let cases=0;
for (const kind of [0,1,2,"gif"]) for (const warm of [false,true]) {
  const reference=await Load(kind);
  if (warm) reference.Run();
  reference.Fail();
  const expected=reference.Run(),allocations=reference.Calls(),sizes=reference.Sizes();
  for (let failAt=1;failAt<=allocations;failAt++) {
    const codec=await Load(kind);
    if (warm) codec.Run();
    const before=new Map(codec.live),stack=codec.Stack();
    codec.Fail(failAt);
    assert.throws(codec.Run,undefined,`${kind}: allocation ${failAt} must fail`);
    assert.equal(codec.Calls(),failAt);
    assert.deepEqual(codec.live,before,`${kind}: failure frees temporary buffers and keeps existing caches`);
    assert.equal(codec.Stack(),stack,"failure restores the exported call's stack");
    codec.Fail();
    assert.deepEqual(codec.Run(),expected,"retry preserves output");
    assert.deepEqual(codec.Sizes(),sizes,"retry retains only the successful codec's owned memory");
    assert.deepEqual(codec.Run(),expected,"a repeated conversion reuses valid state");
    assert.deepEqual(codec.Sizes(),sizes,"repeated conversions do not accumulate buffers");
    assert.equal(codec.Stack(),stack,"retries restore the exported call's stack");
    cases++;
  }
}
{
  const codec=await Load(0);
  codec.Run();
  const before=new Map(codec.live),stack=codec.Stack();
  codec.FailFree();
  assert.throws(codec.Run,/Injected free error/);
  assert.deepEqual(codec.live,before,"cleanup attempts both owned buffers");
  assert.equal(codec.Stack(),stack,"a cleanup error also restores the stack");
}
console.log(`Sprite allocation failures: ${cases} cold/warm failures free temporary buffers, retain valid caches and retry with identical output.`);
