// One input bridge for single-core, SMP BSP and inline hosts. Guest addresses
// come from class metadata, and locked movement starts at the guest's cursor
// so MsSet recentering by an unmodified game is honored on the next frame.
const POLLED_KEYS=[0x11,0x1e,0x1f,0x20,0x13,0x21,0x24,0x26,0x17,0x25,0x48,0x4b,0x4d,0x50];
const clamp=(n,max)=>Math.max(0,Math.min(max,Math.round(n)));
export function createGuestInput({guest,memory,base,onState=()=>{}}) {
  let x=320,y=240,b=0,wheel=0,dx=0,dy=0,relative=false,reset=true,held=null,lastHint='';
  let frameX=320,frameY=240;
  function accept(m) {
    if(Number.isFinite(m.x))x=clamp(m.x,639);
    if(Number.isFinite(m.y))y=clamp(m.y,479);
    b=(m.b|0)&3;if(Number.isFinite(m.wheel))wheel=m.wheel|0;
    if(typeof m.relative==='boolean' && relative!==m.relative){relative=m.relative;dx=dy=0;reset=true;}
    if(m.reset){reset=true;dx=dy=0;}
    if(relative){dx+=Number.isFinite(m.dx)?m.dx:0;dy+=Number.isFinite(m.dy)?m.dy:0;}
    if(Array.isArray(m.held))held=new Set(m.held);
  }
  function syncKeys(state) {
    if(!state?.down || !held)return;
    const mem=memory();if(!mem)return;
    const bytes=new Uint8Array(mem.buffer),start=base()+state.down;
    if(start<0 || start+32>bytes.length)return;
    const shared=typeof SharedArrayBuffer!=='undefined' && mem.buffer instanceof SharedArrayBuffer;
    for(const sc of POLLED_KEYS) {
      const at=start+(sc>>3),bit=1<<(sc&7);
      if(shared){if(held.has(sc))Atomics.or(bytes,at,bit);else Atomics.and(bytes,at,255^bit);}
      else if(held.has(sc))bytes[at]|=bit;else bytes[at]&=255^bit;
    }
  }
  function beforeFrame() {
    const state=guest()?.inputState();
    frameX=relative?clamp((reset?320:state?.x ?? frameX)+dx,639):x;
    frameY=relative?clamp((reset?240:state?.y ?? frameY)+dy,479):y;
    dx=dy=0;reset=false;syncKeys(state);
    const hint=state?{capture:state.capture,game:state.game}: {capture:false,game:false};
    const key=JSON.stringify(hint);if(key!==lastHint){lastHint=key;onState(hint);}
  }
  return {accept,beforeFrame,afterFrame:()=>syncKeys(guest()?.inputState()),
    x:()=>BigInt(frameX),y:()=>BigInt(frameY),buttons:()=>BigInt(b),wheel:()=>BigInt(wheel)};
}
