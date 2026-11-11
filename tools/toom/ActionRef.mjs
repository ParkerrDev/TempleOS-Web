import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

const simple=['EnemyLook','EnemyChase','EnemyFace','EnemyVileChase','EnemyVileStart','EnemyVileTarget',
  'EnemyVileAttack','EnemyWhoosh','EnemySkelFist','EnemySkelMissile','EnemyFatRaise','EnemyTroop',
  'EnemySarg','EnemyHead','EnemyBruis','EnemySkull','EnemyPainAttack','EnemyPainDie'];
export const ActionBindings={...Object.fromEntries(simple.map(n=>[n,'TmAction'+n])),
  EnemyEffect:'TmActionEffect',EnemyShot:'TmActionShot',EnemyFire:'TmActionFire',EnemyTracer:'TmActionTracer',
  EnemyFatAttack:'TmActionFat',EnemyRefire:'TmActionRefire',EnemyLaunch:'TmActionLaunch',
  BossDeath:'TmActionBoss',BossKeen:'TmActionKeen',BossFinal:'TmActionFinal',BrainAwake:'TmActionAwake',
  BrainSpit:'TmActionSpit',BrainSpawn:'TmActionSpawn'};

export async function ActionReference() {
  const game=resolve(root,'games/Toom'),dir=resolve(root,'tools/toom/source'),
    manifest=JSON.parse(readFileSync(resolve(dir,'source.json'))),file=manifest.files.find(f=>f.path.endsWith('/info.c')),
    bytes=readFileSync(resolve(dir,'info.c')),meta=JSON.parse(readFileSync(resolve(game,'data.json'))),
    data=readFileSync(resolve(game,'TMDATA.BIN')),original=await EnemySource();
  assert(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  assert.equal(createHash('sha256').update(data).digest('hex'),meta.sha256);
  const text=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),
    body=text.match(/states\[NUMSTATES\]\s*=\s*\{([\s\S]*?)\};/)[1],names=['NULL'];
  for(const m of body.matchAll(/\{[^{}]+,\{(\w+)\},[^{}]+\}/g))if(!names.includes(m[1]))names.push(m[1]);
  assert.deepEqual(names,meta.actions);
  const defs=Object.fromEntries([...readFileSync(resolve(game,'TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),reachable=new Set(),seen=new Set();
  function visit(state) {while(!seen.has(state)){seen.add(state);reachable.add(data.readInt32LE(32+state*28+12));state=data.readInt32LE(32+state*28+16);}}
  for(let actor=0;actor<137;actor++)for(const field of [1,3,7,10,11,12,13,22])visit(data.readInt32LE(32+967*28+actor*92+field*4));
  assert.match(EnemyFunction(original,'A_BrainScream'),/P_SetMobjState\s*\(\s*th\s*,\s*S_BRAINEXPLODE1\s*\)/);
  visit(defs.TM_S_BRAINEXPLODE1);
  const ids=[...reachable].sort((a,b)=>a-b);assert.deepEqual(ids,[0,...Array.from({length:52},(_,i)=>23+i)]);
  const scalar=new Map();
  for(const name of ['A_CPosRefire','A_SpidRefire']) {
    const value=EnemyFunction(original,name).match(/P_Random\s*\(\s*\)\s*<\s*(\d+)/);assert(value);
    scalar.set(names.indexOf(name),Number(value[1]));
  }
  for(const name of ['A_BspiAttack','A_CyberAttack']) {
    const value=EnemyFunction(original,name).match(/P_SpawnMissile\s*\(\s*actor\s*,\s*actor->target\s*,\s*(MT_\w+)\s*\)/);assert(value);
    assert(defs['TM_'+value[1]]);scalar.set(names.indexOf(name),defs['TM_'+value[1]]);
  }
  const effects=['BFGSpray','Explode','Pain','PlayerScream','Fall','XScream','Scream','Metal','BabyMetal','Hoof'].map(n=>names.indexOf('A_'+n));
  assert(effects.every(n=>n>0));
  const rows=[];
  for(const n of ids)for(const world of [0,1])for(const clock of [0,1,4,999,0x7fffffff]) {
    const args=[-1,-1,-1];
    if(effects.includes(n))args[0]=world;
    if(scalar.has(n))args[0]=scalar.get(n);
    if(names[n]==='A_Tracer')args[0]=clock;
    if(names[n]==='A_BossDeath')args.splice(0,3,world+1,world+6,world);
    rows.push([n,world,clock,1,...args]);
  }
  return {rows,source:{info:file.sha256,actions:ids.map(n=>names[n]),states:seen.size}};
}
