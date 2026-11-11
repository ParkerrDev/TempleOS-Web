import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,
  'tests/oracle/Qemu.mjs')));
const data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const meta=JSON.parse(readFileSync(resolve(root,'games/Toom/data.json')));
assert.equal(createHash('sha256').update(data).digest('hex'),meta.sha256);
const states=Array.from({length:meta.states},(_,i)=>Array.from({length:7},(_,j)=>
  data.readInt32LE(32+(i*7+j)*4)));
for (const {frame,to} of meta.freedoomFrameChanges)assert.equal(states[frame][1],to);
const expected=Buffer.alloc(meta.states*16);
for (let first=0;first<states.length;first++) {
  let current=first,tics=0,actions=0,hash=0,active=true;
  const enter=()=>{
    let count=0;
    while (current) {
      assert(++count<=states.length,'Zero-tic state cycle');
      const state=states[current];tics=state[2];
      if (state[3]) {actions++;hash=(Math.imul(hash,33)+state[3])>>>0;}
      if (tics) return;
      current=state[4];
    }
    active=false;
  };
  enter();
  for (let tic=0;tic<120;tic++)if(active&&tics!==-1&&!--tics) {
    current=states[current][4];enter();
  }
  [current,tics,actions,hash].forEach((value,i)=>expected.writeUInt32LE(value>>>0,first*16+i*4));
}
const invalid=Buffer.from(data);invalid.writeUInt32LE(0xFFFFFFFF,32+16);
let source=['TmData.HH','TmState.HC']
  .map(name=>readFileSync(resolve(root,'games/Toom',name),'latin1')).join('\n');
source+=`
I64 tm_actions,tm_hash;
U0 TmAction(Actor *tmpa,I64 n)
{
  if (!tmpa->active) throw('Action');
  tm_actions++;
  tm_hash=(tm_hash*33+n)&0xFFFFFFFF;
}
U0 TmStateTest()
{
  I64 i,j,bad=0,rng=0,hash=0;
  I32 *expected=FileRead("C:/ORACLE/STATES.BIN");
  U8 *random;
  GameData *tmpd=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Actor *tmpa=CAlloc(sizeof(Actor));
  if (!tmpd || !expected) throw('Files');
  for (i=0;i<TM_STATE_NUM;i++) {
    MemSet(tmpa,0,sizeof(Actor));
    tmpa->active=TRUE;
    tm_actions=0; tm_hash=0;
    ActorState(tmpd,tmpa,i,&TmAction);
    for (j=0;j<120;j++) ActorTick(tmpd,tmpa,&TmAction);
    if (tmpa->state!=expected[i*4] || tmpa->tics!=expected[i*4+1] ||
        tm_actions!=expected[i*4+2] || tm_hash!=expected(U32 *)[i*4+3])
      bad++;
  }
  random=tmpd->random;
  for (i=0;i<768;i++) {
    j=GameRand(tmpd,&rng);
    if (j!=random[(i+1)&255]) throw('Random');
    hash=(hash*33+j)&0xFFFFFFFF;
  }
  if (rng) throw('Wrap');
  if (GameDataNew("C:/ORACLE/BAD.BIN")) throw('Invalid');
  "STATES %d TICS %d BAD %d RANDOM %d\\n",TM_STATE_NUM,
        TM_STATE_NUM*120,bad,hash;
  GameDataDel(tmpd);
  Free(tmpa);
  Free(expected);
  if (bad) throw('States');
}
TmStateTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'TMDATA.BIN',bytes:data},{name:'STATES.BIN',bytes:expected},
  {name:'BAD.BIN',bytes:invalid}],timeout:120});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/STATES 967 TICS 116040 BAD 0/);
