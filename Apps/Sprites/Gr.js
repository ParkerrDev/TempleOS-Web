import {createHost} from "../../hemu/holyc-wasm/src/runtime/host.js";
import {MAX_FRAMES,MAX_PIXELS} from "./SpriteCodec.js";

export async function GrNew(bytes)
{
  const host=createHost({}),
    {instance}=await WebAssembly.instantiate(bytes,{env:host.env}),
    fn=instance.exports,decoder=new TextDecoder(),encoder=new TextEncoder();
  host.attach(instance);fn.__main();
  const maxSize=Number(fn.SpriteGrMax());
  function Dimensions(width,height)
  {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width<1 || width>640 || height<1 || height>480)
      throw new Error("Sprite dimensions must be 1 to 640 by 1 to 480.");
  }
  function Run(bytes,call,size,clamped=false)
  {
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof Uint8ClampedArray))
      throw new TypeError("Expected sprite bytes.");
    const stack=fn.__sp.value;
    let input=0n,output=0n;
    try {
      input=fn.MAlloc(BigInt(bytes.length+16),0n);
      new Uint8Array(fn.memory.buffer).set(bytes,Number(input+16n));
      output=call(input+16n,BigInt(bytes.length),input);
      const error=Number(fn.SpriteGrError());
      if (error) throw new Error(decoder.decode(new Uint8Array(fn.memory.buffer,
        error,Number(fn.StrLen(BigInt(error))))));
      const meta=new DataView(fn.memory.buffer,Number(input),16),
        length=typeof size==="function"?size(meta):size??Number(meta.getBigInt64(0,true)),
        ArrayType=clamped?Uint8ClampedArray:Uint8Array;
      return new ArrayType(fn.memory.buffer,Number(output),length).slice();
    } finally {
      fn.__sp.value=stack;
      try {fn.Free(output);}
      finally {
        try {fn.Free(input);}
        finally {fn.__sp.value=stack;}
      }
    }
  }
  return {
    maxSize,
    encodeGR(bytes,width,height) {
      Dimensions(width,height);
      if (bytes.length>maxSize) throw new Error("Sprite data exceeds the maximum GR size.");
      return Run(bytes,(src,cnt,meta)=>fn.SpriteGrWrite(src,cnt,BigInt(width),BigInt(height),meta));
    },
    decodeGR(bytes) {
      if (bytes.length>maxSize) throw new Error("Sprite data exceeds the maximum GR size.");
      let width,height;
      const indices=Run(bytes,(src,cnt,meta)=>fn.SpriteGrRead(src,cnt,meta,meta+8n),meta=>{
        width=Number(meta.getBigInt64(0,true));height=Number(meta.getBigInt64(8,true));
        return width*height;
      });
      return {width,height,indices};
    },
    quantize(bytes,width,height,dither=false,alpha=128,{strength=35}={}) {
      Dimensions(width,height);
      const mode=dither==="stable"?2:dither===true||dither==="fs"?1:0;
      if (mode===2 && !Number.isFinite(strength))
        throw new Error("Dither strength must be between 0 and 100.");
      return Run(bytes,(src,cnt)=>fn.SpriteQuantize(src,cnt,BigInt(width),BigInt(height),
        BigInt(mode),Number(alpha),Number(strength)),width*height);
    },
    toRGBA(bytes,width,height) {
      Dimensions(width,height);
      return Run(bytes,(src,cnt)=>fn.SpriteRGBA(src,cnt,BigInt(width),BigInt(height)),width*height*4,true);
    },
    encodeGIF(frames,width,height,delay) {
      Dimensions(width,height);
      if (!frames.length || frames.length>MAX_FRAMES || frames.length*width*height>MAX_PIXELS)
        throw new Error("Animation exceeds the frame or pixel limit.");
      if (!Number.isFinite(delay)) throw new Error("Invalid frame delay.");
      const bytes=new Uint8Array(frames.length*width*height);
      frames.forEach((frame,i)=>{
        if (frame.length!==width*height) throw new Error("Invalid indexed frame length.");
        bytes.set(frame,i*width*height);
      });
      return Run(bytes,(src,cnt,meta)=>fn.SpriteGif(src,cnt,BigInt(width),BigInt(height),
        BigInt(frames.length),Number(delay),meta));
    },
    zipFiles(files) {
      const names=files.map(file=>encoder.encode(file.name));
      let at=files.length*32;
      const bytes=new Uint8Array(at+files.reduce((n,file,i)=>n+names[i].length+file.bytes.length,0)),
        view=new DataView(bytes.buffer);
      files.forEach((file,i)=>{
        for (const [field,value] of [at,at+names[i].length,names[i].length,file.bytes.length].entries())
          view.setBigInt64(i*32+field*8,BigInt(value),true);
        bytes.set(names[i],at);at+=names[i].length;
        bytes.set(file.bytes,at);at+=file.bytes.length;
      });
      return Run(bytes,(src,cnt,meta)=>fn.SpriteZip(src,cnt,BigInt(files.length),meta));
    }
  };
}

let pending;
export function GrLoad()
{
  if (!pending) pending=(async function () {
    const response=await fetch(new URL("../../build/Gr.wasm",import.meta.url));
    if (!response.ok) throw new Error("Could not load the TempleOS sprite codec.");
    return GrNew(await response.arrayBuffer());
  })().catch(error=>{pending=null;throw error;});
  return pending;
}
