export function TouchControls(frame,mouse)
{
  let canvas=frame.querySelector("canvas"),joy=frame.querySelector("#joy"),
    knob=frame.querySelector("#joyk"),active=new Map(),buttons=new Map(),
    timers=new Set(),raf=0,
    dx=0,dy=0,last=0,x=0,y=0;
  function later(fn,ms)
  {
    let id=setTimeout(function () {
      timers.delete(id);
      fn();
    },ms);
    timers.add(id);
    return id;
  }
  function cancel(id)
  {
    clearTimeout(id);
    timers.delete(id);
  }
  function stop()
  {
    for (let id of timers)
      clearTimeout(id);
    timers.clear();
    for (let press of active.values())
      press.target.classList.remove("on");
    active.clear();
    cancelAnimationFrame(raf);
    raf=dx=dy=0;
    knob.style.transform="";
    buttons.clear();
    mouse.buttons(0);
  }
  function button(source,bit,on)
  {
    if (on)
      buttons.set(source,bit);
    else
      buttons.delete(source);
    let mask=0;
    for (let bit of buttons.values())
      mask|=bit;
    mouse.buttons(mask);
  }
  function position(e)
  {
    let r=canvas.getBoundingClientRect();
    return [Math.max(0,Math.min(639,(e.clientX-r.left)*640/r.width)),
      Math.max(0,Math.min(479,(e.clientY-r.top)*480/r.height))];
  }
  function pulse(bit,ms)
  {
    let source=Symbol();
    button(source,bit,true);
    later(function () {button(source,bit,false);},ms);
  }
  function velocity(e)
  {
    let r=joy.getBoundingClientRect(),max=r.width/2-8,
      px=e.clientX-r.left-r.width/2,py=e.clientY-r.top-r.height/2,
      scale=Math.max(1,Math.hypot(px,py)/max);
    px/=scale;py/=scale;
    knob.style.transform=`translate(${px}px,${py}px)`;
    dx=px/max*420;dy=py/max*420;
  }
  function step(now)
  {
    let dt=Math.min(0.05,(now-last)/1000);
    last=now;
    x=Math.max(0,Math.min(639,x+dx*dt));
    y=Math.max(0,Math.min(479,y+dy*dt));
    mouse.move(x|0,y|0);
    raf=requestAnimationFrame(step);
  }
  for (let target of [canvas,joy,frame.querySelector("#tL"),
      frame.querySelector("#tR")]) {
    target.addEventListener("pointerdown",function (e) {
      if (e.pointerType!="touch" && e.pointerType!="pen" ||
          !document.body.classList.contains("touch") ||
          [...active.values()].some(press=>press.target===target))
        return;
      e.preventDefault();
      target.setPointerCapture(e.pointerId);
      let press={target,time:performance.now(),moved:0,timer:0};
      active.set(e.pointerId,press);
      if (target===canvas) {
        press.pos=position(e);
        mouse.move(...press.pos.map(Math.floor));
        press.timer=later(function () {pulse(2,120);},480);
      } else if (target===joy) {
        [x,y]=mouse.position();
        velocity(e);
        last=performance.now();
        raf=requestAnimationFrame(step);
      } else {
        press.bit=target.id=="tL"?1:2;
        button(press,press.bit,true);
        target.classList.add("on");
      }
    });
    target.addEventListener("pointermove",function (e) {
      let press=active.get(e.pointerId);
      if (!press)
        return;
      e.preventDefault();
      if (target===canvas) {
        let pos=position(e);
        press.moved+=Math.hypot(pos[0]-press.pos[0],pos[1]-press.pos[1]);
        press.pos=pos;
        mouse.move(...pos.map(Math.floor));
        if (press.moved>14)
          cancel(press.timer);
      } else if (target===joy)
        velocity(e);
    });
    function finish(e)
    {
      let press=active.get(e.pointerId);
      if (!press)
        return;
      active.delete(e.pointerId);
      cancel(press.timer);
      if (target===canvas && e.type=="pointerup" &&
          performance.now()-press.time<260 && press.moved<14)
        pulse(1,90);
      else if (target===joy) {
        cancelAnimationFrame(raf);
        raf=dx=dy=0;
        knob.style.transform="";
      } else if (press.bit) {
        button(press,press.bit,false);
        target.classList.remove("on");
      }
    }
    target.addEventListener("pointerup",finish);
    target.addEventListener("pointercancel",finish);
    target.addEventListener("lostpointercapture",finish);
    if (target.id=="tL" || target.id=="tR")
      target.addEventListener("click",function (e) {
        if (!e.detail)
          pulse(target.id=="tL"?1:2,90);
      });
  }
  addEventListener("os-input-reset",stop);
  return stop;
}
