//The AfterDavis easter egg. Five clicks on Terry send parrots across the
//whole page. Catch one and the CIA glowies come in, each visit a new way: a
//peek from an edge, a pop-up or a dash across. Catch all four. The voice
//says one line at a time with a rest after it, and now and then the
//TempleOS theme from afterdavis plays softly under it.
export const CHANCE={theme:0.4,late:0.5,voice:0.6,swoop:0.25,stray:0.3,
  flock:0.5};//late: the theme waits for the glowies.
const DIR="./assets/",OFF="translate(-9999px,0)",VOICE_VOL=0.6,
  VOICE_REST=2000,THEME_VOL=0.25,GLOWIES=[
  {img:"glowie",w:640,h:637,at:"bottom"},
  {img:"sniper",w:700,h:530,at:"right"},
  {img:"trio-seal",w:766,h:636,at:"left"},
  {img:"cia",w:336,h:272,at:"bottom",clip:true}],
  CSS="#terryEgg{position:fixed;inset:0;z-index:2147483000;overflow:hidden;"+
  "pointer-events:none}#terryEgg .egg-actor{position:absolute;left:0;top:0;"+
  "width:auto;padding:0;border:0;outline:0;background:transparent;"+
  "pointer-events:auto;will-change:transform}#terryEgg .egg-actor:hover{"+
  "background:transparent}#terryEgg .egg-actor:focus-visible{"+
  "outline:3px dashed var(--yellow)}#terryEgg .egg-stray{position:absolute;"+
  "left:0;top:0;will-change:transform}#terryEgg .egg-actor img,"+
  "#terryEgg .egg-actor video,#terryEgg .egg-stray img{display:block;"+
  "width:100%;height:100%;object-fit:contain;pointer-events:none}"+
  "#terryEgg .egg-parrot img,#terryEgg .egg-stray img{animation:eggBob 1.2s "+
  "ease-in-out infinite alternate}#terryEgg .egg-glowie{isolation:isolate}"+
  "#terryEgg .egg-glowie img{filter:drop-shadow(0 0 10px #5F5)}"+
  "#terryEgg .egg-glow{position:absolute;inset:-10%;z-index:-1;"+
  "border-radius:50%;background:radial-gradient(closest-side,#5F5A,#5F50);"+
  "animation:eggGlow .9s ease-in-out infinite alternate}#terryEgg .egg-clip{"+
  "mask-image:radial-gradient(closest-side,#000 62%,#0000);"+
  "-webkit-mask-image:radial-gradient(closest-side,#000 62%,#0000)}"+
  "#terryEgg .egg-word{left:50%;top:28%;translate:-50% 0;padding:8px 14px;"+
  "font-size:24px;color:var(--red);background:#fff;"+
  "border:3px double var(--red)}#terryEgg .egg-word:hover{background:#fff}"+
  "#terryEgg .egg-finale{position:absolute;left:50%;bottom:0;"+
  "width:min(100vw,1100px);transform:translate(-50%,0);"+
  "transform-origin:50% 100%;mask-image:radial-gradient(ellipse 62% 100% "+
  "at 50% 100%,#000 55%,#0000);-webkit-mask-image:radial-gradient(ellipse "+
  "62% 100% at 50% 100%,#000 55%,#0000)}#terryEgg .egg-hud{"+
  "position:absolute;left:16px;right:16px;bottom:12px;z-index:1;"+
  "width:fit-content;margin:0 auto;display:flex;align-items:center;gap:10px;"+
  "padding:6px 8px;background:#fff;color:var(--blue);"+
  "border:3px double var(--blue);pointer-events:auto}#terryEgg .egg-label{"+
  "white-space:normal}#terryEgg .egg-close{width:auto}@keyframes eggBob{"+
  "from{translate:0 calc(var(--bob) * -1)}to{translate:0 var(--bob)}}"+
  "@keyframes eggGlow{from{opacity:.35;transform:scale(.92)}to{opacity:.95;"+
  "transform:scale(1.06)}}@media (prefers-reduced-motion:reduce){"+
  "#terryEgg .egg-glow{animation:none;opacity:.7}}";
let box=null,hud,label,glowie,order,phase,hits,busy,theme_late,timers,events,
  voice=null,theme=null,rest_until=0,paused=[],
  reduced=matchMedia("(prefers-reduced-motion:reduce)");

function Rand(lo,hi)
{
  return lo+Math.random()*(hi-lo);
}

function Chance(p)
{
  return Math.random()<p;
}

function Pick(a)
{
  return a[Math.floor(Math.random()*a.length)];
}

function Shuffle(a)
{
  let i,j,tmp;
  for (i=a.length-1;i>0;i--) {
    j=Math.floor(Math.random()*(i+1));
    tmp=a[i];
    a[i]=a[j];
    a[j]=tmp;
  }
  return a;
}

function Pos(x,y)
{
  return "translate("+Math.round(x)+"px,"+Math.round(y)+"px)";
}

function Later(fn,ms)
{
  timers.push(setTimeout(fn,ms));
}

function AudioFree(a)
{
  a.pause();
  a.removeAttribute("src");
  a.load();
}

function VoiceStop()
{
  if (voice) {
    AudioFree(voice);
    voice=null;
  }
}

function Say(file,cut)
{//One line at a time, then a rest. Only cut breaks into a line.
  if (document.hidden)
    return;
  if (!cut && (voice && !voice.paused && !voice.ended ||
      performance.now()<rest_until))
    return;
  VoiceStop();
  voice=new Audio(DIR+"afterdavis/"+file+".mp3");
  voice.volume=VOICE_VOL;
  voice.onended=function () {
    rest_until=performance.now()+VOICE_REST;
  };
  voice.play().catch(function () {});
}

function Fade(a,to,ms,done)
{//Volume steps every 50 ms. A newer fade on the same track replaces it.
  let from=a.volume,t0=performance.now();
  clearInterval(a.egg_fade);
  a.egg_fade=setInterval(function () {
    let k=Math.min(1,(performance.now()-t0)/ms);
    a.volume=from+(to-from)*k;
    if (k==1) {
      clearInterval(a.egg_fade);
      done?.();
    }
  },50);
}

function ThemeStart()
{//Once through, not looped, under the voice.
  if (theme || document.hidden)
    return;
  theme=new Audio(DIR+"afterdavis/risen.mp3");
  theme.volume=0;
  theme.play().catch(function () {});
  Fade(theme,THEME_VOL,1500);
}

function ThemeEnd()
{
  let a=theme;
  theme=null;
  if (a)
    Fade(a,0,1200,()=>AudioFree(a));
}

function Actor(cls,name)
{
  let b=document.createElement("button");
  b.className="egg-actor "+cls;
  b.setAttribute("aria-label",name);
  b.style.transform=OFF;
  box.insertBefore(b,hud);
  return b;
}

function ParrotMake(stray)
{//A stray only flies by: it cannot be caught.
  let p,img=new Image();
  if (stray) {
    p=document.createElement("div");
    p.className="egg-stray";
    p.style.transform=OFF;
    box.insertBefore(p,hud);
  } else {
    p=Actor("egg-parrot","Catch the parrot");
    p.addEventListener("click",ParrotCatch,{signal:events.signal});
  }
  img.src=DIR+"afterdavis/parrot.gif";
  img.alt="";
  img.draggable=false;
  p.append(img);
  return p;
}

function ParrotLaunch(p,delay)
{//Across the page at a random height, size, speed and slope; some swoop.
  let vw=innerWidth,vh=innerHeight,w=Math.min(Rand(100,240),vw*0.3),
    left=Chance(0.5),y0=Rand(vh*0.03,vh*0.7),x0=left?vw:-w,x1=left?-w:vw,
    y1=Math.min(vh*0.75,Math.max(vh*0.02,y0+Rand(-0.25,0.25)*vh)),
    img=p.firstChild,frames=[{transform:Pos(x0,y0)},{transform:Pos(x1,y1)}];
  p.style.width=Math.round(w)+"px";
  p.style.height=Math.round(w*0.75)+"px";
  img.style.scale=left?"-1 1":"1";
  img.style.setProperty("--bob",Math.round(Rand(6,36))+"px");
  img.style.animationDuration=Rand(0.6,1.8).toFixed(2)+"s";
  if (Chance(CHANCE.swoop)) {
    frames[0].easing="ease-in";
    frames.splice(1,0,{transform:Pos((x0+x1)/2,Math.min(vh*0.8,
      Math.max(y0,y1)+Rand(0.12,0.3)*vh)),easing:"ease-out"});
  }
  p.animate(frames,{duration:(vw+2*w)/Rand(150,380)*1000,delay,
    fill:"backwards"}).onfinish=function () {
      if (phase=="parrot" && p.classList.contains("egg-parrot"))
        ParrotLaunch(p,Rand(150,2400));
      else
        p.remove();
    };
}

function Strays(n)
{
  let i;
  for (i=0;i<n;i++)
    ParrotLaunch(ParrotMake(true),Rand(0,1500));
}

function ParrotsStage()
{
  let i,p,n=Math.floor(innerWidth<600?Rand(3,6):Rand(4,9));
  if (reduced.matches) {
    p=Actor("egg-word","Catch the parrot");
    p.style.transform="";
    p.textContent="PARROT";
    p.addEventListener("click",ParrotCatch,{signal:events.signal});
    return;
  }
  for (i=0;i<n;i++)
    ParrotLaunch(ParrotMake(false),i?Rand(200,3000):0);
}

function ParrotCatch(event)
{//The caught parrot tumbles and the rest of the flock hurries off.
  let p=event.currentTarget,refocus=document.activeElement==p,m,other;
  if (phase!="parrot")
    return;
  phase="glowie";
  Say("shut-up-bird",true);
  if (theme_late)
    ThemeStart();
  label.textContent="Parrot caught. Now catch the "+GLOWIES.length+
    " glowies.";
  if (reduced.matches) {
    p.remove();
    GlowieStage(refocus);
    return;
  }
  for (other of box.querySelectorAll(".egg-parrot"))
    if (other!=p)
      other.getAnimations().forEach(a=>a.playbackRate=Rand(3,5));
  m=getComputedStyle(p).transform;
  if (m=="none")
    m="";
  p.getAnimations().forEach(a=>a.cancel());
  p.style.transform=m;
  p.animate([{transform:m+" rotate(0)"},{transform:m+" translateY("+
    innerHeight+"px) rotate("+Pick([-540,540,720])+"deg)"}],
    {duration:1100,easing:"ease-in"}).onfinish=()=>p.remove();
  Later(()=>GlowieStage(refocus),Rand(500,1300));
}

function GlowieSize(g,k)
{
  let h=Math.min(innerHeight*0.45*k,innerWidth*0.5,380*k),w=h*g.w/g.h;
  if (w>innerWidth*0.7) {
    w=innerWidth*0.7;
    h=w*g.h/g.w;
  }
  glowie.style.width=Math.round(w)+"px";
  glowie.style.height=Math.round(h)+"px";
  return [w,h];
}

function GlowieDress()
{//The clip plays only with motion on; its poster stands in otherwise.
  let g=order[hits],glow=document.createElement("span"),media;
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

function PeekFrames(w,h)
{//In from an edge, a hover, and back out.
  let vw=innerWidth,vh=innerHeight,at=Pick(["bottom","left","right"]),
    b=Rand(6,22),x,y,x0,y0;
  if (at=="bottom") {
    x=x0=Rand(0,vw-w);
    y=vh-h;
    y0=vh;
  } else {
    y=y0=Rand(vh*0.06,Math.max(vh*0.06,vh-h-70));
    x=at=="left"?0:vw-w;
    x0=at=="left"?-w:vw;
  }
  return [[{transform:Pos(x0,y0),easing:"ease-out"},
    {transform:Pos(x,y),offset:0.18,easing:"ease-in-out"},
    {transform:Pos(x,y-b),offset:0.5,easing:"ease-in-out"},
    {transform:Pos(x,y),offset:0.82,easing:"ease-in"},
    {transform:Pos(x0,y0)}],Rand(3600,6000)];
}

function PopFrames(w,h)
{//Out of nowhere anywhere on the page, a drift, and gone.
  let x=Rand(0,innerWidth-w),y=Rand(0,Math.max(0,innerHeight-h-60)),
    x1=x+Rand(-40,40),y1=y+Rand(-30,30);
  return [[{transform:Pos(x,y)+" scale(0.2)",opacity:0,easing:"ease-out"},
    {transform:Pos(x,y)+" scale(1)",opacity:1,offset:0.15},
    {transform:Pos(x1,y1)+" scale(1)",opacity:1,offset:0.8,easing:"ease-in"},
    {transform:Pos(x1,y1)+" scale(0.2)",opacity:0}],Rand(2800,4400)];
}

function DashFrames(w,h)
{//Straight across the page, rocking as it goes.
  let vh=innerHeight,y=Rand(vh*0.05,Math.max(vh*0.05,vh-h-60)),
    left=Chance(0.5),x0=left?innerWidth:-w,x1=left?-w:innerWidth,
    t=Rand(4,10),res=[],i;
  for (i=0;i<=4;i++)
    res.push({transform:Pos(x0+(x1-x0)*i/4,y)+" rotate("+(i&1?t:-t)+"deg)"});
  return [res,Rand(2600,4000)];
}

function GlowieStill()
{//Reduced motion: a still glowie in its own place.
  let g=order[hits],vw=innerWidth,vh=innerHeight,[w,h]=GlowieSize(g,1);
  if (g.at=="bottom")
    glowie.style.transform=Pos((vw-w)/2,vh-h);
  else
    glowie.style.transform=Pos(g.at=="left"?0:vw-w,(vh-h)/2);
}

function GlowieVisit(delay)
{//Each visit picks its way in, until the glowie is caught.
  let w,h,frames,t;
  if (reduced.matches) {
    GlowieStill();
    return;
  }
  [w,h]=GlowieSize(order[hits],Rand(0.8,1.15));
  [frames,t]=Pick([PeekFrames,PeekFrames,PopFrames,DashFrames])(w,h);
  glowie.style.transform=OFF;
  glowie.animate(frames,{duration:t,delay,fill:"backwards"}).
    onfinish=function () {
      if (glowie && !busy)
        GlowieVisit(Rand(150,1200));
    };
  if (delay && Chance(CHANCE.stray))
    Strays(1);
}

function GlowieStage(refocus)
{
  glowie=Actor("egg-glowie","Catch the glowie");
  glowie.addEventListener("click",GlowieCatch,{signal:events.signal});
  GlowieDress();
  GlowieVisit(0);
  if (refocus)
    glowie.focus({preventScroll:true});
}

function GlowieCatch()
{//The first catch speaks. Later ones may, if the voice is resting.
  let m;
  if (phase!="glowie" || busy)
    return;
  if (++hits==1 || Chance(CHANCE.voice))
    Say("glowie");
  if (hits<GLOWIES.length)
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
    {transform:m+" scale(0.1) rotate("+Pick([-30,30,200])+"deg)",opacity:0}],
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
    GlowieVisit(Rand(150,700));
    return;
  }
  glowie.remove();
  glowie=null;
  FinaleShow();
  if (refocus)
    hud.querySelector(".egg-close").focus({preventScroll:true});
}

function FinaleShow()
{//Three glowies out of green smoke, rising or looming, then the egg ends.
  let img=new Image(),t=Rand(6500,8500),mid="translate(-50%,0) scale(1)";
  img.className="egg-finale";
  img.src=DIR+"glowies/trio-smoke.webp";
  img.alt="";
  box.insertBefore(img,hud);
  if (!reduced.matches) {
    if (Chance(0.5))
      img.animate([{transform:"translate(-50%,100%)",easing:"ease-out"},
        {transform:mid,offset:0.15},
        {transform:mid,offset:0.85,easing:"ease-in"},
        {transform:"translate(-50%,100%)"}],{duration:t,fill:"forwards"});
    else
      img.animate([{transform:"translate(-50%,0) scale(0.5)",opacity:0,
        easing:"ease-out"},{transform:mid,opacity:1,offset:0.2},
        {transform:"translate(-50%,0) scale(1.04)",opacity:1,offset:0.85,
        easing:"ease-in"},{transform:"translate(-50%,0) scale(1.1)",
        opacity:0}],{duration:t,fill:"forwards"});
    if (Chance(CHANCE.flock))
      Strays(Math.floor(Rand(3,6)));
  }
  Later(Stop,reduced.matches?10000:t+100);
}

function Restage()
{//Motion turned on or off: lay the current part out again.
  if (phase=="parrot") {
    box.querySelectorAll(".egg-actor,.egg-stray").forEach(a=>a.remove());
    ParrotsStage();
  } else if (phase=="glowie" && glowie) {
    glowie.getAnimations().forEach(a=>a.cancel());
    glowie.style.opacity="";
    busy=false;
    GlowieDress();
    GlowieVisit(0);
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
    VoiceStop();
    theme?.pause();
  } else {
    paused.forEach(a=>a.play());
    paused=[];
    box.querySelectorAll("video").forEach(v=>v.play().catch(function () {}));
    if (theme && !theme.ended)
      theme.play().catch(function () {});
  }
}

function Stop()
{
  if (!box)
    return;
  events.abort();
  timers.forEach(clearTimeout);
  box.getAnimations({subtree:true}).forEach(a=>a.cancel());
  VoiceStop();
  ThemeEnd();
  box.remove();
  box=glowie=null;
}

function EggInit()
{
  phase="parrot";
  hits=0;
  busy=false;
  order=Shuffle(GLOWIES.slice());
  theme_late=false;
  rest_until=0;
  timers=[];
  paused=[];
  events=new AbortController();
  box=document.createElement("div");
  box.id="terryEgg";
  box.innerHTML="<style>"+CSS+"</style><div class=\"egg-hud\">"+
    "<p class=\"egg-label\" role=\"status\">Catch a parrot.</p>"+
    "<button class=\"egg-close\">Close</button></div>";
  hud=box.querySelector(".egg-hud");
  label=box.querySelector(".egg-label");
  document.body.append(box);
}

export function TerryEggs(win)
{
  let options;
  Stop();
  EggInit();
  options={signal:events.signal};
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
      GlowieStill();
  },options);
  HudPlace();
  Say("bird");
  if (Chance(CHANCE.theme)) {
    if (Chance(CHANCE.late))
      theme_late=true;
    else
      ThemeStart();
  }
  ParrotsStage();
}
