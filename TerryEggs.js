//The AfterDavis easter egg. Five clicks on Terry send parrots across the
//whole page. Catch one and the CIA glowies peek in from the edges: catch
//each of them. The voice always plays; it starts from the visitor's click.
const DIR="./assets/",GLOWIES=[
  {img:"glowie",w:640,h:637,at:"bottom"},
  {img:"sniper",w:700,h:530,at:"right"},
  {img:"trio-seal",w:766,h:636,at:"left"},
  {img:"cia",w:336,h:272,at:"bottom",clip:true}],
  CSS="#terryEgg{position:fixed;inset:0;z-index:2147483000;overflow:hidden;"+
  "pointer-events:none}#terryEgg .egg-actor{position:absolute;left:0;top:0;"+
  "width:auto;padding:0;border:0;outline:0;background:transparent;"+
  "pointer-events:auto;will-change:transform}#terryEgg .egg-actor:hover{"+
  "background:transparent}#terryEgg .egg-actor:focus-visible{"+
  "outline:3px dashed var(--yellow)}#terryEgg .egg-actor img,"+
  "#terryEgg .egg-actor video{display:block;width:100%;height:100%;"+
  "object-fit:contain;pointer-events:none}#terryEgg .egg-parrot img{"+
  "animation:eggBob 1.2s ease-in-out infinite alternate}"+
  "#terryEgg .egg-glowie{isolation:isolate}#terryEgg .egg-glowie img{"+
  "filter:drop-shadow(0 0 10px #5F5)}#terryEgg .egg-glow{position:absolute;"+
  "inset:-10%;z-index:-1;border-radius:50%;background:radial-gradient("+
  "closest-side,#5F5A,#5F50);animation:eggGlow .9s ease-in-out infinite "+
  "alternate}#terryEgg .egg-clip{mask-image:radial-gradient(closest-side,"+
  "#000 62%,#0000);-webkit-mask-image:radial-gradient(closest-side,"+
  "#000 62%,#0000)}#terryEgg .egg-word{left:50%;top:28%;translate:-50% 0;"+
  "padding:8px 14px;font-size:24px;color:var(--red);background:#fff;"+
  "border:3px double var(--red)}#terryEgg .egg-word:hover{"+
  "background:#fff}#terryEgg .egg-finale{position:absolute;left:50%;"+
  "bottom:0;width:min(100vw,1100px);transform:translate(-50%,0);"+
  "mask-image:radial-gradient(ellipse 62% 100% at 50% 100%,#000 55%,#0000);"+
  "-webkit-mask-image:radial-gradient(ellipse 62% 100% at 50% 100%,"+
  "#000 55%,#0000)}#terryEgg .egg-hud{position:absolute;left:16px;"+
  "right:16px;bottom:12px;z-index:1;width:fit-content;margin:0 auto;"+
  "display:flex;align-items:center;gap:10px;padding:6px 8px;background:#fff;"+
  "color:var(--blue);border:3px double var(--blue);pointer-events:auto}"+
  "#terryEgg .egg-label{white-space:normal}#terryEgg .egg-close{width:auto}"+
  "@keyframes eggBob{from{translate:0 calc(var(--bob) * -1)}to{"+
  "translate:0 var(--bob)}}@keyframes eggGlow{from{opacity:.35;"+
  "transform:scale(.92)}to{opacity:.95;transform:scale(1.06)}}"+
  "@media (prefers-reduced-motion:reduce){#terryEgg .egg-glow{"+
  "animation:none;opacity:.7}}";
let box=null,hud,label,glowie,phase,hits,busy,audio,timers,events,paused=[],
  reduced=matchMedia("(prefers-reduced-motion:reduce)");

function Rand(lo,hi)
{
  return lo+Math.random()*(hi-lo);
}

function Pos(x,y)
{
  return "translate("+Math.round(x)+"px,"+Math.round(y)+"px)";
}

function Later(fn,ms)
{
  timers.push(setTimeout(fn,ms));
}

function Quiet()
{
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio=null;
  }
}

function Say(file)
{//A blocked play is silent. The next catch is a click, so it plays.
  Quiet();
  if (document.hidden)
    return;
  audio=new Audio(DIR+"afterdavis/"+file+".mp3");
  audio.volume=0.6;
  audio.play().catch(function () {});
}

function Actor(cls,name)
{
  let b=document.createElement("button");
  b.className="egg-actor "+cls;
  b.setAttribute("aria-label",name);
  box.insertBefore(b,hud);
  return b;
}

function ParrotLaunch(p,delay)
{//Fly one parrot across the page at a random height, size and speed.
  let vw=innerWidth,vh=innerHeight,w=Math.min(Rand(120,220),vw*0.3),
    left=Math.random()<0.5,y=Rand(vh*0.04,vh*0.68),x0=left?vw:-w,
    x1=left?-w:vw,img=p.firstChild,anim;
  p.style.width=Math.round(w)+"px";
  p.style.height=Math.round(w*0.75)+"px";
  img.style.scale=left?"-1 1":"1";
  img.style.setProperty("--bob",Math.round(Rand(10,34))+"px");
  img.style.animationDuration=Rand(0.8,1.6).toFixed(2)+"s";
  anim=p.animate([{transform:Pos(x0,y)},{transform:Pos(x1,y)}],
    {duration:(vw+2*w)/Rand(170,330)*1000,delay,fill:"backwards"});
  anim.onfinish=function () {
    if (phase=="parrot")
      ParrotLaunch(p,Rand(200,1800));
    else
      p.remove();
  };
}

function ParrotsStage()
{
  let i,p,img,n=innerWidth<600?4:6;
  if (reduced.matches) {
    p=Actor("egg-word","Catch the parrot");
    p.textContent="PARROT";
    p.addEventListener("click",ParrotCatch,{signal:events.signal});
    return;
  }
  for (i=0;i<n;i++) {
    p=Actor("egg-parrot","Catch the parrot");
    img=new Image();
    img.src=DIR+"afterdavis/parrot.gif";
    img.alt="";
    img.draggable=false;
    p.append(img);
    p.addEventListener("click",ParrotCatch,{signal:events.signal});
    ParrotLaunch(p,i?Rand(300,2800):0);
  }
}

function ParrotCatch(event)
{//The caught parrot tumbles and the rest of the flock hurries off.
  let p=event.currentTarget,refocus=document.activeElement==p,m,other;
  if (phase!="parrot")
    return;
  phase="glowie";
  Say("shut-up-bird");
  label.textContent="Parrot caught. Now catch the "+GLOWIES.length+
    " glowies.";
  if (reduced.matches) {
    p.remove();
    GlowieStage(refocus);
    return;
  }
  for (other of box.querySelectorAll(".egg-parrot"))
    if (other!=p)
      other.getAnimations().forEach(a=>a.playbackRate=4);
  m=getComputedStyle(p).transform;
  if (m=="none")
    m="";
  p.getAnimations().forEach(a=>a.cancel());
  p.style.transform=m;
  p.animate([{transform:m+" rotate(0)"},{transform:m+" translateY("+
    innerHeight+"px) rotate(540deg)"}],{duration:1100,easing:"ease-in"}).
    onfinish=()=>p.remove();
  Later(()=>GlowieStage(refocus),700);
}

function GlowieSize(g)
{
  let h=Math.min(innerHeight*0.45,innerWidth*0.5,380),w=h*g.w/g.h;
  if (w>innerWidth*0.7) {
    w=innerWidth*0.7;
    h=w*g.h/g.w;
  }
  return [w,h];
}

function GlowieDress()
{//The clip plays only with motion on; its poster stands in otherwise.
  let g=GLOWIES[hits],glow=document.createElement("span"),media;
  glow.className="egg-glow";
  if (g.clip && !reduced.matches) {
    media=document.createElement("video");
    media.muted=true;
    media.loop=true;
    media.autoplay=true;
    media.playsInline=true;
    media.poster=DIR+"glowies/cia.webp";
    media.innerHTML='<source src="'+DIR+'glowies/cia.webm" type="video/webm">'+
      '<source src="'+DIR+'glowies/cia.mp4" type="video/mp4">';
  } else {
    media=new Image();
    media.src=DIR+"glowies/"+g.img+".webp";
    media.alt="";
    media.draggable=false;
  }
  if (g.clip)
    media.className="egg-clip";
  glowie.replaceChildren(glow,media);
}

function GlowiePeek(delay)
{//In from an edge, a hover, and out again until it is caught.
  let g=GLOWIES[hits],vw=innerWidth,vh=innerHeight,[w,h]=GlowieSize(g),
    at=reduced.matches?g.at:["bottom","left","right"][Math.floor(Rand(0,3))],
    x,y,x0,y0;
  glowie.style.width=Math.round(w)+"px";
  glowie.style.height=Math.round(h)+"px";
  if (at=="bottom") {
    x=x0=reduced.matches?(vw-w)/2:Rand(0,vw-w);
    y=vh-h;
    y0=vh;
  } else {
    y=y0=reduced.matches?(vh-h)/2:Rand(vh*0.06,Math.max(vh*0.06,vh-h-70));
    x=at=="left"?0:vw-w;
    x0=at=="left"?-w:vw;
  }
  if (reduced.matches) {
    glowie.style.transform=Pos(x,y);
    return;
  }
  glowie.animate([{transform:Pos(x0,y0),easing:"ease-out"},
    {transform:Pos(x,y),offset:0.18,easing:"ease-in-out"},
    {transform:Pos(x,y-14),offset:0.5,easing:"ease-in-out"},
    {transform:Pos(x,y),offset:0.82,easing:"ease-in"},
    {transform:Pos(x0,y0)}],{duration:4800,delay,fill:"backwards"}).
    onfinish=function () {
      if (glowie && !busy)
        GlowiePeek(Rand(250,900));
    };
}

function GlowieStage(refocus)
{
  glowie=Actor("egg-glowie","Catch the glowie");
  glowie.addEventListener("click",GlowieCatch,{signal:events.signal});
  GlowieDress();
  GlowiePeek(0);
  if (refocus)
    glowie.focus({preventScroll:true});
}

function GlowieCatch()
{
  let m;
  if (phase!="glowie" || busy)
    return;
  Say("glowie");
  if (++hits<GLOWIES.length)
    label.textContent="Glowie caught: "+hits+" of "+GLOWIES.length+".";
  else {
    phase="done";
    label.textContent="All caught. AfterDavis easter egg complete.";
  }
  if (reduced.matches) {
    GlowieNext();
    return;
  }
  busy=true;
  m=getComputedStyle(glowie).transform;
  if (m=="none")
    m="";
  glowie.getAnimations().forEach(a=>a.cancel());
  glowie.animate([{transform:m+" scale(1)",opacity:1},
    {transform:m+" scale(0.1) rotate(30deg)",opacity:0}],
    {duration:450,easing:"ease-in"}).onfinish=function () {
      busy=false;
      GlowieNext();
    };
}

function GlowieNext()
{
  let refocus=document.activeElement==glowie;
  if (phase=="glowie") {
    GlowieDress();
    GlowiePeek(250);
    return;
  }
  glowie.remove();
  glowie=null;
  FinaleShow();
  if (refocus)
    hud.querySelector(".egg-close").focus({preventScroll:true});
}

function FinaleShow()
{//Three glowies rise out of green smoke, then the egg closes itself.
  let img=new Image();
  img.className="egg-finale";
  img.src=DIR+"glowies/trio-smoke.webp";
  img.alt="";
  box.insertBefore(img,hud);
  if (!reduced.matches)
    img.animate([{transform:"translate(-50%,100%)",easing:"ease-out"},
      {transform:"translate(-50%,0)",offset:0.15},
      {transform:"translate(-50%,0)",offset:0.85,easing:"ease-in"},
      {transform:"translate(-50%,100%)"}],{duration:7000,fill:"forwards"});
  Later(Stop,reduced.matches?10000:7100);
}

function Restage()
{//Motion turned on or off: lay the current part out again.
  if (phase=="parrot") {
    box.querySelectorAll(".egg-actor").forEach(a=>a.remove());
    ParrotsStage();
  } else if (phase=="glowie" && glowie) {
    glowie.getAnimations().forEach(a=>a.cancel());
    glowie.style.opacity="";
    busy=false;
    GlowieDress();
    GlowiePeek(0);
  }
}

function HudPlace()
{//Above the Keys bar when a phone docks it across the bottom.
  let keys=document.querySelector(".keyswin"),r=keys?.getBoundingClientRect(),
    bottom=12;
  if (r && r.height && r.width>innerWidth*0.8 && r.bottom>innerHeight-4)
    bottom+=Math.round(innerHeight-r.top);
  hud.style.bottom=bottom+"px";
}

function Visibility()
{
  if (document.hidden) {
    paused=box.getAnimations({subtree:true}).
      filter(a=>a.playState=="running");
    paused.forEach(a=>a.pause());
    box.querySelectorAll("video").forEach(v=>v.pause());
    Quiet();
  } else {
    paused.forEach(a=>a.play());
    paused=[];
    box.querySelectorAll("video").forEach(v=>v.play().catch(function () {}));
  }
}

function Stop()
{
  if (!box)
    return;
  events.abort();
  timers.forEach(clearTimeout);
  box.getAnimations({subtree:true}).forEach(a=>a.cancel());
  Quiet();
  box.remove();
  box=glowie=null;
}

export function TerryEggs(win)
{
  let options;
  Stop();
  phase="parrot";
  hits=0;
  busy=false;
  timers=[];
  paused=[];
  events=new AbortController();
  options={signal:events.signal};
  box=document.createElement("div");
  box.id="terryEgg";
  box.innerHTML="<style>"+CSS+"</style><div class=\"egg-hud\">"+
    "<p class=\"egg-label\" role=\"status\">Catch a parrot.</p>"+
    "<button class=\"egg-close\">Close</button></div>";
  hud=box.querySelector(".egg-hud");
  label=box.querySelector(".egg-label");
  document.body.append(box);
  hud.querySelector(".egg-close").addEventListener("click",Stop,options);
  win.addEventListener("terryclose",Stop,options);
  document.addEventListener("keydown",function (event) {
    if (event.key=="Escape" && box.contains(document.activeElement))
      Stop();
  },options);
  document.addEventListener("visibilitychange",Visibility,options);
  reduced.addEventListener("change",Restage,options);
  addEventListener("resize",function () {
    HudPlace();
    if (reduced.matches && glowie)
      GlowiePeek(0);
  },options);
  HudPlace();
  Say("bird");
  ParrotsStage();
}
