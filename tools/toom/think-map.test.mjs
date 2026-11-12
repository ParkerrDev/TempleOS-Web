import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {WadRead,MapRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=FreedoomRead(),lumps=WadRead(bytes),names=Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`),
  records=[];let controllers=0,secrets=0,sectors=0;
for(const name of names) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===name)),order=[],specials=[];let count=0;
  for(const [i,sector] of map.sectors.entries()) {
    const n=sector.special;let kind=0;
    if([1,2,3,4,8,12,13,17].includes(n))kind=3;
    else if([10,14].includes(n))kind=2;
    if(n===9)count++;
    if(kind)order.push(kind,i);
    specials.push(kind&&n!==4?0:n);
  }
  records.push(map.sectors.length,order.length/2,count,...specials,...order);
  controllers+=order.length/2;secrets+=count;sectors+=map.sectors.length;
}
const packed=Buffer.alloc(records.length*8);records.forEach((n,i)=>packed.writeBigInt64LE(BigInt(n),i*8));
const game=resolve(root,'games/Toom');
let source=ToomText();
source+=`
U8 *tm_thinkmap_names="${names.join('')}";
I64 tm_thinkmap_cnt=0,tm_thinkmap_secrets=0,tm_thinkmap_done=0;
U0 TmThinkMaps()
{
  I64 *body=FileRead("C:/ORACLE/THINKMAP.BIN"),*row=body,i,j,n,secrets,id;
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Actor *actor;
  Mover *mover;
  Light *light;
  Thinker *tmpq;
  U8 name[5];
  if (!body || !wad || !data) throw('Files');
  name[4]=0;
  for (i=0;i<36;i++) {
    MemCpy(name,tm_thinkmap_names+i*4,4); map=MapNew(wad,name);
    if (!map || map->sector_cnt!=row[0]) throw('Map');
    n=row[1]; secrets=row[2]; row+=3;
    world=WorldNew(map,data); WorldLoadThings(world);
    motion=MotionNew(world); sectors=SectorsNew(motion);
    specials=SpecialsNew(sectors); SpecialsInit(specials);
    if (world->total_secrets!=secrets) throw('Secrets');
    tm_thinkmap_secrets+=secrets;
    for (j=0;j<map->sector_cnt;j++)
      if (map->sector[j].special!=*row++) throw('Special');
    tmpq=world->thinkers.next; id=world->first;
    while (actor=WorldActorGet(world,id)) {
      if (tmpq!=&actor->thinker || tmpq->kind!=TM_THINK_ACTOR) throw('Actors');
      tmpq=tmpq->next; id=actor->tick_next;
    }
    for (j=0;j<n;j++,row+=2) {
      if (tmpq==&world->thinkers || tmpq->kind!=row[0]) throw('Kind');
      if (tmpq->kind==TM_THINK_MOVER) {
        mover=tmpq;
        if (mover->sector!=row[1]) throw('Door');
      } else {
        light=tmpq;
        if (light->sector!=row[1]) throw('Light');
      }
      if (tmpq->next->last!=tmpq || tmpq->last->next!=tmpq) throw('Links');
      tmpq=tmpq->next; tm_thinkmap_cnt++;
    }
    if (tmpq!=&world->thinkers) throw('Extra');
    SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
    WorldDel(world); MapDel(map);
  }
  GameDataDel(data); WadDel(wad); Free(body); tm_thinkmap_done=1;
  "THINKMAP %d CONTROLLERS %d SECRETS BAD 0\\n",tm_thinkmap_cnt,tm_thinkmap_secrets;
}
TmThinkMaps;
`;
const files=[{name:'THINKMAP.BIN',bytes:packed},{name:'FREEDOOM.WAD',bytes},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`THINKMAP ${controllers} CONTROLLERS ${secrets} SECRETS BAD 0`));
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
  for(const [name,n] of [['done',1],['cnt',controllers],['secrets',secrets]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_thinkmap_${name}`)),n);
  console.log(JSON.stringify({backend,maps:36,sectors,controllers,secrets,bad:0},null,2));
}
