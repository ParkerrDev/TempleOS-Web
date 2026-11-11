import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead,FixedSectorAt} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const defs=readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii'),constant=name=>Number(defs.match(new RegExp(`#define TM_${name}\\s+(\\d+)`))[1]);
const states=Array.from({length:967},(_,i)=>Array.from({length:7},(_,j)=>data.readInt32LE(32+i*28+j*4)));
const infos=Array.from({length:137},(_,i)=>Array.from({length:23},(_,j)=>data.readInt32LE(32+967*28+i*92+j*4)));
const random=data.subarray(data.length-256),records=[];
for(const lump of lumps)if(/^E[1-4]M[1-9]$/.test(lump.name)) {
  const map=MapRead(lumps,lumps.indexOf(lump));
  for(const skill of [0,2,4]) {
    let index=0,kills=0,items=0,player=0;const actors=[];
    const rand=()=>random[index=(index+1)&255];
    for(let i=0;i<map.things.length;i++) {
      const thing=map.things[i],isPlayer=thing[3]===1,bit=skill<2?1:skill===2?2:4;
      if(!isPlayer&&(!(thing[4]&bit)||thing[4]&16||[2,3,4,11].includes(thing[3])))continue;
      const type=isPlayer?constant('MT_PLAYER'):infos.findIndex(inf=>inf[0]===thing[3]);assert(type>=0,`${map.name}:${thing[3]}`);
      const info=infos[type],state=states[info[1]],lastlook=rand()&3;
      const x=thing[0]*65536,y=thing[1]*65536,sector=FixedSectorAt(map,x,y),s=map.sectors[sector];
      const z=(info[21]&constant('MF_SPAWNCEILING'))?s.ceil*65536-info[17]:s.floor*65536;
      let tics=state[2],flags=info[21];
      if(!isPlayer) {
        if(tics>0)tics=1+rand()%tics;
        if(thing[4]&8)flags|=constant('MF_AMBUSH');
        if(info[21]&constant('MF_COUNTKILL'))kills++;
        if(info[21]&constant('MF_COUNTITEM'))items++;
      }
      if(isPlayer)player=actors.length+1;
      actors.push([type,info[1],tics,state[0],state[1],info[2],flags,x,y,z,
        Math.imul(Math.trunc(thing[2]/45),0x20000000)>>>0,sector,skill===4?0:info[5],lastlook,
        isPlayer?-1:i,s.floor*65536,s.ceil*65536,info[16],info[17]]);
    }
    let hash=2166136261;
    for(const a of actors)for(const n of a)hash=Math.imul(hash^n,16777619)>>>0;
    records.push([actors.length,kills,items,index,hash,player]);
  }
}
const expected=Buffer.alloc(records.length*24);records.flat().forEach((n,i)=>expected.writeUInt32LE(n>>>0,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC','TmState.HC','TmWorld.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
I64 TmActorHash(I64 hash,Actor *tmpa)
{
  I64 i,values[19];
  values[0]=tmpa->type; values[1]=tmpa->state; values[2]=tmpa->tics;
  values[3]=tmpa->sprite; values[4]=tmpa->frame; values[5]=tmpa->health;
  values[6]=tmpa->flags; values[7]=tmpa->x; values[8]=tmpa->y; values[9]=tmpa->z;
  values[10]=tmpa->angle; values[11]=tmpa->sector; values[12]=tmpa->reaction;
  values[13]=tmpa->lastlook; values[14]=tmpa->spawn;
  values[15]=tmpa->floor; values[16]=tmpa->ceil;
  values[17]=tmpa->radius; values[18]=tmpa->height;
  for (i=0;i<19;i++) hash=(hash^values[i])*16777619&0xFFFFFFFF;
  return hash;
}
U0 TmLinksChk(World *tmpw)
{
  I64 i,n,id,prev,count=0;
  U8 *seen=CAlloc(tmpw->slot_cap);
  Actor *tmpa;
  for (i=0;i<tmpw->map->blockmap(U16 *)[2]*tmpw->map->blockmap(U16 *)[3];i++) {
    id=tmpw->blocks[i]; prev=0;
    while (id) {
      tmpa=WorldActorGet(tmpw,id,FALSE);
      if (!tmpa || tmpa->world!=tmpw || tmpa->block!=i || tmpa->block_last!=prev) throw('Link');
      n=id.u32[0]-1;
      if (seen[n]) throw('Dup');
      seen[n]=1;
      if (++count>tmpw->actor_cnt) throw('Cycle');
      prev=id; id=tmpa->block_next;
    }
  }
  for (i=0;i<tmpw->slot_cap;i++)
    if (tmpa=tmpw->slot[i].actor) {
      if (seen[i]!=(tmpa->block>=0)) throw('Missing');
      if (tmpa->flags&TM_MF_NOBLOCKMAP && tmpa->block>=0) throw('Effect');
    }
  id=tmpw->first; prev=0; count=0;
  while (id) {
    tmpa=WorldActorGet(tmpw,id,FALSE);
    if (!tmpa || tmpa->tick_last!=prev) throw('Thinker');
    if (++count>tmpw->actor_cnt) throw('Cycle');
    prev=id; id=tmpa->tick_next;
  }
  if (count!=tmpw->actor_cnt || tmpw->last!=prev) throw('Order');
  Free(seen);
}
U0 TmWorldTest()
{
  I64 i,j,k,n=0,hash,bad=0,total=0,id,newid,old_cap;
  F64 start=tS;
  U32 *expected=FileRead("C:/ORACLE/WORLDS.BIN");
  U8 name[9];
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Actor *tmpa,*keep;
  if (!wad || !data || !expected) throw('Files');
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",i/9+1,i%9+1); map=MapNew(wad,name);
    for (j=0;j<3;j++) {
      world=WorldNew(map,data,j*2); WorldLoadThings(world);
      hash=2166136261;
      for (k=0;k<world->slot_cap;k++)
        if (tmpa=world->slot[k].actor) hash=TmActorHash(hash,tmpa);
      if (world->actor_cnt!=expected[n] || world->total_kills!=expected[n+1] ||
            world->total_items!=expected[n+2] || world->random!=expected[n+3] ||
            hash!=expected[n+4] || world->player.u32[0]!=expected[n+5]) {
        if (bad<8) "%s SKILL %d COUNT %d/%d HASH %d/%d RANDOM %d/%d\\n",
              name,j*2,world->actor_cnt,expected[n],hash,expected[n+4],world->random,expected[n+3];
        bad++;
      }
      total+=world->actor_cnt; n+=6;
      TmLinksChk(world);
      if (!i && !j) {
        keep=WorldActorGet(world,world->player); id=keep->id; old_cap=world->slot_cap;
        for (k=0;k<old_cap+1;k++) WorldSpawn(world,TM_MT_PUFF,keep->x,keep->y);
        if (world->slot_cap<=old_cap || WorldActorGet(world,id)!=keep) throw('Growth');
        TmLinksChk(world);
        keep->active=FALSE;
        if (WorldActorGet(world,id) || WorldActorGet(world,id,FALSE)!=keep) throw('Active');
        WorldSweep(world);
        if (WorldActorGet(world,id,FALSE)) throw('Stale');
        tmpa=WorldSpawn(world,TM_MT_PLAYER,0,0);
        newid=tmpa->id;
        if (world->last!=newid) throw('Append');
        if (newid==id || newid.u32[0]!=id.u32[0] || WorldActorGet(world,id,FALSE)) throw('Reuse');
        WorldActorUnlink(world,tmpa);
        tmpa->x=map->blockmap[0]*65536-1000*65536;
        WorldActorLink(world,tmpa);
        if (tmpa->block!=-1) throw('Outside');
        WorldActorUnlink(world,tmpa); tmpa->x=0; tmpa->y=0; WorldActorLink(world,tmpa);
        TmLinksChk(world);
        if (WorldActorGet(world,0) || WorldActorGet(world,I64_MAX)) throw('Handle');
      }
      WorldDel(world);
    }
    MapDel(map);
  }
  "WORLDS 108 ACTORS %d BAD %d MS %.1f\\n",total,bad,(tS-start)*1000;
  WadDel(wad); GameDataDel(data); Free(expected);
  if (bad) throw('Spawn');
}
TmWorldTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'TMDATA.BIN',bytes:data},{name:'WORLDS.BIN',bytes:expected}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/WORLDS 108 ACTORS \d+ BAD 0/);
