import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";
import {BibleReader} from "./Bible.js";

let core=null,words=null;
const bible=BibleReader();

async function Text(path)
{
  let res=await fetch(new URL(path,import.meta.url),
    {signal:AbortSignal.timeout(30000)});
  if (!res.ok)
    throw new Error("Could not load "+path+" ("+res.status+"). Try again.");
  return res.text();
}

async function Core()
{
  let source=await Text("./GodBits.HC"),r=compileHolyC(source,{
    filename:"GodBits.HC",lenient:false,
    exports:["GodFifoRst","GodBitsIns","GodBits"]}),
    host=createHost({}),res=await WebAssembly.instantiate(r.bytes,
      {env:host.env});
  host.attach(res.instance);
  res.instance.exports.__main();
  return res.instance.exports;
}

async function Run(msg)
{
  let fn,seed=new Uint32Array(1),bits,num_bits=21;
  if (!core)
    core=Core().catch(function (e) {core=null;throw e;});
  fn=await core;
  crypto.getRandomValues(seed);
  fn.GodFifoRst();
  fn.GodBitsIns(32n,BigInt(seed[0])^BigInt(msg.timing));
  if (msg.action=="word")
    num_bits=17;
  bits=Number(fn.GodBits(BigInt(num_bits)));
  if (msg.action=="passage")
    return bible.Passage(bits);
  if (msg.action=="word") {
    if (!words)
      words=Text("../assets/godwords.txt").then(function (text) {
        let list=text.split("\n").filter(Boolean);
        if (!list.length)
          throw new Error("The vocabulary is empty.");
        return list;
      }).catch(function (e) {words=null;throw e;});
    return (await words)[bits%(await words).length];
  }
  throw new Error("Unknown God tool.");
}

self.onmessage=async function (e) {
  try {
    self.postMessage({id:e.data.id,result:await Run(e.data)});
  } catch (error) {
    self.postMessage({id:e.data.id,error:error.message});
  }
};
