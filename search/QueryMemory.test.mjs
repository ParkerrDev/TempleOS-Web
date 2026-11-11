import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";

const source=await readFile(new URL("Query.HC",import.meta.url),"utf8"),
  compiled=compileHolyC(source,{filename:"Query.HC",lenient:false,
    exports:["SearchQuery","MAlloc","Free","StrLen"]}),
  host=createHost({}),allocate=host.env.__malloc;
let calls=0,failAt=Infinity;
host.env.__malloc=(...args)=>++calls===failAt?0n:allocate(...args);
const {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),
  fn=instance.exports;
host.attach(instance);fn.__main();

// Exercise the native ownership contract directly, with failure at each heap
// allocation. The host owns the input and returned JSON; SearchQuery owns the
// intermediate token/context/output buffers until it returns successfully.
function Parse(text)
{
  let input=0n,output=0n;
  try {
    const bytes=Buffer.from(text);
    input=fn.MAlloc(BigInt(bytes.length+1),0n);
    new Uint8Array(fn.memory.buffer).set(bytes,Number(input));
    new Uint8Array(fn.memory.buffer)[Number(input)+bytes.length]=0;
    output=fn.SearchQuery(input);
    return JSON.parse(Buffer.from(fn.memory.buffer,Number(output),
      Number(fn.StrLen(output))).toString());
  } finally {
    fn.Free(output);fn.Free(input);
  }
}

const query='word OR second "quoted phrase" -negative date:2016,2017-11 in:title',
  expected=Parse(query),allocations=calls,baseline=host.state.heapPtr;
for (let i=1;i<=allocations;i++) {
  failAt=calls+i;
  assert.throws(()=>Parse(query));
  assert.equal(host.state.heapPtr,baseline,"allocation failure "+i+" leaked");
  failAt=Infinity;
  assert.deepEqual(Parse(query),expected);
  assert.equal(host.state.heapPtr,baseline,"retry leaked");
}
assert.throws(()=>Parse("x".repeat(8193)));
assert.equal(host.state.heapPtr,baseline,"oversize query leaked its input");
console.log("Search ownership: "+allocations+" allocation failures, clean retries and length rejection pass.");
