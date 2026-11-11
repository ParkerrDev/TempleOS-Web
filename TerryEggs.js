let close=null;

export function TerryEggs(win)
{
  close?.();
  let box=document.createElement("div"),stage,actor,label,sound,audio=null,
    animation=null,kind="parrot",hits=0,muted=true,
    reduced=matchMedia("(prefers-reduced-motion:reduce)"),
    events=new AbortController(),options={signal:events.signal};
  box.id="terryEgg";
  box.innerHTML='<style>#terryEgg{border:2px solid var(--blue);padding:6px;'+
    'margin-top:8px}#terryEgg .egg-stage{height:110px;position:relative;'+
    'overflow:hidden}#terryEgg .egg-actor{position:absolute;width:88px;'+
    'height:72px;left:0;top:12px;padding:0;background:transparent;'+
    'border:0;color:var(--red)}#terryEgg img{width:80px;height:64px;'+
    'object-fit:contain;image-rendering:pixelated}#terryEgg button{'+
    'width:auto;font-size:12px}#terryEgg .egg-actions{display:flex;'+
    'gap:6px;flex-wrap:wrap}</style><div class="egg-stage">'+
    '<button class="egg-actor" aria-label="Catch the parrot"></button></div>'+
    '<p class="egg-label" role="status">Catch the parrot.</p>'+
    '<div class="egg-actions"><button class="egg-sound" aria-pressed="false">'+
    'Voice: off</button><button class="egg-close">Close game</button></div>';
  win.append(box);
  stage=box.querySelector(".egg-stage");
  actor=box.querySelector(".egg-actor");
  label=box.querySelector(".egg-label");
  sound=box.querySelector(".egg-sound");
  function quiet()
  {
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio=null;
    }
  }
  function say(file)
  {
    quiet();
    if (muted || document.hidden)
      return;
    audio=new Audio("./assets/afterdavis/"+file+".mp3");
    audio.volume=0.5;
    let current=audio;
    current.play().catch(function () {
      if (audio===current && !muted)
        label.textContent="Voice playback is unavailable. The game still works.";
    });
  }
  function place()
  {
    animation?.cancel();
    animation=null;
    let width=Math.max(0,stage.clientWidth-88);
    actor.style.left="0px";
    if (kind=="parrot") {
      actor.replaceChildren();
      if (reduced.matches)
        actor.textContent="PARROT";
      else {
        let img=document.createElement("img");
        img.src="./assets/afterdavis/parrot.gif";
        img.alt="";
        img.draggable=false;
        actor.append(img);
        animation=actor.animate([{transform:"translateX(0)"},
          {transform:"translateX("+width+"px)"}],{duration:2800,
          iterations:Infinity,direction:"alternate",easing:"linear"});
      }
    } else
      actor.style.left=Math.round(Math.random()*width)+"px";
    if (document.hidden)
      animation?.pause();
  }
  function stop()
  {
    events.abort();
    observer.disconnect();
    animation?.cancel();
    quiet();
    box.remove();
    close=null;
  }
  const observer=new ResizeObserver(place);
  observer.observe(stage);
  sound.addEventListener("click",function () {
    muted=!muted;
    sound.setAttribute("aria-pressed",String(!muted));
    sound.textContent=muted?"Voice: off":"Voice: on";
    if (muted)
      quiet();
    else
      say(kind=="parrot"?"bird":"glowie");
  },options);
  actor.addEventListener("click",function () {
    if (kind=="parrot") {
      kind="glowie";
      actor.textContent="CIA\nGLOWIE";
      actor.setAttribute("aria-label","Catch the glowie");
      label.textContent="Parrot caught. Catch the glowie three times.";
      say("shut-up-bird");
      place();
    } else if (++hits<3) {
      label.textContent="Glowie caught "+hits+" of 3 times.";
      say("glowie");
      place();
    } else {
      actor.hidden=true;
      label.textContent="Both caught. AfterDavis easter egg complete.";
      quiet();
    }
  },options);
  box.querySelector(".egg-close").addEventListener("click",stop,options);
  win.addEventListener("helpclose",stop,options);
  document.addEventListener("visibilitychange",function () {
    if (document.hidden) {
      animation?.pause();
      quiet();
    } else
      animation?.play();
  },options);
  reduced.addEventListener("change",place,options);
  close=stop;
  place();
}
