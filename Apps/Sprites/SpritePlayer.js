// Time determines the frame. A late callback skips to the correct frame instead
// of slowing the clip down by adding draw time to every frame's duration.
export function createSpritePlayer({count,delayMs,draw,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,hidden=()=>document.hidden}) {
  if(!Number.isInteger(count)||count<1||!Number.isFinite(delayMs)||delayMs<=0)throw new Error('Invalid sprite timing.');
  let handle=null,frame=0,elapsed=0,last=null,playing=false;
  function tick(now) {
    if(!playing)return;
    if(!hidden()) {
      if(last!==null)elapsed+=Math.max(0,now-last);
      const next=Math.floor(elapsed/delayMs)%count;
      if(next!==frame){frame=next;draw(frame);}
      last=now;
    }else last=null;
    handle=requestFrame(tick);
  }
  return {
    get playing(){return playing;},
    play(from=frame){
      if(playing)return;
      frame=Math.max(0,Math.min(count-1,Math.trunc(from)));elapsed=frame*delayMs;last=null;playing=true;
      draw(frame);handle=requestFrame(tick);
    },
    stop(){playing=false;if(handle!==null)cancelFrame(handle);handle=null;last=null;},
  };
}
