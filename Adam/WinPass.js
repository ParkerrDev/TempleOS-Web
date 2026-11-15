import {WinFocus,WinRaise} from "./WinMgr.js";
import {PointerDrag} from "./WinPointer.js";

const TOOLS={desktopMenu:{title:"Menu",body:[],buttons:":scope > button"},
  guide:{title:"Help",body:["#helpContext","#helpLabel","#helpText"],
    buttons:"#helpNext"},
  godWin:{title:"God Tools",body:["#godOut","#godStatus","#godNote"],
    buttons:"#godBar button"}};

function TextEscape(text)
{
  return text.split("$").join("$$").replace(/[\x00-\x08\x0B-\x1F]/g,"");
}

function LabelEscape(text)
{
  return TextEscape(text).replace(/\\/g,"\\\\").replace(/"/g,'\\"');
}

function DocText(el)
{
  if (el?.id=="godOut")
    return Array.from(el.children,function (entry) {
      if (entry.tagName=="ARTICLE")
        return Array.from(entry.children,function (part) {
          return part.textContent.trim();
        }).join("\n");
      return entry.textContent.trim();
    }).join("\n\n");
  return el?.textContent.trim();
}

export function WinPassDoc(w,actions=new Map)
{//Only these text documents and buttons have a native representation.
  let spec=TOOLS[w.id],doc="",el,id,sel,text,live=new Map;
  if (!spec || w.querySelector("video,audio,iframe,textarea,input,select,"+
      "[contenteditable=true]"))
    return null;
  for (sel of spec.body) {
    el=w.querySelector(sel);
    text=DocText(el);
    if (text)
      doc+=TextEscape(text.slice(-16000))+"\n\n";
  }
  for (el of w.querySelectorAll(spec.buttons)) {
    if (!el.hidden && el.style.display!="none") {
      el.dataset.passControl="button";
      id=actions.get(el);
      if (!id) {
        id=actions.size+2;
        actions.set(el,id);
      }
      text=el.textContent.trim().replace(/\s+/g," ");
      if (el.disabled)
        doc+="["+TextEscape(text)+"]\n\n";
      else {
        //BT defaults to X, which exits before LE. These controls stay live.
        doc+='$BT-X,"'+LabelEscape(text)+'",LE='+id+'$\n\n';
        live.set(id,el);
      }
    }
  }
  doc+='\n$BT-X,"Return to browser",LE=1$\n';
  return {title:spec.title,doc,actions:live};
}

export function WinPass({canvas,pal,Request,Input,Status})
{//Native task surfaces and explicit DolDoc proxies share guest identities.
  let enabled=false,revision=0,windows=[],views=new Map,hosts=new Map,
    drag=null,dock=document.createElement("div"),
    style=document.createElement("style");
  style.textContent=".win-pass{position:fixed;line-height:0;touch-action:none}"+
    ".win-pass canvas{display:block;image-rendering:pixelated;outline:0;"+
    "touch-action:none}.win-pass.active{outline:1px solid var(--yellow)}"+
    "#winPassDock{position:fixed;right:8px;bottom:8px;z-index:2147483600;"+
    "display:flex;gap:8px;background:var(--white);padding:8px;"+
    "border:2px solid var(--blue)}#winPassDock[hidden]{display:none}"+
    "#winPassDock button{width:auto}.win-pass-owned{display:none!important}";
  document.head.append(style);
  dock.id="winPassDock";
  dock.hidden=true;
  dock.setAttribute("aria-label","Window passthrough controls");
  dock.innerHTML='<button data-pass="return">Return windows</button>'+
    '<button data-pass="settings">Settings</button>';
  document.body.append(dock);
  dock.addEventListener("click",function (e) {
    if (e.target.dataset.pass=="settings")
      document.getElementById("settingsBtn").click();
    if (e.target.dataset.pass=="return")
      dispatchEvent(new CustomEvent("winpassdisable"));
  });

  async function Send(op,args={})
  {
    let res;
    try {
      res=await Request({cmd:"windows",op,...args});
    } catch (e) {
      res={ok:false,msg:e.message};
    }
    if (!res?.ok)
      Status(res?.msg || "The native window request failed.");
    return res;
  }

  function Inside(e)
  {
    let r=canvas.getBoundingClientRect();
    return e.clientX>=r.left && e.clientX<r.right &&
      e.clientY>=r.top && e.clientY<r.bottom;
  }

  function Position(e)
  {
    let r=canvas.getBoundingClientRect();
    return {x:Math.round((e.clientX-r.left)*640/r.width),
      y:Math.round((e.clientY-r.top)*480/r.height)};
  }

  function Identity(w)
  {
    return String(w.task)+":"+String(w.num);
  }

  function HostHide(host)
  {
    host.el.classList.add("win-pass-owned");
    if (host.overlay) {
      host.overlay.classList.add("win-pass-owned");
      host.overlay.setAttribute("aria-modal","false");
    }
  }

  function HostRestore(host,point=null)
  {
    if (host.timer)
      clearTimeout(host.timer);
    host.watch.disconnect();
    host.el.classList.remove("win-pass-owned");
    if (host.overlay) {
      host.overlay.classList.remove("win-pass-owned");
      host.overlay.classList.add("free");
      host.overlay.setAttribute("aria-modal","false");
    }
    WinRaise(host.overlay || host.el);
    if (point) {
      host.el.dataset.floating="1";
      host.el.style.position="fixed";
      host.el.style.left=Math.max(0,point.clientX-48)+"px";
      host.el.style.top=Math.max(12,point.clientY)+"px";
      host.el.style.margin="0";
      if (host.overlay) {
        host.overlay.classList.add("free");
        host.overlay.setAttribute("aria-modal","false");
      }
      WinFocus(host.el);
    }
  }

  async function HostReturn(host,point=null)
  {
    hosts.delete(host.slot);
    HostRestore(host,point);
    await Send("close",{slot:host.slot,task:host.task,num:host.num});
  }

  async function HostUpdate(host)
  {
    let doc=WinPassDoc(host.el,host.ids),res;
    if (!enabled || !hosts.has(host.slot))
      return;
    if (!doc || host.el.style.display=="none" ||
        host.overlay && !host.overlay.classList.contains("open")) {
      await HostReturn(host);
      return;
    }
    host.actions=doc.actions;
    if (doc.doc!=host.doc) {
      host.doc=doc.doc;
      res=await Send("update",{slot:host.slot,task:host.task,num:host.num,
        doc:doc.doc});
      if (!res?.ok && hosts.has(host.slot)) {
        await HostReturn(host);
      }
    }
  }

  async function HostNew(w,e)
  {
    let ids=new Map,doc=WinPassDoc(w,ids),r=w.getBoundingClientRect(),
      pos=Position(e),rev=revision,overlay=w.closest(".overlay"),host,res;
    if (!doc || w.dataset.passPending)
      return;
    w.dataset.passPending="1";
    res=await Send("host",{host:w.id,title:doc.title,doc:doc.doc,
      cols:Math.min(76,Math.max(20,Math.floor(r.width/12)-2)),
      rows:Math.min(54,Math.max(6,Math.floor(r.height/12)-2)),
      x:Math.max(0,pos.x-48),y:Math.max(0,pos.y-8)});
    delete w.dataset.passPending;
    if (!res?.ok)
      return;
    if (rev!=revision || !enabled) {
      await Send("close",{slot:res.slot,task:res.task,num:res.num});
      return;
    }
    host={slot:res.slot,task:res.task,num:res.num,el:w,overlay,
      ids,doc:doc.doc,actions:doc.actions,timer:0,seen:false};
    host.watch=new MutationObserver(function () {
      clearTimeout(host.timer);
      host.timer=setTimeout(function () {HostUpdate(host);},100);
    });
    host.watch.observe(overlay || w,{subtree:true,childList:true,
      characterData:true,attributes:true,
      attributeFilter:["disabled","hidden","class","style"]});
    hosts.set(res.slot,host);
    HostHide(host);
    Input({focus:true,slot:-1});
    canvas.focus({preventScroll:true});
    Status(doc.title+" is now a native TempleOS document.");
  }

  function ViewDel(id)
  {
    let view=views.get(id);
    if (view) {
      if (view.el.contains(document.activeElement)) {
        Input({buttons:0,slot:-1});
        canvas.focus({preventScroll:true});
        if (enabled)
          WinFocus(canvas.closest("#frame"));
      }
      view.el.remove();
      views.delete(id);
    }
  }

  function ViewFocus(view)
  {
    let el;
    for (el of document.querySelectorAll(".win-pass.active"))
      el.classList.remove("active");
    WinFocus(view.el);
    view.canvas.focus({preventScroll:true});
    Input({focus:true,slot:view.win.slot,task:view.win.task,num:view.win.num});
    Send("focus",{slot:view.win.slot,task:view.win.task,num:view.win.num});
  }

  function ViewMouse(view,e,buttons)
  {
    let r=view.canvas.getBoundingClientRect(),w=view.win;
    Input({slot:w.slot,task:w.task,num:w.num,
      x:w.x+Math.max(0,Math.min(w.w-1,
      Math.round((e.clientX-r.left)*w.w/r.width))),
      y:w.y+Math.max(0,Math.min(w.h-1,
      Math.round((e.clientY-r.top)*w.h/r.height))),buttons});
  }

  function ViewDown(view,e)
  {
    let w=view.win,r=view.canvas.getBoundingClientRect(),
      x=(e.clientX-r.left)*w.w/r.width,y=(e.clientY-r.top)*w.h/r.height,
      left=r.left,top=r.top,last=e,moved=false;
    function Move(ev)
    {
      last=ev;
      if (ev.clientX!=e.clientX || ev.clientY!=e.clientY)
        moved=true;
      view.el.style.left=left+ev.clientX-e.clientX+"px";
      view.el.style.top=Math.max(0,top+ev.clientY-e.clientY)+"px";
    }
    async function End(ev)
    {
      let pos,res;
      if (enabled && moved && ev?.type=="pointerup" && Inside(ev)) {
        last=ev;
        pos=Position(last);
        res=await Send("attach",{slot:w.slot,task:w.task,num:w.num,
          x:pos.x-Math.round(x),y:pos.y-Math.round(y)});
        if (res?.ok) {
          ViewDel(Identity(w));
          Input({slot:-1,focus:true});
          canvas.focus({preventScroll:true});
        }
      }
    }
    if (!enabled)
      return;
    ViewFocus(view);
    if (!e.button && y<8 && x>=48 && x<w.w-24)
      PointerDrag(e,Move,End);
    else {
      ViewMouse(view,e,e.buttons);
      view.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  function ViewNew(w,point=null)
  {
    let el=document.createElement("div"),cv=document.createElement("canvas"),
      r=canvas.getBoundingClientRect(),scale=r.width/640,view;
    el.className="win-pass";
    cv.tabIndex=0;
    cv.setAttribute("aria-label",w.title+" - native TempleOS window");
    cv.setAttribute("role","application");
    el.append(cv);
    el.style.left=r.left+w.x*scale+"px";
    el.style.top=r.top+w.y*scale+"px";
    if (point) {
      el.style.left=point.clientX-point.dx+"px";
      el.style.top=point.clientY-point.dy+"px";
    }
    view={el,canvas:cv,ctx:cv.getContext("2d"),win:w,scale,image:null};
    views.set(Identity(w),view);
    document.body.append(el);
    WinRaise(el);
    cv.addEventListener("pointerdown",function (e) {ViewDown(view,e);});
    cv.addEventListener("pointermove",function (e) {
      if (e.buttons && cv.hasPointerCapture(e.pointerId) || !e.buttons)
        ViewMouse(view,e);
    });
    function Up(e)
    {
      if (cv.hasPointerCapture(e.pointerId)) {
        ViewMouse(view,e,0);
        cv.releasePointerCapture(e.pointerId);
      }
    }
    cv.addEventListener("pointerup",Up);
    cv.addEventListener("pointercancel",Up);
    cv.addEventListener("lostpointercapture",function () {Input({buttons:0});});
    cv.addEventListener("contextmenu",function (e) {e.preventDefault();});
    cv.addEventListener("wheel",function (e) {
      ViewMouse(view,e);
      Input({wheel:e.deltaY>0?1:-1});
      e.preventDefault();
    },{passive:false});
    return view;
  }

  function ViewDraw(view,w)
  {
    let bytes,rgba,i;
    view.win=w;
    if (!w.buf)
      return;
    bytes=new Uint8Array(w.buf);
    if (bytes.length!=w.w*w.h)
      return;
    if (!view.image || view.canvas.width!=w.w || view.canvas.height!=w.h) {
      view.canvas.width=w.w;
      view.canvas.height=w.h;
      view.canvas.style.width=w.w*view.scale+"px";
      view.canvas.style.height=w.h*view.scale+"px";
      view.image=view.ctx.createImageData(w.w,w.h);
    }
    rgba=new Uint32Array(view.image.data.buffer);
    for (i=0;i<bytes.length;i++)
      rgba[i]=pal[bytes[i]&15];
    view.ctx.putImageData(view.image,0,0);
  }

  async function GuestOutside(state)
  {
    let w=state.win,host=hosts.get(w.slot),rev=revision,res,view;
    state.pending=true;
    Input({buttons:0,slot:-1});
    if (host) {
      state.host=host;
      await HostReturn(host,state.last);
      return;
    }
    res=await Send("detach",{task:w.task,num:w.num});
    if (!res?.ok || rev!=revision || !enabled)
      return;
    w={...w,slot:res.slot,detached:true};
    view=views.get(Identity(w)) || ViewNew(w,{...state.last,
      clientX:state.last.clientX,clientY:state.last.clientY,
      dx:state.dx,dy:state.dy});
    state.view=view;
    view.el.style.left=state.last.clientX-state.dx+"px";
    view.el.style.top=Math.max(0,state.last.clientY-state.dy)+"px";
    ViewFocus(view);
    if (state.ended && !state.cancel && Inside(state.last)) {
      res=await Send("attach",{slot:w.slot,task:w.task,num:w.num,
        ...Position(state.last)});
      if (res?.ok)
        ViewDel(Identity(w));
    }
  }

  function GuestDown(e)
  {
    let point,w,r=canvas.getBoundingClientRect(),state;
    if (!enabled || e.button || e.pointerType=="touch" ||
        document.pointerLockElement)
      return;
    point=Position(e);
    for (w of windows.slice().reverse()) {
      if (!w.detached && point.x>=w.x && point.x<w.x+w.w &&
          point.y>=w.y && point.y<w.y+w.h) {
        if (point.y<w.y+8 && point.x>=w.x+48 && point.x<w.x+w.w-24) {
          state={win:w,last:e,id:e.pointerId,pending:false,view:null,
            ended:false,cancel:false,
            dx:(point.x-w.x)*r.width/640,dy:(point.y-w.y)*r.height/480};
          drag=state;
          canvas.setPointerCapture(e.pointerId);
        }
        break;
      }
    }
  }

  function GuestMove(e)
  {
    if (!drag)
      return;
    drag.last=e;
    if (drag.host) {
      drag.host.el.style.left=Math.max(0,e.clientX-48)+"px";
      drag.host.el.style.top=Math.max(12,e.clientY)+"px";
    } else if (drag.view) {
      drag.view.el.style.left=e.clientX-drag.dx+"px";
      drag.view.el.style.top=Math.max(0,e.clientY-drag.dy)+"px";
    } else if (!drag.pending && !Inside(e))
      GuestOutside(drag);
  }

  async function GuestUp(e)
  {
    let state=drag,res,pos;
    if (!state)
      return;
    state.last=e;
    state.ended=true;
    state.cancel=e.type=="pointercancel";
    drag=null;
    Input({buttons:0});
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (state.view && e.type!="pointercancel" && Inside(e)) {
      pos=Position(e);
      res=await Send("attach",{slot:state.view.win.slot,
        task:state.view.win.task,num:state.view.win.num,
        x:pos.x-Math.round(state.dx/state.view.scale),
        y:pos.y-Math.round(state.dy/state.view.scale)});
      if (res?.ok)
        ViewDel(Identity(state.view.win));
    }
  }

  function Receive(msg)
  {
    let w,id,view,seen=new Set,action,host,el;
    if (!enabled)
      return;
    if (msg.enabled===false && msg.msg) {
      Enable(false);
      Status(msg.msg);
      return;
    }
    if (msg.windows) {
      windows=msg.windows;
      for (w of windows) {
        id=Identity(w);
        host=hosts.get(w.slot);
        if (host && host.task==w.task && host.num==w.num)
          host.seen=true;
        if (w.detached && !host) {
          seen.add(id);
          view=views.get(id) || ViewNew(w);
          ViewDraw(view,w);
        }
      }
      for (id of views.keys())
        if (!seen.has(id) && !drag?.pending)
          ViewDel(id);
      for (host of hosts.values())
        if (host.seen && !windows.some(function (w) {
          return w.slot==host.slot && w.task==host.task && w.num==host.num;
        })) {
          hosts.delete(host.slot);
          HostRestore(host);
        }
    }
    for (action of msg.actions || []) {
      host=hosts.get(action.slot);
      if (host) {
        if (action.id==1)
          HostReturn(host);
        else {
          el=host.actions.get(action.id);
          if (el && el.isConnected && !el.disabled)
            el.click();
        }
      }
    }
  }

  async function Enable(on)
  {
    let rev=++revision,res,host,id;
    enabled=on;
    drag=null;
    Input({buttons:0,slot:-1});
    for (host of hosts.values())
      HostRestore(host);
    hosts.clear();
    for (id of views.keys())
      ViewDel(id);
    windows=[];
    dock.hidden=!on;
    res=await Send(on?"enable":"disable");
    if (rev==revision) {
      enabled=on && !!res?.ok;
      if (on && res?.ok)
        Status("Drag a native title out of the screen, "+
          "or Menu, Help or God Tools in.");
    }
    return enabled;
  }

  document.addEventListener("winmoved",function (e) {
    if (enabled && Inside(e.detail) && TOOLS[e.target.id])
      HostNew(e.target,e.detail);
  });
  document.addEventListener("winfocus",function (e) {
    let host;
    for (host of hosts.values())
      if (host.el.id==e.detail.id) {
        HostHide(host);
        Send("focus",{slot:host.slot,task:host.task,num:host.num});
      }
  });
  canvas.addEventListener("pointerdown",GuestDown);
  canvas.addEventListener("pointermove",GuestMove);
  canvas.addEventListener("pointerup",GuestUp);
  canvas.addEventListener("pointercancel",GuestUp);
  canvas.addEventListener("lostpointercapture",function (e) {
    if (drag?.id==e.pointerId) {
      drag.ended=drag.cancel=true;
      drag=null;
      Input({buttons:0});
    }
  });
  addEventListener("blur",function () {
    if (drag)
      drag.ended=drag.cancel=true;
    drag=null;
  });
  return {Enable,Receive};
}
