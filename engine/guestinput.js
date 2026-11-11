// One input bridge for single-core, SMP BSP and inline hosts. Guest addresses
// come from class metadata, and locked movement starts at the guest's cursor
// so MsSet recentering by an unmodified game is honored on the next frame.
const clamp=(n,max)=>Math.max(0,Math.min(max,Math.round(n)));
export function createGuestInput({guest,memory,base,onState=()=>{}}) {
  let x=320,y=240,b=0,wheel=0,dx=0,dy=0,relative=false,reset=true,lastHint='';
  let frameX=320,frameY=240;
  function accept(m) {
    if(Number.isFinite(m.x))x=clamp(m.x,639);
    if(Number.isFinite(m.y))y=clamp(m.y,479);
    b=(m.b|0)&3;if(Number.isFinite(m.wheel))wheel=m.wheel|0;
    if(typeof m.relative==='boolean' && relative!==m.relative){relative=m.relative;dx=dy=0;reset=true;}
    if(m.reset){reset=true;dx=dy=0;}
    if(relative){dx+=Number.isFinite(m.dx)?m.dx:0;dy+=Number.isFinite(m.dy)?m.dy:0;}
  }
  function beforeFrame() {
    const state=guest()?.inputState();
    frameX=relative?clamp((reset?320:state?.x ?? frameX)+dx,639):x;
    frameY=relative?clamp((reset?240:state?.y ?? frameY)+dy,479):y;
    dx=dy=0;reset=false;
    const hint=state?{capture:state.capture,game:state.game}: {capture:false,game:false};
    const key=JSON.stringify(hint);if(key!==lastHint){lastHint=key;onState(hint);}
  }
  function save() {return {x,y,b,wheel,dx,dy,relative,reset,frameX,frameY};}
  function restore(p) {({x,y,b,wheel,dx,dy,relative,reset,frameX,frameY}=p);lastHint='';}
  return {accept,beforeFrame,save,restore,afterFrame:()=>{},
    x:()=>BigInt(frameX),y:()=>BigInt(frameY),buttons:()=>BigInt(b),wheel:()=>BigInt(wheel)};
}
