import {CTRL} from '../holyc-wasm/src/runtime/protocol.js';

// Keep short clicks visible through a complete input iteration. Polls within
// that iteration must not consume the edge before the game reads ms.lb/ms.rb.
export function createMouseButtons(ctrl){
  let pressed=0,revision=Atomics.load(ctrl,CTRL.INPUT_RESET);
  function resetIfNeeded(){
    const next=Atomics.load(ctrl,CTRL.INPUT_RESET);
    if(next!==revision){revision=next;pressed=0;}
  }
  return {
    sample(){
      resetIfNeeded();
      return pressed|Atomics.load(ctrl,CTRL.MS_PRESSED)|
        (Atomics.load(ctrl,CTRL.MS_LB)?1:0)|(Atomics.load(ctrl,CTRL.MS_RB)?2:0);
    },
    advance(){resetIfNeeded();pressed=Atomics.exchange(ctrl,CTRL.MS_PRESSED,0);},
  };
}
