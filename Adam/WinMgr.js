import {PointerDrag} from "./WinPointer.js";
import {WinDocuments,WinFind,WinMobile,WinOutside,WinPopup,WinPopupReturn} from "./WinPopup.js";
export {WinDocuments,WinFind,WinMobile,WinOutside,WinPopup,WinPopupReturn} from "./WinPopup.js";
import "./WinDraw.js";
const $=WinFind;
let z_top=1000;

const WINS={
  editorBtn:["editorWin","../Apps/Editor/EditorWin.js"],
  gamesBtn:["gamesWin","../Apps/Games/GamesWin.js"],
  spritesBtn:["spritesWin","../Apps/Sprites/SpritesWin.js"],
  godBtn:["godWin","../Apps/God/GodWin.js"],
  filesBtn:["filesWin","../Apps/Files/FilesWin.js"],
  diskBtn:["diskWin","../Apps/Disk/DiskWin.js"],
  tsBtn:["tsWin","../Apps/Search/SearchWin.js"],
  chatBtn:["chatWin","../Apps/Chat/ChatWin.js"],
  settingsBtn:["settingsWin","../Apps/Settings/SettingsWin.js"],
  cheatsheetBtn:["cheatsheetWin","../Apps/Help/CheatsheetWin.js"],
  mobileHelp:["guide","../Apps/Help/HelpWin.js"]};
const workspace=new Map,restorers=new Map;
let saved={},restoring=true,save_queued=false;
try {
  saved=JSON.parse(sessionStorage.getItem("templeos.workspace") ||
    localStorage.getItem("templeos.workspace")) || {};
} catch (error) {
  saved={};
}
if (typeof saved!="object" || Array.isArray(saved))
  saved={};

export function WinWorkspaceSave()
{
  let id,entry,w,record,overlay,style;
  if (restoring)
    return;
  for ([id,entry] of workspace) {
    w=entry.w;
    if (!w.isConnected && w._restore) {
      workspace.delete(id);
      delete saved[id];
    } else {
      record=saved[id] || {};
      overlay=w.closest(".overlay");
      record.open=w.isConnected && w.style.display!="none" &&
	(!overlay || overlay.classList.contains("open")) &&
	(!WinMobile(w) || getComputedStyle(w).display!="none" ||
	w.classList.contains("win-pass-owned"));
      record.free=!!overlay?.classList.contains("free");
      record.restore=w._restore;
      if (!w.dataset.popup && !w.classList.contains("fsmode") && !WinMobile(w)) {
	style=w.style;
	record.rect=null;
	if (w.dataset.floating)
	record.rect={left:style.left,top:style.top,width:style.width,
	  height:style.height,sized:!!w.dataset.sized,flow:!!w._ph};
      }
      saved[id]=record;
    }
  }
  try {
    sessionStorage.setItem("templeos.workspace",JSON.stringify(saved));
    localStorage.setItem("templeos.workspace",JSON.stringify(saved));
  } catch (error) {
    dispatchEvent(new CustomEvent("winworkspaceerror",{detail:
      "Window layout changed for this visit; browser storage is unavailable."}));
  }
}

function WinSaveSoon()
{
  if (!save_queued) {
    save_queued=true;
    queueMicrotask(function () {
      save_queued=false;
      WinWorkspaceSave();
    });
  }
}

function WinApply(w)
{
  let record=saved[w?.id],rect=record?.rect;
  if (!w || !rect || WinMobile(w) || w.dataset.popup)
    return;
  if (rect.flow)
    WinFloat(w);
  w.dataset.floating="1";
  w.style.position="fixed";
  w.style.margin="0";
  w.style.width=rect.width || "";
  w.style.height=rect.height || "";
  w.style.left=Clamp(parseFloat(rect.left) || 0,48-w.offsetWidth,innerWidth-48)+"px";
  w.style.top=Clamp(parseFloat(rect.top) || 0,0,innerHeight-24)+"px";
  if (rect.sized)
    w.dataset.sized="1";
  w.dispatchEvent(new Event("winsize"));
}

function WinRemember(w,restore)
{
  let observer,record=saved[w.id];
  if (!w.id || w.id=="winLoading")
    return;
  w._restore=restore;
  workspace.set(w.id,{w,style:w.style.cssText});
  queueMicrotask(function () {
    let overlay=w.closest(".overlay");
    WinApply(w);
    if (record && !overlay && !restore) {
      w.style.display="none";
      if (record.open)
	w.style.display="";
      if (w._reopen) {
	w._reopen.style.display="";
	if (record.open)
	  w._reopen.style.display="none";
      }
    }
    observer=new MutationObserver(WinSaveSoon);
    observer.observe(w,{attributes:true,attributeFilter:["class","style"]});
    if (overlay)
      observer.observe(overlay,{attributes:true,attributeFilter:["class"]});
    WinSaveSoon();
  });
}

export function WinRestore(kind,Open)
{
  restorers.set(kind,Open);
}

export function WinWorkspaceReset()
{
  let entry,w,id,display;
  for ([id,entry] of workspace) {
    w=entry.w;
    WinPopupReturn(w);
    display=w.style.display;
    w.style.cssText=entry.style;
    w.style.display=display;
    delete w.dataset.floating;
    delete w.dataset.sized;
    if (w._ph) {
      w._ph.remove();
      w._ph=null;
    }
    if (saved[id])
      saved[id].rect=null;
    w.dispatchEvent(new Event("winsize"));
  }
  WinWorkspaceSave();
}

async function WinWorkspaceRestore()
{
  let id,spec,record,module,Open;
  try {
    await import("../Apps/Help/HelpWin.js");
    for (id in WINS) {
      spec=WINS[id];
      record=saved[spec[0]];
      if (record?.open && (id!="mobileHelp" || WinMobile())) {
	module=await import(spec[1]);
	await module.Open();
	WinApply($(spec[0]));
	if (record.free) {
	  $(spec[0]).closest(".overlay")?.classList.add("free");
	  $(spec[0]).closest(".overlay")?.setAttribute("aria-modal","false");
	}
      }
    }
    if (Object.values(saved).some(function (record) {
      return record?.open && record.restore?.kind=="video";
    }))
      await import("../Apps/Search/VideoWin.js");
    if (Object.values(saved).some(function HasSavedGame(record) {
      return record?.open && record.restore?.kind=="game";
    }))
      await import("../Apps/Games/GamesRun.js");
    for (id in saved) {
      record=saved[id];
      Open=restorers.get(record?.restore?.kind);
      if (record?.open && Open) {
	await Open(record.restore.data,id);
	WinApply($(id));
	if (record.free) {
	  $(id)?.closest(".overlay")?.classList.add("free");
	  $(id)?.closest(".overlay")?.setAttribute("aria-modal","false");
	}
      }
    }
  } catch (error) {
    console.error("Could not restore a browser window",error);
  } finally {
    restoring=false;
    WinWorkspaceSave();
    dispatchEvent(new Event("winworkspaceready"));
  }
}

addEventListener("pagehide",WinWorkspaceSave);
addEventListener("winpopupreturn",WinSaveSoon);
new MutationObserver(WinSaveSoon).observe(document.body,{childList:true});

function Clamp(n,lo,hi)
{
  return Math.min(Math.max(n,lo),hi);
}

function Snap(n,cell)
{//Windows move and change size in whole text cells, as TempleOS's do.
  return Math.round(n/cell)*cell;
}

function Frac(pos,range)
{
  if (range<1)
    return 0;
  return 100*pos/range;
}

function Scrolls(el)
{
  return /auto|scroll/.test(getComputedStyle(el).overflow);
}

export function WinRaise(el)
{
  el.style.zIndex=++z_top;
}

export function WinFocus(w)
{
  let a,doc;
  for (doc of WinDocuments())
    for (a of doc.querySelectorAll(".win.active,#frame.active"))
      a.classList.remove("active");
  w.classList.add("active");
  WinRaise(w.closest(".overlay") || w);
  document.dispatchEvent(new CustomEvent("winfocus",{
    detail:{id:w.id}}));
  if (w.dataset.popup)
    w.ownerDocument.defaultView.focus();
}

function WinClose(w)
{
  w.style.display="none";
  if (w._ph) {
    w._ph.remove();
    w._ph=null;
  }
}

function WinFloat(w)
{
  let r=w.getBoundingClientRect(),ph;
  if (w.dataset.floating)
    return;
  if (!w.closest(".overlay")) {
    ph=document.createElement("div");
    ph.className="win-ph";
    ph.style.cssText="flex:0 0 auto;width:"+r.width+"px;height:"+
      r.height+"px;margin:"+getComputedStyle(w).margin;
    w.before(ph);
    w._ph=ph;
  }
  w.dataset.floating="1";
  w.style.position="fixed";
  w.style.margin="0";
  w.style.left=r.left+"px";
  w.style.top=r.top+"px";
  w.style.width=r.width+"px";
}

function BorderDown(e)
{//A press on the border, taken as WinMgr.HC takes one: the top row and the
//left column move the window, the bottom row sizes its height, the right
//column its width, and the bottom right corner both.
  if (e.currentTarget.classList.contains("fsmode") ||
      WinMobile(e.currentTarget) || e.pointerType=="touch" ||
      e.currentTarget.dataset.popup)
    return;
  let w=e.currentTarget,t=e.target,r=w.getBoundingClientRect(),x,y,
    width,height,moved=false,cell=w.clientLeft,move=t.closest(".wbar,.wvert") ||
      t==w && (e.clientY<r.top+cell || e.clientX<r.left+cell),
    sy=t.classList.contains("wszb") || t.classList.contains("wszcorner"),
    sx=t.classList.contains("wszr") || t.classList.contains("wszcorner");
  function Move(ev)
  {
    let dx=Snap(ev.clientX-e.clientX,cell),
      dy=Snap(ev.clientY-e.clientY,cell);
    if (move) {
      if (dx || dy) moved=true;
      w.style.left=Clamp(x+dx,4*cell-width,innerWidth-4*cell)+"px";
      w.style.top=Clamp(y+dy,0,innerHeight-2*cell)+"px";
    } else {
      if (sx)
	w.style.width=Math.max(width+dx,12*cell)+"px";
      if (sy)
	w.style.height=Math.max(height+dy,5*cell)+"px";
      w.dataset.sized="1";
      w.dispatchEvent(new Event("winsize"));
    }
  }
  function End(ev)
  {
    if (moved && ev?.type=="pointerup") {
      if (WinOutside(ev,w))
	WinPopup(w);
      else
	w.dispatchEvent(new CustomEvent("winmoved",{bubbles:true,
	  detail:{clientX:ev.clientX,clientY:ev.clientY}}));
    }
    WinWorkspaceSave();
  }
  if (e.button || t.closest(".wmenu,.close,.wsv,.wsh") || !move && !sx && !sy)
    return;
  WinFloat(w);
  x=parseFloat(w.style.left);
  y=parseFloat(w.style.top);
  width=w.offsetWidth;
  height=w.offsetHeight;
  PointerDrag(e,Move,End);
}

function WinDoc(w)
{
  let el;
  if (w._doc && w.contains(w._doc))
    return w._doc;
  for (el of w.querySelectorAll("*"))
    if ((el.scrollHeight>el.clientHeight || el.scrollWidth>el.clientWidth) &&
	  Scrolls(el))
      return w._doc=el;
  return null;
}

function WinScrolled(e)
{//The two scroll boxes follow what scrolls in the window: at the start of
//its document they straddle the top right and bottom left corners, at the
//end the bottom right (WinDerivedScrollValsUpdate, Adam/Ctrls/CtrlsA.HC).
  let w=e.currentTarget,el=e.target;
  if (!Scrolls(el))
    return;
  w._doc=el;
  w._sh.style.left="calc("+Frac(el.scrollLeft,el.scrollWidth-el.clientWidth)+
    "% - var(--wcell)/2)";
  w._sv.style.top="calc("+Frac(el.scrollTop,el.scrollHeight-el.clientHeight)+
    "% - var(--wcell)/2)";
}

function BoxDown(e)
{//A scroll box swaps its colors while it is held, and dragging it scrolls
//the window's document to match (LeftClickVWinScroll).
  let b=e.currentTarget,w=b.parentNode,el=WinDoc(w);
  function Move(ev)
  {
    let r=w.getBoundingClientRect();
    if (!el)
      return;
    if (b==w._sh)
      el.scrollLeft=Clamp((ev.clientX-r.left-w.clientLeft)/w.clientWidth,0,1)*
	    (el.scrollWidth-el.clientWidth);
    else
      el.scrollTop=Clamp((ev.clientY-r.top-w.clientTop)/w.clientHeight,0,1)*
	    (el.scrollHeight-el.clientHeight);
  }
  function Up()
  {
    b.classList.remove("on");
  }
  if (e.button || WinMobile(w) || e.pointerType=="touch")
    return;
  b.classList.add("on");
  Move(e);
  PointerDrag(e,Move,Up);
}

function WinMenu()
{//MENU brings up the Menu, as Ctrl+M brings up TempleOS's. (The screen's
//own MENU sends the guest Ctrl+M: Os.js.)
  let m=$("desktopMenu");
  MenuShow(true);
  WinFocus(m);
  m.scrollIntoView({block:"nearest"});
}

function WinDown(e)
{
  WinFocus(e.currentTarget);
}

export function WinTitle(w,title)
{//The title goes in the top row as DocBorderNew puts it, "title..."
//inverted in 15 columns, scrolling 8 chars a second (DocRecalc.HC), and
//its first word, 8 chars at most, down the left column, where
//DocBorderLstDraw puts a document's desc.
  let unit=title+"...",n=Math.ceil(15/unit.length)+1,
    s=w.querySelector(".wtitle > span");
  w.dataset.winTitle=title;
  s.textContent=unit.repeat(2*n);
  s.style.animationDuration=n*unit.length/8+"s";
  w.querySelector(".wvert > span").textContent=title.split(" ")[0].slice(0,8);
}

function Chrome(w,cls)
{
  let el=document.createElement("div");
  el.className="wc "+cls;
  w.append(el);
  return el;
}

export function WinDress(w,opts={})
{
  let bar=Chrome(w,"wbar"),x=w.querySelector(":scope > .close"),
    title=w.dataset.title,rb;
  function Close()
  {
    WinClose(w);
    rb.style.display="";
  }
  function Reopen()
  {
    w.style.display="";
    rb.style.display="none";
    WinFocus(w);
  }
  bar.innerHTML='<span class="wmenu">MENU</span>'+
    '<div class="wtitle"><span></span></div>';
  Chrome(w,"wvert").innerHTML="<span></span>";
  w._sv=Chrome(w,"wsv");
  w._sh=Chrome(w,"wsh");
  Chrome(w,"wszr");
  Chrome(w,"wszb");
  Chrome(w,"wszcorner");
  if (w.id!="frame")
    bar.firstChild.addEventListener("click",WinMenu);
  ButtonDress(bar.firstChild,"Open menu");
  if (x) {
    ButtonDress(x,"Close "+title);
    bar.append(x);
    if (opts.onClose)
      x.addEventListener("click",function () {
	WinPopupReturn(w);
	opts.onClose();
	WinWorkspaceSave();
      });
    else if (opts.menuReopen) {
      rb=document.createElement("button");
      rb.style.display="none";
      rb.dataset.win=w.id || title;
      rb.innerHTML='<span class="ico"><svg><use href="#i-'+
	    (w.dataset.icon || "window")+'"/></svg></span> '+title;
      w._reopen=rb;
      $("menuActions").append(rb);
      x.addEventListener("click",Close);
      rb.addEventListener("click",Reopen);
    }
  }
  WinTitle(w,title);
  w.removeAttribute("data-title");
  w.addEventListener("pointerdown",WinDown,true);
  w.addEventListener("pointerdown",BorderDown);
  w.addEventListener("scroll",WinScrolled,true);
  w._sv.addEventListener("pointerdown",BoxDown);
  w._sh.addEventListener("pointerdown",BoxDown);
  WinRemember(w,opts.restore);
  return w;
}

function ButtonDress(el,label)
{
  el.setAttribute("role","button");
  el.setAttribute("tabindex","0");
  el.setAttribute("aria-label",label);
  el.addEventListener("keydown",ButtonKey);
}

function ButtonKey(e)
{
  if (e.key=="Enter" || e.key==" ") {
    e.preventDefault();
    e.currentTarget.click();
  }
}

for (const w of document.querySelectorAll("[data-title]"))
  WinDress(w,{menuReopen:w.id!="frame" &&
    !w.classList.contains("toolbar")});
WinFocus($("frame"));

function OvFree(ov)
{
  let b=document.createElement("button");
  function Free()
  {
    ov.classList.add("free");
    ov.setAttribute("aria-modal","false");
    WinRaise(ov);
  }
  b.className="ovfree";
  b.title="close the dark backdrop - the window joins the desktop "+
    "(reopen the window to restore)";
  b.addEventListener("click",Free);
  ov.appendChild(b);
}

export function WinAdd(css,html)
{
  let st=document.createElement("style"),box=document.createElement("div"),el;
  st.textContent=css;
  document.head.appendChild(st);
  box.innerHTML=html;
  for (el of box.querySelectorAll("[data-title]"))
    WinDress(el);
  for (el of box.querySelectorAll(".overlay"))
    OvFree(el);
  document.body.append(...box.children);
}

let opening=0;
function LoadingClose()
{
  opening++;
  $("winLoadingOverlay").classList.remove("open");
}
async function WinOpen(id)
{
  if (!$("winLoadingOverlay")) {
    WinAdd('#winLoading { width:min(420px,92vw); }',
      '<div id="winLoadingOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Opening window">'+
      '<div id="winLoading" class="win" data-title="Loading"><button class="close" id="winLoadingClose" aria-label="Cancel opening">[X]</button>'+
      '<p id="winLoadingText" role="status"></p></div></div>');
    $("winLoadingClose").addEventListener("click",LoadingClose);
    $("winLoadingOverlay").addEventListener("pointerdown",function(e) {
      if(e.target===e.currentTarget)LoadingClose();
    });
  }
  const request=++opening;
  $("winLoadingText").textContent="Opening "+$(id).textContent.trim()+"…";
  $("winLoadingOverlay").classList.add("open");
  WinFocus($("winLoading"));
  MenuShow(false);
  try {
    const m=await import(WINS[id][1]);
    if(request!==opening)return;
    $("winLoadingOverlay").classList.remove("open");
    m.Open();
    WinApply($(WINS[id][0]));
    document.dispatchEvent(new CustomEvent("helpcontext",{detail:{id}}));
  } catch(e) {
    if(request===opening)$("winLoadingText").textContent="Could not open this window. Close and try again.";
    console.error(e);
  }
}

function MenuClick(e)
{
  WinOpen(e.currentTarget.id).catch(console.error);
}

function DesktopExtras(e)
{//Optional windows wait until the machine has presented its first frame.
  if(!e.detail.ready)return;
  removeEventListener("osstate",DesktopExtras);
  import("../Apps/Terry/TerryWin.js").catch(console.error);
}
addEventListener("osstate",DesktopExtras);

for (const id in WINS)
  $(id).addEventListener("click",MenuClick);

const random=$("terryRandom");
random.addEventListener("click",async function () {
  random.disabled=true;
  try {
    const {VideoRandomOpen}=await import("../Apps/Search/VideoWin.js");
    await VideoRandomOpen();
    random.title="Play a random Terry video";
  } catch (error) {
    random.title=error.message;
  } finally {random.disabled=false;}
});


function MenuShow(open)
{
  document.body.classList.toggle("menu-open",open);
  $("mobileMenu").setAttribute("aria-expanded",String(open));
  if (open)
    $("desktopMenu").style.display="";
}

$("mobileMenu").addEventListener("click",function () {
  MenuShow(!document.body.classList.contains("menu-open"));
});
$("menuShade").addEventListener("click",function () {MenuShow(false);});
document.querySelector(".toolbar .close").addEventListener("click",
  function () {
    MenuShow(false);
    if (!WinMobile())
      $("desktopMenu").style.display="none";
  });
$("mobileFull").addEventListener("click",function () {$("fsBtn").click();});

WinWorkspaceRestore();

const transcript=new URL(location.href).searchParams.get("transcript");
if (transcript) import("../Apps/Search/SearchWin.js").then(module=>module.OpenTranscript(transcript)).catch(console.error);
