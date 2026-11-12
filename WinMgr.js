import {PointerDrag} from "./WinPointer.js";
const $=(id)=>document.getElementById(id);
const CELL=12; //a text cell: the site's 12px text is the 8x8 font at 1.5x
let z_top=1000; //one stack for every window, overlay and video window

function Clamp(n,lo,hi)
{
  return Math.min(Math.max(n,lo),hi);
}

function Snap(n)
{//Windows move and change size in whole text cells, as TempleOS's do.
  return Math.round(n/CELL)*CELL;
}

function Frac(pos,range)
{//pos as a percentage of range, 0 when nothing scrolls
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
{//Gives w the double border and the top of the stack. A window in an
//overlay raises its overlay.
  let a;
  for (a of document.querySelectorAll(".win.active,#frame.active"))
    a.classList.remove("active");
  w.classList.add("active");
  WinRaise(w.closest(".overlay") || w);
  w.dispatchEvent(new CustomEvent("winfocus",{bubbles:true,
    detail:{id:w.id}}));
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
{//Takes w out of the page's flow where it stands, leaving a placeholder
//its size, so it can move and change size.
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
  if (e.currentTarget.classList.contains("fsmode"))
    return;
  let w=e.currentTarget,t=e.target,r=w.getBoundingClientRect(),x,y,
    width,height,move=t.closest(".wbar,.wvert") ||
      t==w && (e.clientY<r.top+CELL || e.clientX<r.left+CELL),
    sy=t.classList.contains("wszb") || t.classList.contains("wszcorner"),
    sx=t.classList.contains("wszr") || t.classList.contains("wszcorner");
  function Move(ev)
  {
    let dx=Snap(ev.clientX-e.clientX),dy=Snap(ev.clientY-e.clientY);
    if (move) {
      w.style.left=Clamp(x+dx,4*CELL-width,innerWidth-4*CELL)+"px";
      w.style.top=Clamp(y+dy,0,innerHeight-2*CELL)+"px";
    } else {
      if (sx)
        w.style.width=Math.max(width+dx,12*CELL)+"px";
      if (sy)
        w.style.height=Math.max(height+dy,5*CELL)+"px";
      w.dataset.sized="1";
      w.dispatchEvent(new Event("winsize"));
    }
  }
  if (e.button || t.closest(".wmenu,.close,.wsv,.wsh") || !move && !sx && !sy)
    return;
  WinFloat(w);
  x=parseFloat(w.style.left);
  y=parseFloat(w.style.top);
  width=w.offsetWidth;
  height=w.offsetHeight;
  PointerDrag(e,Move);
}

function WinDoc(w)
{//What scrolls in w: what scrolled last, or else the first thing that can.
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
    "% - 6px)";
  w._sv.style.top="calc("+Frac(el.scrollTop,el.scrollHeight-el.clientHeight)+
    "% - 6px)";
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
  if (e.button)
    return;
  b.classList.add("on");
  Move(e);
  PointerDrag(e,Move,Up);
}

function WinMenu()
{//MENU brings up the Menu, as Ctrl+M brings up TempleOS's. (The screen's
//own MENU sends the guest Ctrl+M: Os.js.)
  let m=document.querySelector(".toolbar");
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
{//Puts TempleOS's chrome on w: the top row with MENU, the title and [X],
//the desc down the left column, the two scroll boxes, and the handles on
//the right and bottom edges. opts.onClose is what [X] does in place of
//hiding w; with opts.menuReopen a closed window leaves a button in the
//Menu that opens it again.
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
      x.addEventListener("click",opts.onClose);
    else if (opts.menuReopen) {
      rb=document.createElement("button");
      rb.style.display="none";
      rb.dataset.win=w.id || title;
      rb.innerHTML='<span class="ico"><svg><use href="#i-'+
	    (w.dataset.icon || "window")+'"/></svg></span> '+title;
      w._reopen=rb;
      document.querySelector(".toolbar").append(rb);
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
{//The [X] at the screen's corner sends the dark backdrop away, and the
//window joins the desktop.
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
{//Puts a window's style in the head and its markup in the page, dressed.
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

const WINS={editorBtn:"./EditorWin.js",gamesBtn:"./games.js",
  spritesBtn:"./SpritesWin.js",godBtn:"./GodWin.js",diskBtn:"./DiskWin.js",
  tsBtn:"./SearchWin.js",chatBtn:"./ChatWin.js",
  settingsBtn:"./SettingsWin.js",mobileHelp:"./HelpWin.js"};

async function WinOpen(id)
{//Opens the window a Menu button names, loading its module the first time.
  let m=await import(WINS[id]);
  m.Open();
  MenuShow(false);
  document.dispatchEvent(new CustomEvent("helpcontext",{detail:{id}}));
}

function MenuClick(e)
{
  WinOpen(e.currentTarget.id).catch(console.error);
}

function ChatLoad()
{//Chat connects while the page is idle, to count what arrives while shut.
  import("./ChatWin.js").catch(console.error);
}

function PageLoaded()
{
  if (window.requestIdleCallback)
    requestIdleCallback(ChatLoad,{timeout:5000});
  else
    setTimeout(ChatLoad,2000);
}

for (const id in WINS)
  $(id).addEventListener("click",MenuClick);
addEventListener("load",PageLoaded);

function MenuShow(open)
{
  document.body.classList.toggle("menu-open",open);
  $("mobileMenu").setAttribute("aria-expanded",String(open));
  if (open)
    document.querySelector(".toolbar").style.display="";
}

$("mobileMenu").addEventListener("click",function () {
  MenuShow(!document.body.classList.contains("menu-open"));
});
$("menuShade").addEventListener("click",function () {MenuShow(false);});
document.querySelector(".toolbar .close").addEventListener("click",
  function () {
    MenuShow(false);
    if (!matchMedia("(max-width:980px)").matches)
      document.querySelector(".toolbar").style.display="none";
  });
$("mobileFull").addEventListener("click",function () {$("fsBtn").click();});

import("./HelpWin.js").catch(console.error);
import("./TerryWin.js").catch(console.error);
