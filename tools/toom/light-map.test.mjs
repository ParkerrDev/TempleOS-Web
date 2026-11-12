import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {WadRead,MapRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=FreedoomRead(),lumps=WadRead(bytes),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),
  randomTable=data.subarray(-256),names=Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`);
const records=[];let lights=0,sectors=0;
for(const [index,name] of names.entries()) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===name)),neighbors=map.sectors.map(()=>new Set());
  for(const line of map.lines)if((line[2]&4)&&line[6]!==65535) {
    const a=map.sides[line[5]].sector,b=map.sides[line[6]].sector;
    if(a!==b){neighbors[a].add(b);neighbors[b].add(a);}
  }
  let random=index*7&255;const rnd=()=>randomTable[random=(random+1)&255],rows=[],specials=[];
  for(const [i,sector] of map.sectors.entries()) {
    const special=sector.special,high=sector.light;
    let low=Math.min(high,...[...neighbors[i]].map(n=>map.sectors[n].light)),kind=-1,tics=0,dark=0;
    if(special===1){kind=0;tics=(rnd()&64)+1;}
    else if([2,3,4,12,13].includes(special)) {
      kind=1;if(low===high)low=0;dark=[2,4,13].includes(special)?15:35;tics=special>=12?1:(rnd()&7)+1;
    } else if(special===8)kind=2;
    else if(special===17){kind=3;low+=16;tics=4;}
    specials.push(kind<0||special===4?special:0);
    if(kind>=0)rows.push(i,kind,low,high,tics,dark,-1);
  }
  records.push(map.sectors.length,rows.length/7,random,...specials,...rows);
  lights+=rows.length/7;sectors+=map.sectors.length;
}
const packed=Buffer.alloc(records.length*8);records.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
let source=ToomText();
source+=`
U8 *tm_lightmap_names="${names.join('')}";
I64 tm_lightmap_cnt=0,tm_lightmap_sectors=0,tm_lightmap_done=0;
U0 TmLightMaps()
{
  I64 *body=FileRead("C:/ORACLE/LIGHTMAP.BIN"),*row=body,i,j,n,random;
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Lights *lights;
  Light *light;
  U8 name[5];
  if (!body || !wad || !data) throw('Files');
  name[4]=0;
  for (i=0;i<36;i++) {
    MemCpy(name,tm_lightmap_names+i*4,4); map=MapNew(wad,name);
    if (!map || map->sector_cnt!=row[0]) throw('Map');
    n=row[1]; random=row[2]; row+=3;
    world=WorldNew(map,data); world->random=i*7&255;
    motion=MotionNew(world); sectors=SectorsNew(motion); lights=LightsNew(sectors);
    LightsInit(lights);
    if (world->random!=random) throw('Random');
    for (j=0;j<map->sector_cnt;j++)
      if (map->sector[j].special!=*row++) throw('Special');
    tm_lightmap_sectors+=map->sector_cnt;
    light=lights->first;
    for (j=0;j<n;j++,row+=7) {
      if (!light || light->sector!=row[0] || light->kind!=row[1] ||
            light->low!=row[2] || light->high!=row[3] ||
            light->tics!=row[4] || light->dark!=row[5] ||
            light->direction!=row[6]) throw('Light');
      light=light->next; tm_lightmap_cnt++;
    }
    if (light) throw('Extra');
    LightsDel(lights); SectorsDel(sectors); MotionDel(motion);
    WorldDel(world); MapDel(map);
  }
  Free(body); GameDataDel(data); WadDel(wad); tm_lightmap_done=1;
  "LIGHTMAP %d LIGHTS %d SECTORS BAD 0\\n",tm_lightmap_cnt,tm_lightmap_sectors;
}
TmLightMaps;
`;
const files=[{name:'FREEDOOM.WAD',bytes},{name:'TMDATA.BIN',bytes:data},{name:'LIGHTMAP.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`LIGHTMAP ${lights} LIGHTS ${sectors} SECTORS BAD 0`));
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
  for(const [name,n] of [['done',1],['cnt',lights],['sectors',sectors]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_lightmap_${name}`)),n);
  console.log(JSON.stringify({backend,maps:36,lights,sectors,bad:0},null,2));
}
