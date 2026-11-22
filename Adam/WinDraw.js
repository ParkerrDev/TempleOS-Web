import {WinDocuments} from "./WinPopup.js";
import {PALETTE} from "../hemu/holyc-wasm/src/runtime/palette.js";

let cfg={native:false,scale:1.25},core=null,loading=null,frame=0,last=0;
const reduced=matchMedia("(prefers-reduced-motion:reduce)");
try {
  const saved=JSON.parse(localStorage.getItem("templeos.windraw"));
  cfg.native=saved?.native===true;
  if (Number.isFinite(saved?.scale)) cfg.scale=Math.max(1,Math.min(2,saved.scale));
} catch {}

export function WinDrawCfg(change)
{//The browser preference does not depend on a running guest.
  if (change) {
    if (change.native!==undefined) cfg.native=change.native===true;
    if (Number.isFinite(change.scale)) cfg.scale=Math.max(1,Math.min(2,change.scale));
    try {localStorage.setItem("templeos.windraw",JSON.stringify(cfg));} catch {}
    dispatchEvent(new CustomEvent("windrawsettings",{detail:{...cfg}}));
  }
  for (let doc of WinDocuments())
    doc.documentElement.style.setProperty("--win-scale",cfg.scale);
  if (cfg.native)
    WinDrawStart();
  else {
    cancelAnimationFrame(frame);
    frame=0;
    for (let doc of WinDocuments())
      doc.body.classList.remove("native-chrome");
  }
  return {...cfg};
}

async function WinDrawLoad()
{//Only the optional drawing code loads a HolyC runtime.
  let [{createHost},response]=await Promise.all([
    import("../hemu/holyc-wasm/src/runtime/host.js"),
    fetch(new URL("../build/WinDraw.wasm",import.meta.url))]),host,res;
  if (!response.ok)
    throw new Error("Window drawing could not load ("+response.status+").");
  host=createHost({onText:function () {}});
  res=await WebAssembly.instantiate(await response.arrayBuffer(),{env:host.env});
  host.attach(res.instance);
  res.instance.exports.__main();
  return res.instance.exports;
}

async function WinDrawStart()
{
  try {
    if (!loading)
      loading=WinDrawLoad();
    core=await loading;
    if (cfg.native && !frame) {
      for (let doc of WinDocuments())
        doc.body.classList.add("native-chrome");
      frame=requestAnimationFrame(WinDrawFrame);
    }
  } catch (error) {
    loading=null;
    WinDrawCfg({native:false});
    dispatchEvent(new CustomEvent("windrawerror",{detail:error.message}));
    console.error(error);
  }
}

function WinScrollPos(w,axis)
{
  let el=w._doc,pos,max;
  if (!el || !w.contains(el))
    return 0;
  if (axis=="x") {
    pos=el.scrollLeft;
    max=el.scrollWidth-el.clientWidth;
  } else {
    pos=el.scrollTop;
    max=el.scrollHeight-el.clientHeight;
  }
  if (max<=0)
    return 0;
  return Math.round(Math.min(1,Math.max(0,pos/max))*1000000);
}

function WinDrawOne(w,time)
{//Present indexed HolyC pixels; retain DOM controls for input and access.
  let rect=w.getBoundingClientRect(),width=Math.round(rect.width/cfg.scale),
    height=Math.round(rect.height/cfg.scale),canvas=w._draw,
    title=w.dataset.winTitle || "",mem,ptr,stride,src,dst,i,x,y,color,held=0;
  if (width<24 || height<24 || !w.getClientRects().length ||
      w.classList.contains("fsmode") || w.classList.contains("win-pass-owned"))
    return;
  if (width>4096 || height>4096)
    throw new RangeError("Native window drawing supports up to 4096 pixels per side.");
  if (!canvas) {
    canvas=document.createElement("canvas");
    canvas.className="wc wdraw";
    canvas.setAttribute("aria-hidden","true");
    w.prepend(canvas);
    w._draw=canvas;
  }
  if (canvas.width!=width || canvas.height!=height) {
    canvas.width=width;
    canvas.height=height;
    canvas._image=canvas.getContext("2d").createImageData(width,height);
  }
  canvas.style.width=rect.width+"px";
  canvas.style.height=rect.height+"px";
  ptr=Number(core.WinDrawTitle());
  mem=new Uint8Array(core.memory.buffer);
  for (i=0;i<Math.min(title.length,255);i++) {
    color=title.charCodeAt(i);
    if (color<31 || color==127 || color>255) color=46;
    mem[ptr+i]=color;
  }
  mem[ptr+i]=0;
  if (w._sh.classList.contains("on")) held|=1;
  if (w._sv.classList.contains("on")) held|=2;
  ptr=Number(core.WinDraw(BigInt(width),BigInt(height),
    BigInt(w.classList.contains("active")),BigInt(Math.floor(time)),
    BigInt(WinScrollPos(w,"x")),BigInt(WinScrollPos(w,"y")),BigInt(held),
    BigInt(!!w.querySelector(".wbar > .close"))));
  stride=Number(core.WinDrawStride());
  src=new Uint8Array(core.memory.buffer);
  dst=canvas._image.data;
  for (y=0;y<height;y++)
    for (x=0;x<width;x++) {
      if (y>=8 && y<height-8 && x==8) x=width-8;
      color=src[ptr+y*stride+x];
      i=(y*width+x)*4;
      dst[i]=dst[i+1]=dst[i+2]=0;
      dst[i+3]=0;
      if (color<16) {
	dst[i]=PALETTE[color][0];
	dst[i+1]=PALETTE[color][1];
	dst[i+2]=PALETTE[color][2];
	dst[i+3]=255;
      }
    }
  canvas.getContext("2d").putImageData(canvas._image,0,0);
}

function WinDrawFrame(time)
{
  let tick=time;
  if (reduced.matches) tick=0;
  if (!cfg.native) {
    frame=0;
    return;
  }
  try {
    if (time-last>=1000/30) {
      last=time;
      for (let doc of WinDocuments())
        for (let w of doc.querySelectorAll(".win,#frame"))
          if (w._sv && w._sh)
            WinDrawOne(w,tick);
    }
  } catch (error) {
    WinDrawCfg({native:false});
    dispatchEvent(new CustomEvent("windrawerror",{detail:error.message}));
    return;
  }
  frame=requestAnimationFrame(WinDrawFrame);
}

addEventListener("winpopup",function () {WinDrawCfg();});
WinDrawCfg();
