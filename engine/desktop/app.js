import {KEY,KeyInput} from "../../Keyboard.js";
import {SnapshotInspect} from "../Snapshot.js";
import {BusStop,BUS_VERSION} from "../CoreBus.js";
import {Speaker} from "../Speaker.js";

const $=id=>document.getElementById(id),canvas=$("screen"),ctx=canvas.getContext("2d",{alpha:false}),
  pixels=ctx.createImageData(640,480),rgba=new Uint32Array(pixels.data.buffer),palette=new Uint32Array(256);
let worker=null,aps=[],ctrl=null,paused=false,gamePointer=false,
  pointer={x:320,y:240,b:0,wheel:0},diskReady=false,guestReady=false,generation=0,
  bootRequest=0,lastBoot=null,faulted=false,busFailed=false;
const input=KeyInput(keys=>Post({cmd:"input",...pointer,keys,held:input.held()}));
const speaker=Speaker();
function Post(m) {
  if(busFailed&&m.cmd==="exportSnapshot") {
    Status("Shared RAM coordination failed. Restart TempleOS before saving.");return;
  }
  worker?.postMessage(m);
}
function Status(text) {$("status").textContent=text;}
function Ready() {
  $("restart").disabled=!lastBoot;
  $("pause").disabled=!guestReady||faulted;
  $("save").disabled=!(guestReady&&diskReady)||busFailed;
}
function Release() {input.reset();pointer.b=0;Post({cmd:"input",...pointer,keysUp:true,reset:true});}
function Stop(cancel=true) {
  if(cancel)bootRequest++;
  Release();
  generation++;
  if(ctrl)BusStop(ctrl);
  worker?.terminate();for (const ap of aps) ap.terminate();
  worker=null;aps=[];ctrl=null;guestReady=diskReady=false;speaker.Stop();Ready();
}
function Fault(message,coordination=false) {
  faulted=true;
  if(coordination){busFailed=true;if(ctrl)BusStop(ctrl);}
  paused=true;speaker.Pause(true);Post({cmd:"pause",value:true});$("pause").textContent="Resume";
  Ready();Status(message+" Restart TempleOS to retry.");console.error(message);
}
function SoundStart() {speaker.Resume().catch(error=>console.warn("Speaker:",error));}
window.addEventListener("pointerdown",SoundStart);
window.addEventListener("keydown",SoundStart);
function Message(m) {
  if (m.cmd==="frame") {
    const src=new Uint8Array(m.buf);
    for (let i=0;i<src.length;i++) rgba[i]=palette[src[i]];
    ctx.putImageData(pixels,0,0);$("fps").textContent=(m.fps??"—")+" FPS";
    canvas.dataset.frames=String(Number(canvas.dataset.frames||0)+1);Post({cmd:"ack"});
  } else if (m.cmd==="palette") {
    palette[m.index]=0xFF000000|(m.rgb&255)<<16|(m.rgb&0xFF00)|(m.rgb>>>16&255);
  } else if (m.cmd==="smpReady") canvas.dataset.cores=String(m.ncore);
  else if(m.cmd==="busReady")canvas.dataset.bus=m.ready?String(m.version):"legacy";
  else if(m.cmd==="guestPatch"&&m.state==="failed"&&!faulted)Status(m.msg);
  else if (m.cmd==="progress") {if(!faulted)Status(m.text);}
  else if (m.cmd==="guestReady") {guestReady=m.ok;Ready();if(!faulted)Status(m.ok?"TempleOS ready":m.probe.errors.join("; "));}
  else if (m.cmd==="diskInfo") {diskReady=m.ok;Ready();if(!faulted)Status(m.msg);}
  else if (m.cmd==="restored") {diskReady=true;Ready();if(!faulted)Status("Session restored");}
  else if (m.cmd==="settings") {
    if (m.rate!==null) $("rate").value=String(m.rate);$("repeat").checked=m.repeat;
    if (!m.ok) Status(m.msg);
  } else if (m.cmd==="paused") {if(faulted&&!m.value)return;paused=m.value;speaker.Pause(paused);$("pause").textContent=paused?"Resume":"Pause";}
  else if (m.cmd==="inputMode") gamePointer=!!m.capture;
  else if (m.cmd==="snd") speaker.Tone(m.f);
  else if (m.cmd==="error")Fault(m.msg,!!(ctrl&&Atomics.load(ctrl,1))||!m.retained);
  else if (m.cmd==="exportResult" && m.kind==="snapshot") {
    Ready();
    if (!m.ok) {Status(m.msg);return;}
    const a=document.createElement("a"),url=URL.createObjectURL(new Blob([m.buf],{type:"application/gzip"}));
    a.href=url;a.download="TempleOS-"+new Date().toISOString().replace(/[:.]/g,"-")+".hemu";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);Status("Session saved");
  }
}
async function Boot(gz,config) {
  const request=++bootRequest;
  try {
    const saved=await SnapshotInspect(gz,{busProtocol:BUS_VERSION}),
      cores=saved?.meta.cores||config.cores;
    if(request!==bootRequest)return;
    if(![1,4].includes(cores))throw new Error("A saved machine must have one or four CPUs");
    if (cores===4 && !crossOriginIsolated) throw new Error("Four cores need a cross-origin isolated local server");
    const wasmUrl=new URL(cores===4?"../../build/hemu-smp.wasm":"../../build/hemu.wasm",import.meta.url).href;
    let wasm,ipiAddr;
    if(cores===4) {
      wasm=saved?.wasm||new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
      ipiAddr=saved?.meta.ipiAddr||(await (await fetch(new URL("../../build/hemu-smp.json",import.meta.url))).json()).globals.g_ipi_pending;
    }
    if(request!==bootRequest)return;
    Stop(false);const current=generation;
    lastBoot={gz,config};paused=faulted=busFailed=false;Ready();
    speaker.Pause(saved?.meta.paused??false);
    $("pause").textContent="Pause";canvas.dataset.frames="0";canvas.dataset.cores="1";
    canvas.dataset.bus=cores===4?"pending":"single";Status("Starting TempleOS…");
    const init={cmd:"init",gz,wasmUrl,rate:Number($("rate").value),repeat:$("repeat").checked,welcome:config.stock&&!saved};
    try {
      worker=new Worker(new URL("../hemu-worker.js",import.meta.url),{type:"module"});
      worker.onmessage=e=>{if(current===generation)Message(e.data);};
      worker.onerror=e=>{if(current===generation)Fault(e.message,true);};
      worker.onmessageerror=()=>{if(current===generation)Fault("Unreadable main worker message",true);};
      if (cores===4) {
        const mem=new WebAssembly.Memory({initial:512,maximum:8192,shared:true});
        ctrl=new Int32Array(new SharedArrayBuffer(64));
        for(let core=1;core<cores;core++) {
          const ap=new Worker(new URL("../hemu-smp-worker.js",import.meta.url),{type:"module"});
          ap.onmessage=e=>{if(current===generation&&e.data.cmd==="error")Message(e.data);};
          ap.onerror=e=>{if(current===generation)Fault(e.message,true);};
          ap.onmessageerror=()=>{if(current===generation)Fault("Unreadable AP"+core+" message",true);};
          aps.push(ap);
          ap.postMessage({cmd:"init",role:"ap",core,mem,ctrl:ctrl.buffer,sc:{ncore:cores},
            wasmBytes:wasm,heapAbi:saved?.meta.heapAbi,busProtocol:BUS_VERSION,
            requiredBusProtocol:saved?.meta.requiredBusProtocol});
        }
        init.smp={mem,ctrl:ctrl.buffer,ncore:cores,ipiAddr,busProtocol:BUS_VERSION};
      }
      worker.postMessage(init);canvas.focus();
    } catch(error) {Stop(false);throw error;}
  } catch(error) {if(request===bootRequest)throw error;}
}
function Point(e) {
  const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/640,r.height/480);
  pointer.x=Math.max(0,Math.min(639,Math.round((e.clientX-r.left-(r.width-640*scale)/2)/scale)));
  pointer.y=Math.max(0,Math.min(479,Math.round((e.clientY-r.top-(r.height-480*scale)/2)/scale)));
}
canvas.addEventListener("pointerdown",e=>{
  e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);
  if(gamePointer && document.pointerLockElement!==canvas)canvas.requestPointerLock()?.catch(()=>{});
  Point(e);pointer.b=e.buttons&3;Post({cmd:"input",...pointer});
});
canvas.addEventListener("pointermove",e=>{
  if(document.pointerLockElement===canvas)Post({cmd:"input",...pointer,relative:true,dx:e.movementX,dy:e.movementY});
  else {Point(e);Post({cmd:"input",...pointer,relative:false});}
});
canvas.addEventListener("pointerup",e=>{pointer.b=e.buttons&3;Post({cmd:"input",...pointer});});
canvas.addEventListener("pointercancel",Release);canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("wheel",e=>{e.preventDefault();pointer.wheel+=Math.sign(e.deltaY);Post({cmd:"input",...pointer});},{passive:false});
window.addEventListener("keydown",e=>{
  if(document.activeElement!==canvas && document.pointerLockElement!==canvas)return;
  if(KEY[e.code]===undefined)return;e.preventDefault();if(!e.repeat)input.down(e.code,KEY[e.code]);
});
window.addEventListener("keyup",e=>{if(input.up(e.code))e.preventDefault();});
window.addEventListener("blur",Release);document.addEventListener("visibilitychange",()=>{if(document.hidden)Release();});
document.addEventListener("pointerlockchange",()=>{Release();});
$("pause").onclick=()=>{speaker.Pause(!paused);Post({cmd:"pause",value:!paused});};
$("restart").onclick=async()=>{
  if(!lastBoot||worker&&!faulted&&!confirm("Restart TempleOS from its boot session? Save first to keep your current work."))return;
  try {const {gz,config}=lastBoot;await Boot(gz,config);} catch(error) {Status(error.message);}
};
$("save").onclick=()=>{$("save").disabled=true;Status("Saving the complete machine…");Post({cmd:"exportSnapshot"});};
$("rate").onchange=()=>Post({cmd:"set",rate:Number($("rate").value)});
$("repeat").onchange=()=>Post({cmd:"set",repeat:$("repeat").checked});
$("full").onclick=async()=>{
  try {await document.documentElement.requestFullscreen();await navigator.keyboard?.lock?.();canvas.focus();}
  catch(e){Status(e.message);}
};
$("open").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  if(worker&&!confirm("Replace this machine with the selected session? Save first to keep your current work."))return;
  try {await Boot(await file.arrayBuffer(),{cores:1,stock:false});} catch(err) {Status(err.message);}
  e.target.value="";
};
window.addEventListener("beforeunload",e=>{if(worker){e.preventDefault();e.returnValue="";}});
window.addEventListener("pagehide",e=>{if(!e.persisted)Stop();});
try {
  const config=await (await fetch("/session.json")).json();
  await Boot(await (await fetch(config.boot)).arrayBuffer(),config);
} catch(err) {Status(err.message);console.error(err);}
