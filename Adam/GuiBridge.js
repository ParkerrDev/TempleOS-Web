import {GrLoad} from "../Apps/Sprites/Gr.js";

const LIMIT=1048576,CHROME=".wdraw,.wc,.wbar,.wvert,.wcorn,.wszcorner,.wszr,.wszb,.close",
  codec=await GrLoad(),colors=new Map,encoder=new TextEncoder;
function CssColor(value)
{
  if (!colors.has(value)) {
    const c=value.match(/[\d.]+/g)?.map(Number);
    colors.set(value,!c || c.length==4 && c[3]==0?255:
      codec.quantize(Uint8Array.of(...c.slice(0,3),255),1,1)[0]);
  }
  return colors.get(value);
}

export function GuiScene(win,ids=new Map)
{//Convert resolved browser layout into native rectangles, text and images.
  if (win.querySelector("video,audio,iframe,textarea,input,select,[contenteditable=true]"))
    return null;
  const rect=win.getBoundingClientRect(),scale=Math.min(2/3,624/win.clientWidth),
    width=Math.min(624,Math.max(96,Math.ceil(win.clientWidth*scale/8)*8)),
    height=Math.min(464,Math.max(32,Math.ceil(win.clientHeight*scale/8)*8)),
    data=new Uint8Array(LIMIT),view=new DataView(data.buffer),actions=new Map,scroll=new Map;
  let used=24,count=0,animated=false,clip={x:0,y:0,w:width,h:height};
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
    let id=ids.get(el);
    if (!id) {id=ids.size+2;ids.set(el,id);}
    actions.set(id,el);
    Command(4,b.x,b.y,b.w,b.h,0,id);
    if (!el.textContent.trim() && el.querySelector("svg")) {
      const label=el.getAttribute("aria-label") || el.title;
      if (!label) throw Error("Unlabelled icon controls must remain in the browser.");
      Command(2,b.x+2,b.y+Math.max(0,(b.h-8)/2),0,0,CssColor(getComputedStyle(el).color),0,
        encoder.encode(label.slice(0,Math.max(1,Math.floor((b.w-4)/8)))+"\0"));
    }
  }
  function Text(node,style)
  {
    const range=win.ownerDocument.createRange(),color=CssColor(style.color),text=node.textContent;
    let line="",left=0,top=0,last=0;
    function Flush() {
      if (line.trim()) Command(2,left,top,0,0,color,0,
        encoder.encode(line.replace(/[^\x20-\x7E]/g,"?")+"\0"));
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
  function Visit(el)
  {
    if (el.matches(CHROME) || el.hidden) return;
    const style=getComputedStyle(el),r=el.getBoundingClientRect(),b=Bounds(r);
    if (style.display=="none" || style.visibility=="hidden" || !r.width || !r.height || b.y>=height || b.y+b.h<0) return;
    if (style.transform!="none") throw Error("Transformed controls must remain in the browser.");
    const parent_clip=clip,bg=CssColor(style.backgroundColor);
    if (el.scrollHeight>el.clientHeight && /auto|scroll/.test(style.overflowY)) {
      let id=ids.get(el);
      if (!id) {id=ids.size+2;ids.set(el,id);}
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
    if (el.matches("button,a[href],[role=button]")) Action(el,b);
    if (/auto|scroll|hidden|clip/.test(style.overflowX+style.overflowY)) {
      const x=Math.max(clip.x,b.x),y=Math.max(clip.y,b.y);
      clip={x,y,w:Math.max(0,Math.min(clip.x+clip.w,b.x+b.w)-x),
        h:Math.max(0,Math.min(clip.y+clip.h,b.y+b.h)-y)};
    }
    if (el.matches("canvas,img")) {
      const left=Math.max(b.x,clip.x),top=Math.max(b.y,clip.y),
        w=Math.min(b.x+b.w,clip.x+clip.w)-left,h=Math.min(b.y+b.h,clip.y+clip.h)-top,
        stride=(w+7)&~7,
        canvas=win.ownerDocument.createElement("canvas");
      if (w<=0 || h<=0) {clip=parent_clip;return;}
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      ctx.imageSmoothingEnabled=false;ctx.drawImage(el,b.x-left,b.y-top,b.w,b.h);
      const indices=codec.quantize(ctx.getImageData(0,0,w,h).data,w,h),
        pixels=new Uint8Array(stride*h).fill(255);
      for (let y=0;y<h;y++) pixels.set(indices.subarray(y*w,(y+1)*w),y*stride);
      Command(3,left,top,w,h,0,0,pixels);animated||=el.tagName=="CANVAS";
    } else if (el.tagName!="svg" && el.tagName!="SVG")
      for (const child of el.childNodes)
        if (child.nodeType==3) Text(child,style);
        else if (child.nodeType==1) Visit(child);
    clip=parent_clip;
  }
  for (const child of win.children) Visit(child);
  [used,count,width,height,CssColor(getComputedStyle(win).backgroundColor)].forEach((n,i)=>view.setInt32(i*4,n,true));
  return {title:win.dataset.winTitle || win.dataset.title || "Browser window",
    gui:data.slice(0,used),cols:width/8,rows:height/8,actions,scroll,animated};
}
