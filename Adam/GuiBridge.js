import {GrLoad} from "../Apps/Sprites/Gr.js";
import {CharByte} from "../hemu/holyc-wasm/src/encoding.js";

const LIMIT=1048576,CHROME=".wdraw,.wc,.wbar,.wvert,.wcorn,.wszcorner,.wszr,.wszb,.close",
  codec=await GrLoad(),colors=new Map,icons=new Map,bitmaps=new WeakMap;
const glyphs="☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼";
function Bytes(text)
{
  return Uint8Array.from([...text,"\0"],function (ch) {
    const n=ch.charCodeAt(0),i=glyphs.indexOf(ch);
    if (i>=0) return i+1;
    if (n<=255) return n;
    const plain=({"…":46,"–":45,"—":45,"’":39,"“":34,"”":34,"✓":251})[ch];
    if (plain) return plain;
    try {return CharByte(ch);} catch {return 63;}
  });
}

function SvgImage(el,win)
{//Resolve shared SVG symbols and CSS colors before palette conversion.
  const copy=el.cloneNode(true),style=getComputedStyle(el);
  for (const use of copy.querySelectorAll("use")) {
    const ref=el.ownerDocument.querySelector(use.getAttribute("href"));
    if (ref) {
      const group=document.createElementNS("http://www.w3.org/2000/svg","g");
      group.innerHTML=ref.innerHTML;
      for (const attr of ref.attributes)
        if (!["id","viewBox"].includes(attr.name)) group.setAttribute(attr.name,attr.value);
      if (!copy.hasAttribute("viewBox") && ref.hasAttribute("viewBox"))
        copy.setAttribute("viewBox",ref.getAttribute("viewBox"));
      use.replaceWith(group);
    }
  }
  copy.setAttribute("xmlns","http://www.w3.org/2000/svg");
  copy.style.color=style.color;
  for (const key of ["fill","stroke","stroke-width"])
    copy.style.setProperty(key,style.getPropertyValue(key));
  const source=new XMLSerializer().serializeToString(copy);
  let img=icons.get(source);
  if (!img) {
    img=new Image;icons.set(source,img);
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
    img.decode().then(function () {win.dispatchEvent(new Event("guiupdate"));}).catch(function () {});
  }
  return img.complete && img.naturalWidth?img:null;
}

export function GuiCompatible(win)
{
  return !win.matches("#spritesWin,.vidwin") && !win.querySelector("video,audio,iframe");
}

export function GuiHoverStyles()
{//Use the site's existing hover/pressed rules for remotely pointed controls.
  const rules=[];
  function Read(list)
  {
    for (const rule of list) {
      if (rule.selectorText && /:hover|:active/.test(rule.selectorText))
        rules.push(rule.cssText.replace(/:hover/g,".gui-hover").replace(/:active/g,".gui-press"));
      else if (rule.cssRules) {
        const start=rules.length;Read(rule.cssRules);
        if (rules.length>start && rule.conditionText)
          rules.splice(start,rules.length-start,"@media "+rule.conditionText+"{"+rules.slice(start).join("\n")+"}");
      }
    }
  }
  for (const sheet of document.styleSheets)
    if (sheet.ownerNode?.id!="guiStates") try {Read(sheet.cssRules);} catch {}
  let style=document.getElementById("guiStates");
  if (!style) {style=document.createElement("style");style.id="guiStates";document.head.append(style);}
  style.textContent=rules.join("\n");
}
function CssColor(value)
{
  if (!colors.has(value)) {
    const c=value.match(/[\d.]+/g)?.map(Number);
    colors.set(value,!c || c.length==4 && c[3]==0?255:
      codec.quantize(Uint8Array.of(...c.slice(0,3),255),1,1)[0]);
  }
  return colors.get(value);
}

export function GuiScene(win,ids=new WeakMap)
{//Convert resolved browser layout into native rectangles, text and images.
  if (!GuiCompatible(win))
    return null;
  const rect=win.getBoundingClientRect(),scale=Math.min(2/3,624/win.clientWidth),
    width=Math.min(624,Math.max(96,Math.ceil(win.clientWidth*scale/8)*8)),
    height=Math.min(464,Math.max(32,Math.ceil(win.clientHeight*scale/8)*8)),
    data=new Uint8Array(LIMIT),view=new DataView(data.buffer),actions=new Map,scroll=new Map,
    controls=new Map,regions=[],layers=[];
  let used=24,count=0,animated=false,clip={x:0,y:0,w:width,h:height};
  function Id(el)
  {
    let id=ids.get(el);
    if (!id) {id=ids.next || 2;ids.next=id+1;ids.set(el,id);}
    return id;
  }
  function Command(kind,x,y,w,h,color=0,id=0,bytes=new Uint8Array)
  {
    if (kind==1 || kind==4 || kind==5) {
      const right=Math.min(x+w,clip.x+clip.w),bottom=Math.min(y+h,clip.y+clip.h);
      x=Math.max(x,clip.x);y=Math.max(y,clip.y);w=right-x;h=bottom-y;
      if (w<=0 || h<=0) return;
    }
    const size=(bytes.length+7)&~7;
    if (used+32+size>LIMIT) throw Error("This window is too large for TempleOS.");
    for (const [i,n] of [kind,x,y,w,h,color,id,size].entries())
      view.setInt32(used+i*4,Math.round(n),true);
    data.set(bytes,used+32);used+=32+size;count++;
  }
  function Bounds(r)
  {
    return {x:Math.round((r.left-rect.left-win.clientLeft)*scale),
      y:Math.round((r.top-rect.top-win.clientTop)*scale),
      w:Math.round(r.width*scale),h:Math.round(r.height*scale)};
  }
  function Action(el,b)
  {
    if (el.matches(":disabled") || el.getAttribute("aria-disabled")=="true") return;
    const id=Id(el);
    actions.set(id,el);
    controls.set(id,{el,...b});
    Command(4,b.x,b.y,b.w,b.h,0,id);
    return id;
  }
  function Text(node,style)
  {
    const range=win.ownerDocument.createRange(),color=CssColor(style.color),text=node.textContent;
    let line="",left=0,top=0,last=0;
    function Flush() {
      if (line.trim()) Command(2,left,top,0,0,color,0,
        Bytes(line));
      line="";
    }
    for (let i=0;i<text.length;i++) {
      range.setStart(node,i);range.setEnd(node,i+1);
      const r=range.getBoundingClientRect(),b=Bounds(r);
      if (!r.width || !r.height || b.x<clip.x || b.x+8>clip.x+clip.w ||
          b.y<clip.y || b.y+8>clip.y+clip.h) {Flush();continue;}
      if (line && (Math.abs(b.y-top)>2 || Math.abs(b.x-last)>2)) Flush();
      if (!line) {left=b.x;top=b.y+Math.max(0,Math.round((b.h-8)/2));}
      line+=text[i];last=b.x+8;
    }
    Flush();
  }
  function Field(el,b,style)
  {//HTML retains editing, selection, clipboard and form behavior.
    const id=Action(el,b),focus=el==el.ownerDocument.activeElement,
      color=CssColor(style.color)==255?0:CssColor(style.color),
      x=b.x+Math.round((parseFloat(style.paddingLeft)+el.clientLeft)*scale),
      y=b.y+Math.round((parseFloat(style.paddingTop)+el.clientTop)*scale),
      cols=Math.max(1,Math.floor((b.w-(parseFloat(style.paddingLeft)+parseFloat(style.paddingRight))*scale)/8)),
      top=Math.floor(el.scrollTop*scale/8),left=Math.floor(el.scrollLeft*scale/8),
      rows=Math.max(1,Math.floor((b.h-(parseFloat(style.paddingTop)+parseFloat(style.paddingBottom))*scale)/8));
    let value=el.value || "",start=el.selectionStart,end=el.selectionEnd;
    if (el.tagName=="TEXTAREA" && CssColor(style.color)==255)
      Command(1,b.x,b.y,b.w,b.h,15);
    if (el.matches('input[type=checkbox],input[type=radio]')) {
      const size=Math.min(12,b.w,b.h);
      Command(1,b.x,b.y,size,size,color);
      Command(1,b.x+1,b.y+1,size-2,size-2,15);
      if (el.checked) Command(2,b.x+(size-8)/2,b.y+(size-8)/2,0,0,color,0,Bytes("X"));
      return;
    }
    if (el.tagName=="SELECT") {
      Command(2,x,y,0,0,color,0,Bytes((el.selectedOptions[0]?.text || "").slice(0,Math.max(1,cols-2))));
      Command(2,b.x+b.w-12,y,0,0,color,0,Bytes("▼"));return;
    }
    if (el.type=="range") {
      const n=(Number(el.value)-Number(el.min || 0))/(Number(el.max || 100)-Number(el.min || 0));
      Command(1,b.x,b.y+b.h/2,b.w,1,color);
      Command(1,b.x+n*(b.w-8),b.y,8,b.h,color);return;
    }
    if (el.type=="password") value="*".repeat(value.length);
    const lines=[];let line=[],offset=0;
    const syntax=new Uint8Array(value.length).fill(color),highlight=el.previousElementSibling;
    if (highlight?.tagName=="PRE" && highlight.textContent==value) {
      const walker=el.ownerDocument.createTreeWalker(highlight,NodeFilter.SHOW_TEXT);
      let node,at=0;
      while (node=walker.nextNode()) {
        syntax.fill(CssColor(getComputedStyle(node.parentElement).color),at,at+node.length);at+=node.length;
      }
    }
    for (const ch of value || el.placeholder || "") {
      if (ch=="\n") {lines.push({cells:line,end:offset});line=[];}
      else {
        const cnt=ch=="\t"?8-line.length%8:1;
        for (let i=0;i<cnt;i++) line.push({ch:ch=="\t"?" ":ch,pos:offset});
        if (el.tagName=="TEXTAREA" && el.wrap!="off" && line.length>=cols) {
          lines.push({cells:line,end:offset+1});line=[];
        }
      }
      offset++;
    }
    lines.push({cells:line,end:offset});
    if (controls.has(id)) Object.assign(controls.get(id),{lines,x,y,top,left,cols});
    for (let row=top;row<Math.min(lines.length,top+rows);row++) {
      const cells=lines[row].cells,part=cells.slice(left,left+cols),py=y+(row-top)*8;
      for (let col=0;col<part.length;col++)
        if (focus && value && start<=part[col].pos && part[col].pos<end)
          Command(1,x+col*8,py,8,8,9);
      for (let col=0;col<part.length;) {
        const first=col,c=focus && start<=part[col].pos && part[col].pos<end?15:value?syntax[part[col].pos]:8;
        let text="";
        while (col<part.length && (focus && start<=part[col].pos && part[col].pos<end?15:value?syntax[part[col].pos]:8)==c)
          text+=part[col++].ch;
        Command(2,x+first*8,py,0,0,c,0,Bytes(text));
      }
      if (focus && start==end) {
        let col=cells.findIndex(c=>c.pos==start);
        if (col<0 && lines[row].end==start) col=cells.length;
        if (left<=col && col<=left+cols) Command(1,x+(col-left)*8,py,1,8,color);
      }
    }
  }
  function Visit(el,layer=false)
  {
    if (el.matches(CHROME) || el.hidden) return;
    if (el.tagName=="PRE" && el.nextElementSibling?.tagName=="TEXTAREA" &&
        el.textContent==el.nextElementSibling.value) return;
    const style=getComputedStyle(el),r=el.getBoundingClientRect(),b=Bounds(r);
    if (style.display=="none" || style.visibility=="hidden" || !r.width || !r.height || b.y>=height || b.y+b.h<0) return;
    if (style.opacity=="0") return;
    if (!layer && style.position!="static" && Number(style.zIndex)>0) {
      layers.push({el,clip,z:Number(style.zIndex)});return;
    }
    regions.push({el,x:Math.max(b.x,clip.x),y:Math.max(b.y,clip.y),
      w:Math.max(0,Math.min(b.x+b.w,clip.x+clip.w)-Math.max(b.x,clip.x)),
      h:Math.max(0,Math.min(b.y+b.h,clip.y+clip.h)-Math.max(b.y,clip.y))});
    const parent_clip=clip,bg=CssColor(style.backgroundColor);
    if (el.scrollHeight>el.clientHeight && /auto|scroll/.test(style.overflowY)) {
      const id=Id(el);
      scroll.set(id,el);Command(5,b.x,b.y,b.w,b.h,0,id);
    }
    if (bg<16) Command(1,b.x,b.y,b.w,b.h,bg);
    for (const [side,x,y,w,h] of [["Top",b.x,b.y,b.w,parseFloat(style.borderTopWidth)*scale],
      ["Bottom",b.x,b.y+b.h-parseFloat(style.borderBottomWidth)*scale,b.w,parseFloat(style.borderBottomWidth)*scale],
      ["Left",b.x,b.y,parseFloat(style.borderLeftWidth)*scale,b.h],
      ["Right",b.x+b.w-parseFloat(style.borderRightWidth)*scale,b.y,parseFloat(style.borderRightWidth)*scale,b.h]]) {
      const color=CssColor(style["border"+side+"Color"]);
      if (w>0 && h>0 && color<16) Command(1,x,y,w,h,color);
    }
    if (parseFloat(style.outlineWidth)>0 && style.outlineStyle!="none") {
      const c=CssColor(style.outlineColor);
      Command(1,b.x-1,b.y-1,b.w+2,1,c);Command(1,b.x-1,b.y+b.h,b.w+2,1,c);
      Command(1,b.x-1,b.y,1,b.h,c);Command(1,b.x+b.w,b.y,1,b.h,c);
    }
    if (el.matches("button,a[href],[role=button],summary,label,canvas[tabindex]")) Action(el,b);
    if (/auto|scroll|hidden|clip/.test(style.overflowX+style.overflowY)) {
      const x=Math.max(clip.x,b.x),y=Math.max(clip.y,b.y);
      clip={x,y,w:Math.max(0,Math.min(clip.x+clip.w,b.x+b.w)-x),
        h:Math.max(0,Math.min(clip.y+clip.h,b.y+b.h)-y)};
    }
    if (el.matches("input,textarea,select")) Field(el,b,style);
    else if (el.matches("canvas,img,svg")) {
      const left=Math.max(b.x,clip.x),top=Math.max(b.y,clip.y),
        w=Math.min(b.x+b.w,clip.x+clip.w)-left,h=Math.min(b.y+b.h,clip.y+clip.h)-top,
        stride=(w+7)&~7,
        canvas=win.ownerDocument.createElement("canvas");
      if (w<=0 || h<=0) {clip=parent_clip;return;}
      canvas.width=w;canvas.height=h;
      const vector=el.matches("svg"),source=vector?SvgImage(el,win):el,
        key=[w,h,b.x-left,b.y-top,b.w,b.h].join(","),cached=bitmaps.get(source);
      if (!source || source.tagName=="IMG" && !source.naturalWidth) {clip=parent_clip;return;}
      if (vector && cached?.key==key) {
        Command(3,left,top,w,h,0,0,cached.pixels);clip=parent_clip;return;
      }
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      ctx.imageSmoothingEnabled=false;ctx.drawImage(source,b.x-left,b.y-top,b.w,b.h);
      const indices=codec.quantize(ctx.getImageData(0,0,w,h).data,w,h),
        pixels=new Uint8Array(stride*h).fill(255);
      for (let y=0;y<h;y++) pixels.set(indices.subarray(y*w,(y+1)*w),y*stride);
      if (vector) bitmaps.set(source,{key,pixels});
      Command(3,left,top,w,h,0,0,pixels);animated||=el.tagName=="CANVAS";
    } else {
      const before=getComputedStyle(el,"::before");
      if (/^".*"$/.test(before.content))
        Command(2,b.x,b.y,0,0,CssColor(before.color),0,Bytes(before.content.slice(1,-1)));
      for (const child of el.childNodes)
        if (child.nodeType==3) Text(child,style);
        else if (child.nodeType==1) Visit(child);
    }
    clip=parent_clip;
  }
  for (const child of win.children) Visit(child);
  while (layers.length) {
    layers.sort((a,b)=>a.z-b.z);
    const next=layers.shift();clip=next.clip;Visit(next.el,true);
  }
  [used,count,width,height,CssColor(getComputedStyle(win).backgroundColor),ids.get(win.ownerDocument.activeElement) || 0].forEach((n,i)=>view.setInt32(i*4,n,true));
  return {title:win.dataset.winTitle || win.dataset.title || "Browser window",
    gui:data.slice(0,used),cols:width/8,rows:height/8,actions,scroll,controls,regions,scale,animated};
}
