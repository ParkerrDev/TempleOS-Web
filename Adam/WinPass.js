import {WinFocus,WinRaise,WinMobile,WinOutside,WinPopup,WinPopupReturn,WinPopupHold,
  WinDocuments,WinFind,WinAction} from "./WinMgr.js";
import {OsFullscreenExit,OsOnlyMode,osMouse} from "./Os.js";
import {KEY} from "./Keyboard.js";
import {PointerDrag} from "./WinPointer.js";

import {GuiScene,GuiCompatible,GuiHoverStyles,GuiValue,GuiFieldState} from "./GuiBridge.js";

export function WinPass({canvas,pal,Request,Input,Status})
{//Native task surfaces and browser scenes share guest identities.
  let enabled=false,revision=0,windows=[],views=new Map,hosts=new Map,
    drag=null,only=null,
    style=document.createElement("style");
  style.textContent=".win-pass{position:fixed;line-height:0;touch-action:none}"+
    ".win-pass canvas{display:block;image-rendering:pixelated;outline:0;"+
    "touch-action:none}.win-pass.active{outline:1px solid var(--yellow)}"+
    ".win-pass-owned{opacity:0!important;pointer-events:none!important}";
  document.head.append(style);

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
    return (!e.target || e.target.ownerDocument==canvas.ownerDocument) &&
      e.clientX>=r.left && e.clientX<r.right &&
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

  function HostRestore(host,point=host.return_point || null)
  {
    if (host.capture) {osMouse.releaseMouse();host.capture=0;}
    if (host.timer)
      clearTimeout(host.timer);
    for (const el of host.el.querySelectorAll("canvas[data-native-input]"))
      el.dispatchEvent(new CustomEvent("nativeinput",{detail:{kind:11}}));
    host.watch.disconnect();
    if (host.animation) cancelAnimationFrame(host.animation);
    host.el.removeEventListener("guiupdate",host.changed);
    for (const type of ["input","change","scroll"])
      host.el.removeEventListener(type,host.changed,true);
    for (const el of host.el.querySelectorAll(".gui-hover,.gui-press"))
      el.classList.remove("gui-hover","gui-press");
    host.el.style.width=host.layout.width;host.el.style.height=host.layout.height;
    host.el.classList.remove("win-pass-owned");
    host.el.removeAttribute("aria-hidden");
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
    host.returning=true;
    host.return_point=point;
    const res=await Send("close",{slot:host.slot,task:host.task,num:host.num});
    host.return_point=null;
    if (!res?.ok) {host.returning=false;return false;}
    if (hosts.get(host.slot)==host) {
      hosts.delete(host.slot);
      HostRestore(host,point);
    }
    return true;
  }

  async function HostUpdate(host)
  {
    if (!enabled || hosts.get(host.slot)!=host) return;
    if (host.pending) {host.dirty=true;return;}
    host.pending=true;host.dirty=false;
    try {
      const scene=GuiScene(host.el,host.ids);
      if (!scene || !host.el.isConnected || host.el.style.display=="none" ||
          host.overlay && !host.overlay.classList.contains("open")) {
        await HostReturn(host);
        return;
      }
      host.scene=scene;host.actions=scene.actions;host.scroll=scene.scroll;
      if (host.gui.length==scene.gui.length && host.gui.every((b,i)=>b==scene.gui[i])) return;
      host.gui=scene.gui;
      const res=await Send("update",{slot:host.slot,task:host.task,num:host.num,
        gui:scene.gui});
      if (!res?.ok && hosts.has(host.slot)) await HostReturn(host);
    } catch (error) {
      Status(error.message);
      await HostReturn(host);
    } finally {
      host.pending=false;
      if (host.dirty) queueMicrotask(function () {HostUpdate(host);});
    }
  }

  async function HostNew(w,e)
  {
    if (!GuiCompatible(w)) {Status("Video Player and Sprite Studio stay in the browser.");return;}
    for (const host of hosts.values())
      if (host.el==w) {Send("focus",{slot:host.slot,task:host.task,num:host.num});return;}
    if (w.dataset.passPending) return;
    GuiHoverStyles();
    const layout={width:w.style.width,height:w.style.height};
    w.style.width=Math.min(w.offsetWidth,936+w.offsetWidth-w.clientWidth)+"px";
    w.style.height=Math.min(w.offsetHeight,696+w.offsetHeight-w.clientHeight)+"px";
    let ids=new WeakMap,doc;
    try {doc=GuiScene(w,ids);} catch (error) {
      w.style.width=layout.width;w.style.height=layout.height;Status(error.message);return;
    }
    let pos=Position(e),rev=revision,overlay=w.closest(".overlay"),host,res;
    if (!doc || w.dataset.passPending)
      return;
    w.dataset.passPending="1";
    res=await Send("host",{host:w.id,title:doc.title,gui:doc.gui,
      cols:doc.cols,rows:doc.rows,
      x:Math.max(0,pos.x-48),y:Math.max(0,pos.y-8)});
    delete w.dataset.passPending;
    if (!res?.ok) {
      w.style.width=layout.width;w.style.height=layout.height;
      return;
    }
    if (rev!=revision || !enabled || e.only && !OsOnlyMode() || !w.isConnected || w.style.display=="none" ||
        overlay && !overlay.classList.contains("open")) {
      await Send("close",{slot:res.slot,task:res.task,num:res.num});
      w.style.width=layout.width;w.style.height=layout.height;
      return;
    }
    host={slot:res.slot,task:res.task,num:res.num,el:w,overlay,layout,scene:doc,
      ids,gui:doc.gui,actions:doc.actions,scroll:doc.scroll,timer:0,seen:false,pending:false,animation:0};
    host.changed=function () {
      clearTimeout(host.timer);host.timer=setTimeout(function () {HostUpdate(host);},16);
    };
    host.watch=new MutationObserver(function (records) {
      if (records.every(record=>(record.target.nodeType==1?record.target:record.target.parentElement).
          closest(".wc,.wbar,.wvert,.wcorn,.wszcorner,.wszr,.wszb"))) return;
      host.changed();
    });
    host.watch.observe(overlay || w,{subtree:true,childList:true,
      characterData:true,attributes:true,
      attributeFilter:["disabled","hidden","class","style","aria-selected","aria-pressed","aria-current","checked","value"]});
    host.el.addEventListener("guiupdate",host.changed);
    for (const type of ["input","change","scroll"])
      host.el.addEventListener(type,host.changed,true);
    hosts.set(res.slot,host);
    HostHide(host);
    {
      let last=0;
      function Frame(now) {
        if (!hosts.has(host.slot)) return;
        if (now-last>=(host.scene.animated?1000/30:250)) {last=now;HostUpdate(host);}
        host.animation=requestAnimationFrame(Frame);
      }
      host.animation=requestAnimationFrame(Frame);
    }
    Input({focus:true,slot:-1});
    canvas.focus({preventScroll:true});
    Status(doc.title+" is now a TempleOS window.");
  }

  function HostPoint(host,action)
  {
    const r=host.el.getBoundingClientRect(),control=host.scene.controls.get(action.id),
      x=action.x??(control?control.x+control.w/2:0),y=action.y??(control?control.y+control.h/2:0);
    return {clientX:r.left+host.el.clientLeft+x/host.scene.scale,
      clientY:r.top+host.el.clientTop+y/host.scene.scale,
      movementX:host.pointer?(x-host.pointer.x)/host.scene.scale:0,
      movementY:host.pointer?(y-host.pointer.y)/host.scene.scale:0,
      bubbles:true,cancelable:true,button:0,buttons:host.pressed?1:0};
  }

  async function HostAction(host,action)
  {
    let el=host.actions.get(action.id),control=host.scene.controls.get(action.id);
    const point=HostPoint(host,action),kind=action.kind || 0;
    if ((kind==2 || kind==3) && host.pressed?.matches("canvas[data-native-input]")) {
      el=host.pressed;control=host.scene.controls.get(host.ids.get(el));
    }
    if (kind==13) osMouse.releaseMouse();
    if (el?.matches("canvas[data-native-input]")) {
      if (kind==1) host.pressed=el;
      if (kind==2 || kind==11) host.pressed=null;
      el.dispatchEvent(new CustomEvent("nativeinput",{detail:{...action,
        x:(action.x-control.x)*640/control.w,y:(action.y-control.y)*480/control.h,
        captured:host.capture==action.id,
        arg1:kind==12?action.x*640/action.arg1:action.arg1,
        arg2:kind==12?action.y*480/action.arg2:action.arg2,
        dx:point.movementX*host.scene.scale*640/control.w,
        dy:point.movementY*host.scene.scale*480/control.h}}));
      if (kind==1 || kind==3) host.pointer={x:action.x,y:action.y};
      return;
    }
    if (kind==1 || kind==3) host.pointer={x:action.x,y:action.y};
    if (kind==3) {
      const hovered=new Set;
      for (const region of host.scene.regions)
        if (region.x<=action.x && action.x<region.x+region.w && region.y<=action.y && action.y<region.y+region.h)
          for (let node=region.el;node && node!=host.el;node=node.parentElement) hovered.add(node);
      for (const node of host.hovered || []) if (!hovered.has(node)) {
        node.classList.remove("gui-hover");node.dispatchEvent(new MouseEvent("mouseleave",point));
      }
      for (const node of hovered) if (!host.hovered?.has(node)) {
        node.classList.add("gui-hover");node.dispatchEvent(new MouseEvent("mouseenter",point));
      }
      host.hovered=hovered;
      if (host.pressed) {
        el=host.pressed;

      }
      el?.dispatchEvent(new PointerEvent("pointermove",{...point,pointerId:1,pointerType:"mouse"}));
      el?.dispatchEvent(new MouseEvent("mousemove",point));
      host.changed();return;
    }
    if (kind==2) {
      const pressed=host.pressed;
      host.pressed=null;
      pressed?.classList.remove("gui-press");
      host.changed();return;
    }
    if (!el?.isConnected || el.disabled) return;
    if (kind==1) {
      host.pressed=el;el.classList.add("gui-press");
      return;
    }
    if (kind==4) return;
    WinAction(el,function () {
      if (kind==9 || kind==10) {
        const code=Object.keys(KEY).find(code=>KEY[code]==((action.arg2&127)|((action.arg2&128)?256:0))),
          key=action.arg1?String.fromCharCode(action.arg1):code;
        el.dispatchEvent(new KeyboardEvent(kind==9?"keydown":"keyup",{code,key:action.arg1==10?"Enter":key,
          ctrlKey:!!(action.arg2&1024),shiftKey:!!(action.arg2&512),altKey:!!(action.arg2&2048),bubbles:true,cancelable:true}));
      } else if (kind==5) {
        const state=GuiFieldState(el);
        if (action.x!=state.epoch) return;
        if (el.tagName=="SELECT") el.selectedIndex=Number(action.value);
        else {
          const value=GuiValue(action.value,el.hasAttribute("data-cp437"));
          if (el.maxLength>0 && value.length>el.maxLength) {
            state.epoch++;
            Status("This field accepts at most "+el.maxLength+" characters.");return;
          }
          el.value=value;
        }
        state.value=el.value;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
      } else if (kind==6) {
        if (action.x!=GuiFieldState(el).epoch) return;
        el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true,cancelable:true}));
        el.form?.requestSubmit();
      } else {
        const now=performance.now(),dbl=host.last_click?.el==el && now-host.last_click.time<500;
        host.last_click={el,time:now};
        el.dispatchEvent(new MouseEvent("click",{...point,buttons:0,detail:dbl?2:1}));
        if (dbl) el.dispatchEvent(new MouseEvent("dblclick",{...point,detail:2}));
      }
    });
    host.changed();
  }

  function ViewDel(id)
  {
    let view=views.get(id);
    if (view) {
      if (view.el.contains(view.el.ownerDocument.activeElement)) {
        Input({buttons:0,slot:-1});
        canvas.focus({preventScroll:true});
        if (enabled)
          WinFocus(canvas.closest("#frame"));
      }
      WinPopupReturn(view.el);
      view.el.remove();
      views.delete(id);
    }
  }

  function ViewFocus(view)
  {
    let el,doc;
    for (doc of WinDocuments())
      for (el of doc.querySelectorAll(".win-pass.active"))
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
      if (enabled && moved && ev?.type=="pointerup" && WinOutside(ev,view.el)) {
        WinPopup(view.el);
        Input({buttons:0,slot:-1});
      } else if (enabled && moved && ev?.type=="pointerup" && Inside(ev)) {
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
    if (!e.button && !WinMobile(view.el) && e.pointerType!="touch" &&
        !view.el.dataset.popup && y<8 && x>=48 && x<w.w-24)
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
      const r=cv.getBoundingClientRect(),w=view.win,
        x=(e.clientX-r.left)*w.w/r.width,y=(e.clientY-r.top)*w.h/r.height,
        edge=x<8 || x>=w.w-8,bottom=y>=w.h-8,
        cursor=edge && bottom?(x<8?"nesw-resize":"nwse-resize"):
          edge?"ew-resize":bottom?"ns-resize":y<8 && x>=48 && x<w.w-24?"move":"";
      cv.toggleAttribute("data-native-cursor",!!cursor);
      cv.style.setProperty("--native-cursor",cursor || "auto");
      if (e.buttons && cv.hasPointerCapture(e.pointerId) || !e.buttons)
        ViewMouse(view,e);
    });
    cv.addEventListener("pointerleave",()=>cv.removeAttribute("data-native-cursor"));
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
    el.addEventListener("winpopupblur",function () {Input({buttons:0,slot:-1});});
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
      if (await HostReturn(host,state.last)) state.host=host;
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
    if (!enabled || OsOnlyMode() || e.button || e.pointerType=="touch" || WinMobile(canvas) ||
        canvas.ownerDocument.pointerLockElement)
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
    if (state.view && e.type!="pointercancel" && WinOutside(e,state.view.el))
      WinPopup(state.view.el);
    else if (state.view && e.type!="pointercancel" && Inside(e)) {
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
        if (host && host.task==w.task && host.num==w.num) {
          host.seen=true;host.capture=w.capture || 0;
          if (host.size && (host.size.w!=w.w || host.size.h!=w.h ||
              Math.abs(host.el.clientWidth*host.scene.scale-w.w+16)>7 ||
              Math.abs(host.el.clientHeight*host.scene.scale-w.h+16)>7)) {
            host.el.style.width=(w.w-16)/host.scene.scale+host.el.offsetWidth-host.el.clientWidth+"px";
            host.el.style.height=(w.h-16)/host.scene.scale+host.el.offsetHeight-host.el.clientHeight+"px";
            host.changed();
          }
          host.size={w:w.w,h:w.h};
        }
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
          if (!host.returning) host.el.querySelector(".close")?.click();
        }
    }
    for (action of msg.actions || []) {
      host=hosts.get(action.slot);
      if (host) {
        if (action.id==1) {
          if (!OsOnlyMode()) HostReturn(host);
        }
        else if (action.id>=0x100000) {
          const kind=action.id&15;
          el=host.scroll.get(Math.floor((action.id-0x100000)/16));
          if (el) {
            if (kind==5) el.scrollTop=0;
            else if (kind==6) el.scrollTop=el.scrollHeight;
            else el.scrollTop+=(kind%2? -1:1)*(kind>2?el.clientHeight*.9:48);
            HostUpdate(host);
          }
        } else {
          HostAction(host,action).catch(error=>Status(error.message));
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
    res=await Send(on?"enable":"disable");
    if (rev==revision) {
      enabled=on && !!res?.ok;
      if (on && res?.ok)
        Status("Drag a native title out of the screen, "+
          "or a supported browser window in.");
    }
    return enabled;
  }

  document.addEventListener("guicapture",async function (e) {
    const host=[...hosts.values()].find(host=>host.el.contains(e.target));
    if (!host) return;
    const on=e.detail.on;
    if (on && !osMouse.isMouseCaptured()) {
      const locked=await new Promise(function (resolve) {
        function Done() {
          document.removeEventListener("pointerlockchange",Done);
          document.removeEventListener("pointerlockerror",Done);
          resolve(osMouse.isMouseCaptured());
        }
        document.addEventListener("pointerlockchange",Done);
        document.addEventListener("pointerlockerror",Done);
        const request=osMouse.captureMouse();
        if (request===false) Done();
        else if (request?.then) request.then(Done);
      });
      if (!locked) {osMouse.releaseMouse();return;}
    } else if (!on) osMouse.releaseMouse();
    if (!enabled || hosts.get(host.slot)!=host) {osMouse.releaseMouse();return;}
    Input({slot:-1,focus:true});
    const res=await Send("capture",{slot:host.slot,task:host.task,num:host.num,control:host.ids.get(e.target),on});
    if (!res?.ok) osMouse.releaseMouse();
  });
  document.addEventListener("pointerlockchange",function () {
    if (osMouse.isMouseCaptured()) return;
    for (const host of hosts.values())
      if (host.capture) Send("capture",{slot:host.slot,task:host.task,num:host.num,control:host.capture,on:false});
  });
  document.addEventListener("winmoved",function (e) {
    if (enabled && Inside(e.detail))
      HostNew(e.target,e.detail);
  });
  document.addEventListener("winlaunch",async function (e) {
    if (!enabled) return;
    const w=e.detail.win;
    if (!GuiCompatible(w)) {await OsFullscreenExit();WinFocus(w);return;}
    const r=canvas.getBoundingClientRect(),parent=[...hosts.values()].find(host=>host.el.id==e.detail.origin?.id),
      native=windows.find(win=>win.slot==parent?.slot);
    HostNew(w,{clientX:r.left+((native?.x || 100)+80)*r.width/640,
      clientY:r.top+((native?.y || 60)+32)*r.height/480});
  });
  document.addEventListener("winmaximize",function (e) {
    const host=[...hosts.values()].find(host=>host.el==e.target),win=windows.find(win=>win.slot==host?.slot);
    if (!host || !win) return;
    let size=host.normal;
    if (size) host.normal=null;
    else {host.normal={cols:(win.w-16)/8,rows:(win.h-16)/8,x:win.x,y:win.y};size={cols:78,rows:58,x:0,y:0};}
    Send("size",{slot:host.slot,task:host.task,num:host.num,...size});
  });
  document.addEventListener("focusin",function (e) {
    if (e.target.closest?.(".win-pass-owned")) canvas.focus({preventScroll:true});
  });
  document.addEventListener("winfocus",function (e) {
    let host;
    for (host of hosts.values())
      if (host.el.id==e.detail.id) {
        HostHide(host);
        Send("focus",{slot:host.slot,task:host.task,num:host.num});
        return;
      }
    const w=WinFind(e.detail.id);
    if (enabled && OsOnlyMode() && w?.matches(".win:not(.win-pass)") && GuiCompatible(w))
      BringInside(w);
  });
  function HostAt(e)
  {
    const point=Position(e);
    for (const win of windows.slice().reverse())
      if (!win.detached && win.x<=point.x && point.x<win.x+win.w && win.y<=point.y && point.y<win.y+win.h) {
        const host=hosts.get(win.slot);
        if (!host || point.x<win.x+8 || point.x>=win.x+win.w-8 || point.y<win.y+8 || point.y>=win.y+win.h-8) return;
        return {host,x:point.x-win.x-8,y:point.y-win.y-8};
      }
  }
  canvas._winAt=e=>HostAt(e)?.host.el;
  for (const type of ["dragover","dragleave","drop"])
    canvas.addEventListener(type,function (e) {
      const at=HostAt(e);
      if (!at || !e.dataTransfer.types.includes("Files")) return;
      const region=at.host.scene.regions.findLast(c=>c.x<=at.x && at.x<c.x+c.w && c.y<=at.y && at.y<c.y+c.h);
      if (!region) return;
      const event=new DragEvent(type,{...HostPoint(at.host,at),dataTransfer:e.dataTransfer});
      if (!WinAction(region.el,()=>region.el.dispatchEvent(event))) e.preventDefault();
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
  async function Return()
  {
    revision++;
    drag=null;
    Input({buttons:0,slot:-1});
    let ok=true;
    for (const host of [...hosts.values()]) ok=await HostReturn(host) && ok;
    for (const view of [...views.values()]) {
      const w=view.win,res=await Send("attach",{slot:w.slot,task:w.task,num:w.num,x:w.x,y:w.y});
      if (res?.ok) ViewDel(Identity(w));
      else ok=false;
    }
    if (ok) Status("Windows returned. Passthrough remains enabled.");
  }

  async function BringInside(w)
  {
    if (!enabled || !OsOnlyMode() || w.id=="frame" || w.classList.contains("input-docked") ||
        w.classList.contains("win-pass-owned") || !GuiCompatible(w) ||
        w.closest(".overlay:not(.open)") || w.style.display=="none" || !w.getClientRects().length) return;
    OnlySave();
    const popup=WinPopupHold(w);
    if (popup) only.popups.set(w,popup);
    const r=canvas.getBoundingClientRect(),n=w.id=="desktopMenu"?0:hosts.size%8+1;
    await HostNew(w,{clientX:r.left+(48+n*32)*r.width/640,
      clientY:r.top+(8+n*24)*r.height/480,only:true});
  }

  function OnlySave()
  {
    if (!only) {
      only={hosts:new Set([...hosts.values()].map(host=>host.el)),views:[],popups:new Map};
      for (const view of views.values()) {
        const saved={win:view.win,left:view.el.style.left,top:view.el.style.top,scale:view.scale};
        saved.popup=WinPopupHold(view.el);
        only.views.push(saved);
      }
    }
  }

  async function AllInside()
  {
    OnlySave();
    for (const view of [...views.values()]) {
      if (!enabled || !OsOnlyMode()) return;
      const w=view.win,res=await Send("attach",{slot:w.slot,task:w.task,num:w.num,x:w.x,y:w.y});
      if (res?.ok) ViewDel(Identity(w));
    }
    const list=WinDocuments().flatMap(doc=>[...doc.querySelectorAll(".win:not(.win-pass)")]);
    for (const w of list.filter(w=>w.id!="desktopMenu")) await BringInside(w);
    await BringInside(WinFind("desktopMenu"));
  }

  async function OnlyRestore()
  {
    const saved=only;
    if (!saved) return;
    only=null;revision++;drag=null;
    Input({buttons:0,slot:-1});
    for (const host of [...hosts.values()])
      if (!saved.hosts.has(host.el)) await HostReturn(host);
    for (const old of saved.views) {
      const w=windows.find(w=>Identity(w)==Identity(old.win));
      if (enabled && w) {
        const res=await Send("detach",{task:w.task,num:w.num});
        if (res?.ok) {
          const view=views.get(Identity(w)) || ViewNew({...w,slot:res.slot,detached:true});
          view.scale=old.scale;
          view.el.style.left=old.left;view.el.style.top=old.top;
          view.canvas.style.width=w.w*view.scale+"px";
          view.canvas.style.height=w.h*view.scale+"px";
          if (old.popup) WinPopup(view.el,old.popup);
        } else old.popup?.close();
      } else old.popup?.close();
    }
    for (const [w,popup] of saved.popups) {
      if (w.isConnected && w.style.display!="none" && !w.closest(".overlay:not(.open)"))
        WinPopup(w,popup);
      else popup.close();
    }
  }
  return {Enable,Receive,Return,AllInside,OnlyRestore};
}
