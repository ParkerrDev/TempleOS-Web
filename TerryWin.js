const win=document.getElementById("terryWin"),canvas=document.getElementById("terrySprite"),
  reduced=matchMedia("(prefers-reduced-motion:reduce)");
let player=null,pending=false,clicks=0,last_click=0;

function Visible()
{
  return !document.hidden&&win.getBoundingClientRect().height>0;
}

async function Update()
{
  if(!player&&!pending&&Visible()) {
    pending=true;
    try {player=await (await import("./terry-sprite.js")).playTerrySprite(canvas);}
    catch(error) {console.warn("Terry sprite: "+error.message);}
    finally {pending=false;}
  }
  if(player) {
    if(Visible()&&!reduced.matches)player.play();
    else player.stop();
  }
}

async function Click()
{
  const now=performance.now();
  if(now-last_click>1500)clicks=0;
  last_click=now;
  if(++clicks===5) {
    clicks=0;
    const {TerryEggs}=await import("./TerryEggs.js");
    if(Visible())TerryEggs(win);
  }
}

canvas.addEventListener("click",Click);
canvas.addEventListener("keydown",event=>{
  if(event.key==="Enter"||event.key===" ") {event.preventDefault();Click();}
});
win.querySelector(".close").addEventListener("click",()=>win.dispatchEvent(new Event("terryclose")));
new ResizeObserver(Update).observe(win);
document.addEventListener("visibilitychange",Update);
reduced.addEventListener("change",Update);
Update();
