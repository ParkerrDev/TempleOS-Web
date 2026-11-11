//Node diagnostic preload: attach WASM names without changing instruction bodies.
//node --import ./tools/hemu/Profile.mjs --cpu-prof --cpu-prof-dir=/tmp SCRIPT
import {Module,uleb} from "../../holyc-wasm/src/wasm/emitter.js";
const Emit=Module.prototype.emit,encoder=new TextEncoder();
const Str=value=>{const bytes=encoder.encode(value);return [...uleb(bytes.length),...bytes];};
function BlockAddress(body) {
  //JIT entry byte guard starts with two blocks and its first guest RAM address.
  if(![2,0x40,2,0x40,0x41].every((v,i)=>body[i]===v))return null;
  let value=0,shift=0,i=5,b;
  do {b=body[i++];value|=(b&127)<<shift;shift+=7;}while(b&128 && shift<35);
  return value>>>0;
}
Module.prototype.emit=function NamedEmit() {
  const code=Emit.call(this),names=[];
  for(let i=0;i<this.importFuncs.length;i++)names.push([i,this.importFuncs[i].name]);
  this.funcs.forEach((fn,i)=>{
    let name=fn.name||"function";
    if(name==="blk") {
      const address=BlockAddress(fn.body.bytes);
      if(address!==null)name="guest-host-"+address.toString(16);
    }
    names.push([i+this.importFuncs.length,name]);
  });
  const map=[...uleb(names.length),...names.flatMap(([index,name])=>[...uleb(index),...Str(name)])],
    payload=[...Str("name"),1,...uleb(map.length),...map],
    section=Uint8Array.from([0,...uleb(payload.length),...payload]),out=new Uint8Array(code.length+section.length);
  out.set(code);out.set(section,code.length);return out;
};
