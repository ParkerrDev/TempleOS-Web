import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead,FixedSectorAt} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=FreedoomRead(),lumps=WadRead(bytes),names=Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`);
// Tags and specials are unsigned words; light remains signed.
const fixture=lumps.slice(),sectorIndex=lumps.findIndex(l=>l.name==='E1M1')+8;
fixture[sectorIndex]={...fixture[sectorIndex],bytes:Buffer.from(fixture[sectorIndex].bytes)};
fixture[sectorIndex].bytes.writeUInt16LE(0xabcd,24);
fixture[sectorIndex].bytes.writeUInt16LE(0xf000,22);
fixture[sectorIndex].bytes.writeInt16LE(-1,20);
const sector=MapRead(fixture,sectorIndex-8).sectors[0];
assert.equal(sector.tag,0xabcd);assert.equal(sector.special,0xf000);assert.equal(sector.light,-1);
const records=[];let total=0,missing=0;
for(const name of names) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===name));
  const destinations=map.things.map((t,i)=>({t,i,sector:FixedSectorAt(map,t[0]*65536,t[1]*65536)}))
    .filter(({t})=>t[3]===14&&(t[4]&2)&&!(t[4]&16)).sort((a,b)=>a.sector-b.sector||a.i-b.i);
  const lines=map.lines.map((line,i)=>({line,i})).filter(({line})=>[39,97,125,126].includes(line[3]));
  records.push(lines.length);
  for(const {line,i} of lines) {
    const dest=destinations.find(d=>map.sectors[d.sector].tag===line[4]);
    records.push(i,dest?.i??-1,dest?.sector??-1);total++;if(!dest)missing++;
  }
}
assert(total>0);
const packed=Buffer.alloc(records.length*8);records.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC',
  'TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmDamage.HC','TmTeleport.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
U8 *tm_telemap_names="${names.join('')}";
I64 tm_telemap_cnt=0,tm_telemap_missing=0,tm_telemap_done=0;
U0 TmTeleportMaps()
{
  I64 *body=FileRead("C:/ORACLE/TELEMAP.BIN"),*row=body,i,j,n,angle,before,random;
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  U8 name[5];
  Map *map;
  World *world;
  Motion *motion;
  Actor *actor,*fog,*old_fog;
  Thing *dest;
  Player player;
  Bool result;
  if (!body || !wad || !data) throw('Files');
  name[4]=0;
  for (i=0;i<36;i++) {
    MemCpy(name,tm_telemap_names+i*4,4); map=MapNew(wad,name);
    if (!map) throw('Map');
    world=WorldNew(map,data); WorldLoadThings(world);
    MemSet(&player,0,sizeof(Player)); player.view_height=41*65536;
    motion=MotionNew(world,&player); actor=WorldActorGet(world,world->player);
    if (!actor) throw('Player');
    n=*row++;
    for (j=0;j<n;j++,row+=3) {
      before=world->actor_cnt; random=world->random;
      result=ActorTeleport(motion,actor,row[0],0);
      if (row[1]<0) {
        if (result || world->actor_cnt!=before || world->random!=random)
          throw('Missing');
        tm_telemap_missing++;
      } else {
        dest=map->thing+row[1]; angle=536870912*(dest->angle/45)&0xFFFFFFFF;
        if (!result || actor->x!=dest->x*65536 || actor->y!=dest->y*65536 ||
              actor->sector!=row[2] || actor->angle!=angle ||
              actor->z!=map->sector[row[2]].floor || actor->reaction!=18 ||
              player.view_z!=actor->z+41*65536) {
          "TELEPORT MAP %s LINE %d THING %d RESULT %d\\n",name,row[0],row[1],result;
          throw('Dest');
        }
        fog=WorldActorGet(world,world->last); old_fog=WorldActorGet(world,fog->tick_last);
        if (fog->type!=TM_MT_TFOG || old_fog->type!=TM_MT_TFOG) throw('Fog');
        WorldRemove(world,fog); WorldRemove(world,old_fog);
      }
      tm_telemap_cnt++;
    }
    MotionDel(motion); WorldDel(world); MapDel(map);
  }
  Free(body); GameDataDel(data); WadDel(wad); tm_telemap_done=1;
  "TELEMAP %d LINES MISSING %d BAD 0\\n",tm_telemap_cnt,tm_telemap_missing;
}
TmTeleportMaps;
`;
const files=[{name:'FREEDOOM.WAD',bytes},{name:'TELEMAP.BIN',bytes:packed},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`TELEMAP ${total} LINES MISSING ${missing} BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  await h.Exec(source);
  for(const [name,n] of [['done',1],['cnt',total],['missing',missing]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_telemap_${name}`)),n);
  console.log(JSON.stringify({backend,maps:36,lines:total,missing,bad:0},null,2));
}
