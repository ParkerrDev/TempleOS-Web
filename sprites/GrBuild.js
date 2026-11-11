export async function GrBuild(source)
{
  if (typeof document=="undefined") {
    const {compileHolyC}=await import("../holyc-wasm/src/compiler.js"),
      {bytes,warnings}=compileHolyC(source,{filename:"Gr.HC",lenient:false,resilient:false,
        exports:["SpriteGrRead","SpriteGrWrite","SpriteGrError","SpriteGrMax","MAlloc","Free","StrLen"]});
    return {bytes,warnings};
  }
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("GrWorker.js",import.meta.url),{type:"module"});
    function Finish(error,result)
    {
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    }
    worker.onmessage=({data})=>Finish(data.error?new Error(data.error):null,data);
    worker.onerror=event=>{
      event.preventDefault();
      Finish(new Error(event.message || "Could not compile the TempleOS sprite codec."));
    };
    worker.onmessageerror=()=>Finish(new Error("Could not read the compiled sprite codec."));
    try {worker.postMessage(source);}
    catch (error) {Finish(error);}
  });
}
