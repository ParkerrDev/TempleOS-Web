import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=FreedoomRead(),lumps=WadRead(bytes),names=process.env.MAP?[process.env.MAP]:
  Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`);
assert(names.every(name=>/^E[1-4]M[1-9]$/.test(name)));
let random=0x7184AB33;const next=()=>random=(Math.imul(random,1664525)+1013904223)>>>0;
const side=([x,y,dx,dy],px,py)=>{
  if(!dx)return px<=x?Number(dy>0n):Number(dy<0n);
  if(!dy)return py<=y?Number(dx<0n):Number(dx>0n);
  return Number(dx*(py-y)>=dy*(px-x));
};
function hits(map,ray,actors=[]) {
  const [x,y,x2,y2]=ray.map(BigInt),dx=x2-x,dy=y2-y,trace=[x,y,dx,dy],out=[];
  if(!dx&&!dy)return out;
  function segment(ax,ay,bx,by,line,actor=0) {
    [ax,ay,bx,by]=[ax,ay,bx,by].map(BigInt);
    if(side(trace,ax,ay)===side(trace,bx,by))return;
    const lx=bx-ax,ly=by-ay;let den=dx*ly-dy*lx,num=(ax-x)*ly-(ay-y)*lx;
    if(den<0n){den=-den;num=-num;}
    if(den&&num>=0n&&num<=den)out.push([Number((num<<16n)/den),line,actor]);
  }
  map.lines.forEach((line,i)=>{
    const a=map.vertices[line[0]],b=map.vertices[line[1]];
    segment(a[0]*65536,a[1]*65536,b[0]*65536,b[1]*65536,i);
  });
  actors.forEach(([ax,ay,r,active,linked],i)=>{
    if(!active||!linked)return;
    const positive=(dx<0n)===(dy<0n);
    segment(ax-r,ay+(positive?r:-r),ax+r,ay+(positive?-r:r),-1,0x100000001+i);
  });
  out.sort((a,b)=>a[0]-b[0]||((a[1]<0?map.lines.length+a[2]%0x100000000:a[1])-
    (b[1]<0?map.lines.length+b[2]%0x100000000:b[1])));
  return out;
}
function rayRecords(map,rays,actors=[]) {
  const records=[rays.length];
  for(const ray of rays){const expected=hits(map,ray,actors);records.push(...ray,expected.length,...expected.flat());}
  return records;
}
const records=[],counts=[];
for(const name of names) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===name)),block=lumps[map.index+10].bytes,
    ox=block.readInt16LE(0),oy=block.readInt16LE(2),w=block.readUInt16LE(4),h=block.readUInt16LE(6);
  const rays=[];
  for(let i=0;i<48;i++) {
    const a=map.vertices[next()%map.vertices.length],b=map.vertices[next()%map.vertices.length];
    rays.push([a[0]*65536+(next()&65535),a[1]*65536+(next()&65535),
      b[0]*65536+(next()&65535),b[1]*65536+(next()&65535)]);
  }
  for(let i=0;i<40;i++) {
    const x=(ox+(next()%w)*128)*65536,y=(oy+(next()%h)*128)*65536;
    const [dx,dy]=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]][i%8];
    rays.push([x,y,x+dx*(128+(next()%1024))*65536,y+dy*(128+(next()%1024))*65536]);
  }
  for(let i=0;i<32;i++) {
    const line=map.lines[next()%map.lines.length],a=map.vertices[line[0]],b=map.vertices[line[1]];
    rays.push([a[0]*65536,a[1]*65536,b[0]*65536+(i&1),b[1]*65536+(i&2)]);
  }
  const a=map.vertices[0];
  rays.push([-32767*65536,a[1]*65536,32767*65536,a[1]*65536],
    [a[0]*65536,-32767*65536,a[0]*65536,32767*65536],
    [-32767*65536,-32767*65536,32767*65536,32767*65536],
    [-32767*65536,32767*65536,32767*65536,-32767*65536],
    [a[0]*65536,a[1]*65536,a[0]*65536,a[1]*65536]);
  records.push(...rayRecords(map,rays));counts.push(rays.length);
}
const actorMap=MapRead(lumps,lumps.findIndex(l=>l.name==='E1M1')),block=lumps[actorMap.index+10].bytes,
  ox=block.readInt16LE(0),oy=block.readInt16LE(2),w=block.readUInt16LE(4),h=block.readUInt16LE(6),actors=[];
for(let i=0;i<256;i++)actors.push([(ox+32+next()%(w*128-64))*65536,
  (oy+32+next()%(h*128-64))*65536,[8,16,20,32,64,128][next()%6]*65536,i%7?1:0,i%9?1:0]);
actors[0]=[(ox+389)*65536,(oy+256)*65536,128*65536,1,1];
const rays=[[(ox+270)*65536,(oy+128)*65536,(ox+270)*65536,(oy+512)*65536]];
const tieLine=actorMap.lines.findIndex(l=>l[0]!==l[1]),tieA=actorMap.vertices[actorMap.lines[tieLine][0]],
  tieB=actorMap.vertices[actorMap.lines[tieLine][1]],mx=(tieA[0]+tieB[0])*32768,my=(tieA[1]+tieB[1])*32768,
  vx=Math.sign(tieB[1]-tieA[1])*64*65536,vy=-Math.sign(tieB[0]-tieA[0])*64*65536;
actors[1]=[mx,my,20*65536,1,1];rays.push([mx-vx,my-vy,mx+vx,my+vy]);
for(let i=0;i<510;i++)rays.push([(ox+next()%(w*128))*65536,(oy+next()%(h*128))*65536,
  (ox+next()%(w*128))*65536,(oy+next()%(h*128))*65536]);
assert(hits(actorMap,rays[0],actors).some(h=>h[2]===0x100000001),'Large actor crosses the neighboring block.');
const tied=hits(actorMap,rays[1],actors),wallAt=tied.findIndex(h=>h[0]===32768&&h[1]===tieLine),
  actorAt=tied.findIndex(h=>h[0]===32768&&h[2]===0x100000002);
assert(wallAt>=0&&actorAt>wallAt,'An exact wall/actor tie must visit the wall first.');
const pack=values=>{const b=Buffer.alloc(values.length*8);values.forEach((v,i)=>b.writeBigInt64LE(BigInt(v),i*8));return b;};
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmPath.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
U8 *tm_names="${names.join('')}";
I64 tm_path_cnt,tm_path_bad;
F64 tm_path_time;
I64 *TmPathCases(Path *path,I64 *data,I64 flags)
{
  I64 i,j,n=*data++,count;
  F64 start=tS;
  for (i=0;i<n;i++) {
    count=data[4];
    if (!PathRun(path,data[0],data[1],data[2],data[3],flags)) throw('Range');
    if (path->cnt!=count) {
      if (tm_path_bad<8) "COUNT %d %d/%d\\n",tm_path_cnt,path->cnt,count;
      tm_path_bad++;
    } else for (j=0;j<count;j++)
      if (path->hit[j].fraction!=data[5+j*3] || path->hit[j].line!=data[6+j*3] ||
            path->hit[j].actor!=data[7+j*3]) {
        if (tm_path_bad<8) "HIT %d:%d %d,%d,%d/%d,%d,%d\\n",tm_path_cnt,j,
              path->hit[j].fraction,path->hit[j].line,path->hit[j].actor,
              data[5+j*3],data[6+j*3],data[7+j*3];
        tm_path_bad++;break;
      }
    data+=5+count*3;tm_path_cnt++;
  }
  tm_path_time+=tS-start;
  return data;
}
U0 TmPathTest()
{
  I64 i,x,y,vx,vy,old_id,new_id,*data=FileRead("C:/ORACLE/PATH.BIN"),*at=data,
        *actors=FileRead("C:/ORACLE/ACTORS.BIN"),
        *actor_rays=FileRead("C:/ORACLE/ACTRAY.BIN");
  U8 name[5];
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *game=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Path *path;
  Actor *actor;
  if (!data || !actors || !actor_rays || !game || !wad) throw('Files');
  tm_path_cnt=tm_path_bad=0;tm_path_time=0;name[4]=0;
  for (i=0;i<${names.length};i++) {
    MemCpy(name,tm_names+i*4,4);map=MapNew(wad,name);
    if (!map) {"MAP %s\\n",name;throw('Map');}
    world=WorldNew(map,game);path=PathNew(world);
    at=TmPathCases(path,at,TM_PATH_LINES);
    PathDel(path);WorldDel(world);MapDel(map);
  }
  map=MapNew(wad,"E1M1");world=WorldNew(map,game);path=PathNew(world);
  for (i=0;i<256;i++) {
    actor=WorldSpawn(world,TM_MT_SPIDER,actors[i*5],actors[i*5+1]);
    WorldActorUnlink(world,actor);actor->radius=actors[i*5+2];
    actor->active=actors[i*5+3];
    if (!actors[i*5+4]) actor->flags|=TM_MF_NOBLOCKMAP;
    WorldActorLink(world,actor);
  }
  TmPathCases(path,actor_rays,TM_PATH_LINES|TM_PATH_ACTORS);
  PathDel(path);WorldDel(world);world=WorldNew(map,game);path=PathNew(world);
  x=(map->blockmap[0]+256)*65536;y=(map->blockmap[1]+256)*65536;
  PathRun(path,x-64*65536,y,x+64*65536,y,TM_PATH_ACTORS);
  for (i=0;i<300;i++) WorldSpawn(world,TM_MT_TROOP,x,y);
  path->stamp=-1;
  if (!PathRun(path,x-64*65536,y,x+64*65536,y,TM_PATH_ACTORS) || path->cnt!=300)
    throw('Growth');
  for (i=0;i<300;i++)
    if (path->hit[i].fraction!=32768 || path->hit[i].line!=-1 ||
          path->hit[i].actor!=0x100000001+i) throw('Order');
  for (i=0;i<4;i++) {
    vx=vy=64*65536;if (i&1) vx=-vx;if (i&2) vy=-vy;
    if (!PathRun(path,x-vx,y-vy,x+vx,y+vy,TM_PATH_ACTORS) ||
          path->cnt!=300 || path->hit[0].fraction!=32768) throw('Diagonal');
  }
  old_id=world->slot[100].actor->id;
  WorldRemove(world,world->slot[100].actor);
  actor=WorldSpawn(world,TM_MT_TROOP,x,y);new_id=actor->id;
  if (old_id==new_id || !PathRun(path,x-64*65536,y,x+64*65536,y,TM_PATH_ACTORS) ||
        path->cnt!=300 || path->hit[100].actor!=new_id) throw('Reuse');
  if (PathRun(path,I64_MAX,0,0,0) || path->cnt ||
        PathRun(path,0,0,I64_MAX,0) || path->cnt) throw('Bounds');
  "PATH %d RAYS BAD %d MS %.3f\\n",tm_path_cnt,tm_path_bad,tm_path_time*1000;
  PathDel(path);WorldDel(world);MapDel(map);GameDataDel(game);WadDel(wad);
  Free(data);Free(actors);Free(actor_rays);
  if (tm_path_bad) throw('Path');
}
TmPathTest;
`;
const files=[
  {name:'FREEDOOM.WAD',bytes},{name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))},
  {name:'PATH.BIN',bytes:pack(records)},{name:'ACTORS.BIN',bytes:pack(actors.flat())},
  {name:'ACTRAY.BIN',bytes:pack(rayRecords(actorMap,rays,actors))}];
const total=counts.reduce((a,b)=>a+b,0)+rays.length;
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:240});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`PATH ${total} RAYS BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const start=performance.now();await h.Exec(source);
  const count=h.gx.varFind('tm_path_cnt'),bad=h.gx.varFind('tm_path_bad');assert(count&&bad);
  assert.equal(h.gx.rd64(count),total);assert.equal(h.gx.rd64(bad),0);
  console.log(JSON.stringify({backend,rays:total,bad:0,compileAndTestHostMs:performance.now()-start},null,2));
}
