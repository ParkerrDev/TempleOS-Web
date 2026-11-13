import assert from "node:assert/strict";

//ACMove.HC's steps, as [col,row] of the AutoComplete window: its list, the
//drag, the list again, StandBy, the Ctrl-Alt key map, the list again, and the
//list of an AutoComplete turned off and on.
export const AC_MOVE_STEPS=7;
const LIST=[51,13],KEYS=[27,3],DRAGGED=[20,30];

export function AcMoveAssert(original,patched) {
  assert.deepEqual(original,[LIST,DRAGGED,LIST,LIST,KEYS,LIST,LIST],
    "the stock routines put a dragged window back at its spot with each list");
  assert.deepEqual(patched,[LIST,DRAGGED,DRAGGED,DRAGGED,KEYS,DRAGGED,DRAGGED],
    "the corrected window stays where it was dragged, and the key map keeps its own spot");
}

export function AcMoveRead(gx) {//ac_move_res, after ACMoveCheck.
  const res=gx.varFind("ac_move_res");
  return Array.from({length:AC_MOVE_STEPS},(_,i)=>[Number(gx.rd64(res+i*16)),Number(gx.rd64(res+i*16+8))]);
}
