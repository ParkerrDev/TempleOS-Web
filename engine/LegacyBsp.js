export async function LegacyBsp(m)
{//The old SMP demo uses the production BSP, including its clock and capture rules.
  const send=self.postMessage.bind(self),pending=new Map(),game=m.sc?.game;
  let startGame=false,sequence=0,guestReady=false,diskReady=false;
  self.postMessage=(msg,transfer)=>{
    send(msg,transfer);
    if(msg.cmd==="smpReady")send({cmd:"ready"});
    if(msg.cmd==="fileResult" && pending.has(msg.id)){
      pending.get(msg.id)(msg);pending.delete(msg.id);
    }
    if(msg.cmd==="guestReady")guestReady=msg.ok;
    if(msg.cmd==="diskInfo")diskReady=msg.ok;
    if(game && guestReady && diskReady && !startGame){
      startGame=true;
      import("../game-packages.js").then(async({installGame})=>{
        const name=String(game).replace(/\.HC$/i,"");
        const write=(path,bytes)=>new Promise(resolve=>{
          const id="legacy-asset-"+(++sequence);pending.set(id,resolve);
          self.onmessage({data:{cmd:"osWrite",id,path,bytes}});
        });
        const options=await installGame(name==="TOOM"?"toom":"tinker-"+name,write);
        self.onmessage({data:{cmd:"osLaunch",id:"legacy-game",...options}});
      }).catch(err=>send({cmd:"error",msg:err.message}));
    }
  };
  await import("./hemu-worker.js");
  const wasmUrl=URL.createObjectURL(new Blob([m.wasmBytes],{type:"application/wasm"}));
  self.onmessage({data:{cmd:"init",gz:m.snapGz,wasmUrl,
    smp:{mem:m.mem,ctrl:m.ctrl,ipiAddr:m.sc.globals.g_ipi_pending,ncore:m.sc.ncore}}});
}
