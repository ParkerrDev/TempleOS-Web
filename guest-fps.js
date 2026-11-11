export function createGuestFpsMeter()
{//The label belongs to the captured frame. Never estimate it on a host timer.
  let fps=null,updates=null,paused=false;
  function reset()
  {
    fps=null;
    updates=null;
  }
  return {
    sample(value,count) {
      if (!Number.isSafeInteger(count) || count<0 ||
          updates!==null && count<=updates)
        return;
      if (value!==null && (!Number.isSafeInteger(value) || value<0))
        return;
      updates=count;
      fps=value;
    },
    reset,
    setPaused(value) {paused=!!value;},
    text() {
      if (fps===null)
        return "FPS: \u2014";
      return "FPS: "+fps;
    },
    get paused() {return paused;}
  };
}
