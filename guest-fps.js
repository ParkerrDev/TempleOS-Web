// Guest rendering cadence is independent of changed pixels and host blit calls.
// Samples arrive with existing frame messages. The UI reads this on its own timer.
export function createGuestFpsMeter(now=()=>performance.now()) {
  let fps=null,updates=null,advancedAt=0,paused=false;
  function reset(){fps=null;updates=null;advancedAt=0;}
  return {
    sample(value,count){
      if(paused || !Number.isFinite(value) || value<0 || !Number.isSafeInteger(count) || count<0)return;
      if(count!==updates){advancedAt=now();updates=count;fps=value;}
    },
    reset,
    setPaused(value){paused=!!value;reset();},
    text(){
      if(paused)return 'FPS: 0';
      if(fps===null)return 'FPS: …';
      return 'FPS: '+(now()-advancedAt>=1500?0:Math.round(fps));
    },
    get paused(){return paused;},
  };
}
