const popups=new Map;
let leaving=false,notice=null;

export function WinDocuments()
{
  return [document,...Array.from(popups.values(),function PopupDocument(entry) {
    return entry.popup.document;
  })];
}

export function WinFind(id)
{
  let doc,el;
  for (doc of WinDocuments()) {
    el=doc.getElementById(id);
    if (el)
      return el;
  }
  return null;
}

export function WinMobile(w=document.body)
{
  let win=w.ownerDocument.defaultView;
  return win==window && (matchMedia("(max-width:979.98px)").matches ||
    matchMedia("(pointer:coarse)").matches);
}

export function WinOutside(e,w=document.body)
{
  let win=w.ownerDocument.defaultView;
  return e.clientX<0 || e.clientY<0 || e.clientX>=win.innerWidth ||
    e.clientY>=win.innerHeight;
}

function WinBringBack(w)
{
  let r=w.getBoundingClientRect();
  if (getComputedStyle(w).position=="fixed") {
    w.style.left=Math.max(0,Math.min(r.left,innerWidth-r.width))+"px";
    w.style.top=Math.max(12,Math.min(r.top,innerHeight-48))+"px";
  }
}

export function WinPopupReturn(w,close=true)
{
  let entry=popups.get(w),root;
  if (!entry)
    return;
  popups.delete(w);
  clearInterval(entry.timer);
  root=entry.root;
  if (entry.marker.isConnected) {
    entry.marker.replaceWith(root);
    delete w.dataset.popup;
    WinBringBack(w);
    w.dispatchEvent(new Event("winsize"));
  }
  if (close && !entry.popup.closed)
    entry.popup.close();
  dispatchEvent(new CustomEvent("winpopupreturn",{detail:{element:w}}));
}

function PopupBlocked(w)
{
  let text,button;
  if (notice)
    notice.remove();
  notice=document.createElement("div");
  notice.id="winPopupNotice";
  notice.setAttribute("role","status");
  text=document.createElement("span");
  text.textContent="The browser blocked the popup. "+
    "Allow popups, then try again.";
  button=document.createElement("button");
  button.textContent="Open window";
  button.addEventListener("click",function PopupRetry() {
    if (WinPopup(w)) {
      notice.remove();
      notice=null;
    }
  });
  notice.append(text,button);
  button=document.createElement("button");
  button.textContent="Dismiss";
  button.addEventListener("click",function PopupDismiss() {
    notice.remove();
    notice=null;
  });
  notice.append(button);
  document.body.append(notice);
}

export function WinPopup(w)
{//Move the live DOM; its canvas, controls and task identity stay the same.
  let r=w.getBoundingClientRect(),root=w.closest(".overlay") || w,
    entry=popups.get(w),display=getComputedStyle(w).display,
    popup,doc,base,style,button,el,marker;
  if (!w.isConnected) {
    if (notice) {
      notice.remove();
      notice=null;
    }
    return null;
  }
  if (entry) {
    entry.popup.focus();
    return entry.popup;
  }
  if (WinMobile(w) || leaving)
    return null;
  popup=window.open("","_blank","popup,width="+Math.max(320,Math.round(r.width))+
    ",height="+Math.max(160,Math.round(r.height)+36));
  if (!popup) {
    WinBringBack(w);
    PopupBlocked(w);
    return null;
  }
  doc=popup.document;
  doc.title=w.dataset.winTitle ||
    w.querySelector("canvas")?.getAttribute("aria-label") || "TempleOS window";
  base=doc.createElement("base");
  base.href=document.baseURI;
  doc.head.append(base);
  for (el of document.querySelectorAll("style,link[rel=stylesheet]"))
    doc.head.append(el.cloneNode(true));
  style=doc.createElement("style");
  style.textContent="html,body{height:100%;min-height:0;overflow:hidden}"+
    "body{padding:36px 0 0!important;display:block!important}"+
    "#popupReturn{position:fixed;inset:4px 4px auto;z-index:2147483647;"+
    "width:calc(100% - 8px);height:26px;padding:2px 8px}"+
    ".overlay{position:static!important;display:block!important;"+
    "padding:0!important;background:none!important;height:100%;pointer-events:auto}"+
    ".ovfree{display:none!important}body>.win,body>#frame,.overlay>.win{"+
    "display:"+display+"!important;position:relative!important;"+
    "left:0!important;top:0!important;"+
    "width:100%!important;max-width:none!important;height:100%!important;"+
    "max-height:none!important;margin:0!important;overflow:visible}"+
    ".win-pass{position:relative!important;left:0!important;top:0!important;"+
    "width:max-content;max-width:100%;margin:auto}"+
    ".win-pass canvas{max-width:100%;height:auto!important}"+
    ".wc{touch-action:none}.wszr,.wszb,.wszcorner{display:none}";
  doc.head.append(style);
  doc.body.className="popup";
  doc.body.classList.toggle("native-chrome",
    document.body.classList.contains("native-chrome"));
  el=document.querySelector("body > svg");
  if (el)
    doc.body.append(el.cloneNode(true));
  button=doc.createElement("button");
  button.id="popupReturn";
  button.textContent="Return to desktop";
  button.addEventListener("click",function PopupReturnClick() {WinPopupReturn(w);});
  doc.body.append(button);
  marker=document.createComment("Window in browser popup");
  root.before(marker);
  entry={popup,root,marker,timer:0};
  popups.set(w,entry);
  w.dataset.popup="1";
  doc.body.append(root);
  popup.addEventListener("pagehide",function PopupUnloaded() {WinPopupReturn(w,false);});
  popup.addEventListener("blur",function PopupBlur() {
    w.dispatchEvent(new Event("winpopupblur"));
  });
  entry.timer=setInterval(function PopupWatch() {
    if (popup.closed)
      WinPopupReturn(w,false);
    else if (!w.isConnected || w.style.display=="none" ||
	root.classList.contains("overlay") && !root.classList.contains("open"))
      WinPopupReturn(w);
  },200);
  dispatchEvent(new CustomEvent("winpopup",{detail:{window:popup,element:w}}));
  w.dispatchEvent(new Event("winsize"));
  popup.focus();
  return popup;
}

addEventListener("pagehide",function DesktopUnloaded() {
  leaving=true;
  for (let w of popups.keys())
    WinPopupReturn(w);
});
