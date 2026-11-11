import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),defs=readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii');
const constant=n=>Number(defs.match(new RegExp(`#define TM_${n}\\s+(\\d+)`))[1]);
const F=n=>constant(`MF_${n}`),T=n=>constant(`MT_${n}`),records=[];
const roles=[[0,T('PLAYER')],[F('PICKUP'),T('PLAYER')],[F('MISSILE'),T('ROCKET')],
  [F('SKULLFLY'),T('SKULL')],[F('SKULLFLY')|F('MISSILE'),T('SKULL')]];
const targets=[0,F('SOLID'),F('SPECIAL'),F('SPECIAL')|F('SOLID'),F('SHOOTABLE'),
  F('SHOOTABLE')|F('SOLID'),F('SPECIAL')|F('SHOOTABLE')];
const outcomes=[[0,1,0,1,0,1,0],[0,1,2,2,0,1,2],[0,1,0,1,3,3,3],
  [0,4,4,4,4,4,4],[0,4,4,4,4,4,4]];
for(let r=0;r<roles.length;r++)for(let t=0;t<targets.length;t++) {
  for(const [dx,dy,inside]of[[0,0,true],[36*65536,0,false],[36*65536-1,0,true],
      [0,36*65536,false],[0,36*65536-1,true]])
    for(const [mz,oz,overlap]of[[0,0,true],[65*65536,0,false],[64*65536,0,true],
        [0,57*65536,false],[0,56*65536,true]])
      for(const active of [0,1]) {
        let answer=active&&inside?outcomes[r][t]:0;
        if(r===2&&!overlap)answer=0;
        records.push([roles[r][0],targets[t],dx,dy,mz,oz,roles[r][1],T('TROOP'),T('PLAYER'),1,active,answer]);
      }
}
for(const [other,source,mode,answer]of[
  ['TROOP','TROOP',1,1],['BRUISER','KNIGHT',1,1],['KNIGHT','BRUISER',1,1],
  ['PLAYER','PLAYER',1,3],['TROOP','TROOP',2,0],['TROOP','TROOP',3,3]])
  records.push([F('MISSILE'),F('SHOOTABLE'),0,0,0,0,T('ROCKET'),T(other),T(source),mode,1,answer]);
const map=MapRead(lumps,lumps.findIndex(l=>l.name==='E1M1')),block=lumps[map.index+10].bytes;
const ox=block.readInt16LE(0),oy=block.readInt16LE(2),width=block.readUInt16LE(4),height=block.readUInt16LE(6);
assert(width>=5&&height>=4);
let rng=0x31415926;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
const bodies=[[(ox+389)*65536,(oy+256)*65536,128*65536,1]];
for(let i=1;i<256;i++)bodies.push([(ox+64+next()%(width*128-128))*65536,
  (oy+64+next()%(height*128-128))*65536,[8,16,20,32,64,128][next()%6]*65536,i%5?1:0]);
const queries=[[(ox+251)*65536,(oy+256)*65536]];
for(let i=1;i<1024;i++)queries.push([(ox+next()%(width*128))*65536+32767,
  (oy+next()%(height*128))*65536-32767]);
for(const q of queries)q.push(Number(!bodies.some(([x,y,r,active])=>active&&Math.abs(x-q[0])<r+16*65536&&Math.abs(y-q[1])<r+16*65536)));
assert.equal(queries[0][2],0,'Large-radius actor must be found across two block cells.');
const pack=values=>{const b=Buffer.alloc(values.length*8);values.forEach((n,i)=>b.writeBigInt64LE(BigInt(n),i*8));return b;};
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC','TmState.HC','TmWorld.HC','TmContact.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
I64 tm_touches;
U0 TmTouch(Actor *mover,Actor *other,I64 kind)
{
  if (mover->world!=other->world || kind!=TM_CONTACT_PICKUP) throw('Touch');
  tm_touches++;
  other->active=FALSE;
}
U0 TmContactTest()
{
  I64 i,got,bad=0,id,x,y,type,*q,*cases=FileRead("C:/ORACLE/CASES.BIN"),
        *bodies=FileRead("C:/ORACLE/BODIES.BIN"),*queries=FileRead("C:/ORACLE/QUERIES.BIN");
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=MapNew(wad,"E1M1");
  World *world=WorldNew(map,data);
  Actor *mover=WorldSpawn(world,TM_MT_PLAYER,0,0),
        *other=WorldSpawn(world,TM_MT_TROOP,0,0),
        *origin=WorldSpawn(world,TM_MT_PLAYER,0,0);
  Line *line;
  if (!cases || !bodies || !queries) throw('Files');
  mover->radius=16*65536; mover->height=56*65536;
  other->radius=20*65536; other->height=64*65536;
  for (i=0;i<${records.length};i++) {
    q=cases+i*12;
    mover->flags=q[0]; other->flags=q[1]; other->x=q[2]; other->y=q[3];
    mover->z=q[4]; other->z=q[5]; mover->type=q[6]; other->type=q[7];
    origin->type=q[8]; origin->active=q[9]!=3;
    mover->target=origin->id;
    if (q[9]==2) mover->target=other->id;
    other->active=q[10];
    got=WorldContactKind(world,mover,other,0,0);
    if (got!=q[11]) {
      if (bad<8) "CASE %d GOT %d/%d\\n",i,got,q[11];
      bad++;
    }
  }
  if (WorldContactKind(world,mover,mover,0,0)) throw('Self');
  WorldDel(world); world=WorldNew(map,data);
  for (i=0;i<256;i++) {
    q=bodies+i*4; type=TM_MT_TROOP;
    if (!i) type=TM_MT_SPIDER;
    other=WorldSpawn(world,type,q[0],q[1]);
    WorldActorUnlink(world,other);
    other->radius=q[2]; other->flags=TM_MF_SOLID; other->active=q[3];
    WorldActorLink(world,other);
  }
  mover=WorldSpawn(world,TM_MT_PLAYER,0,0); mover->flags=0;
  for (i=0;i<1024;i++) {
    q=queries+i*3;
    got=WorldContacts(world,mover,q[0],q[1]);
    if (got!=q[2]) {
      if (bad<8) "GRID %d GOT %d/%d\\n",i,got,q[2];
      bad++;
    }
  }
  WorldDel(world); world=WorldNew(map,data);
  i=0;
  while (i<map->line_cnt && map->line[i].side[1]!=0xFFFF) i++;
  if (i==map->line_cnt) throw('Wall');
  line=map->line+i;
  x=(map->vertex[line->v1].x+map->vertex[line->v2].x)*32768;
  y=(map->vertex[line->v1].y+map->vertex[line->v2].y)*32768;
  mover=WorldSpawn(world,TM_MT_PLAYER,x,y);
  other=WorldSpawn(world,TM_MT_CLIP,x,y); other->flags=TM_MF_SPECIAL|TM_MF_SOLID;
  id=other->id; tm_touches=0;
  if (WorldContacts(world,mover,x,y,&TmTouch) || tm_touches!=1 || other->active ||
        world->hit_actor!=id) throw('Solid');
  if (!WorldContacts(world,mover,x,y,&TmTouch) || tm_touches!=1) throw('Inactive');
  WorldSweep(world);
  if (WorldActorGet(world,id,FALSE)) throw('Sweep');
  other=WorldSpawn(world,TM_MT_CLIP,x,y); other->flags=TM_MF_SPECIAL;
  if (WorldPosition(world,mover,x,y,&TmTouch) || tm_touches!=2 ||
        other->active || world->collision->blocking<0) throw('Order');
  other->active=TRUE; mover->flags|=TM_MF_NOCLIP;
  if (!WorldPosition(world,mover,x,y,&TmTouch) || tm_touches!=2 || !other->active)
    throw('NoClip');
  "CONTACTS ${records.length} GRID 1024 BAD %d\\n",bad;
  WorldDel(world); MapDel(map); GameDataDel(data); WadDel(wad);
  Free(cases); Free(bodies); Free(queries);
  if (bad) throw('Contacts');
}
TmContactTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))},
  {name:'CASES.BIN',bytes:pack(records.flat())},{name:'BODIES.BIN',bytes:pack(bodies.flat())},
  {name:'QUERIES.BIN',bytes:pack(queries.flat())}],timeout:180});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/CONTACTS \d+ GRID 1024 BAD 0/);
