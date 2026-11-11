import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead,FixedSectorAt} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=FreedoomRead(),lumps=WadRead(bytes),names=process.env.MAP?[process.env.MAP]:
  Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`);
let random=0x591aaf31;const next=()=>random=(Math.imul(random,1664525)+1013904223)>>>0;
const clamp=n=>Number(n< -2147483648n?-2147483648n:n>2147483647n?2147483647n:n);
const divide=(a,b)=>!b?(a<0?-2147483648:2147483647):clamp(BigInt(a)*65536n/BigInt(b));
function visible(map,reject,a,b) {
  const s1=FixedSectorAt(map,a[0],a[1]),s2=FixedSectorAt(map,b[0],b[1]),bit=s1*map.sectors.length+s2;
  if(reject[bit>>>3]&(1<<(bit&7)))return false;
  const [x,y]=a.map(BigInt),dx=BigInt(b[0])-x,dy=BigInt(b[1])-y;
  if(!dx&&!dy)return true;
  const side=(px,py)=>!dx?(px<=x?dy>0n:dy<0n):!dy?(py<=y?dx<0n:dx>0n):dx*(py-y)>=dy*(px-x);
  const eye=a[2]+a[3]-Math.floor(a[3]/4);let low=b[2]-eye,high=b[2]+b[3]-eye;
  for(const line of map.lines) {
    const av=map.vertices[line[0]],bv=map.vertices[line[1]],ax=BigInt(av[0])*65536n,ay=BigInt(av[1])*65536n,
      bx=BigInt(bv[0])*65536n,by=BigInt(bv[1])*65536n;
    if(side(ax,ay)===side(bx,by))continue;
    let den=dx*(by-ay)-dy*(bx-ax),num=(ax-x)*(by-ay)-(ay-y)*(bx-ax);
    if(den<0n){den=-den;num=-num;}
    if(!den||num<0n||num>den)continue;
    if(!(line[2]&4)||line[6]===65535)return false;
    const front=map.sectors[map.sides[line[5]].sector],back=map.sectors[map.sides[line[6]].sector],
      floor=Math.max(front.floor,back.floor)*65536,ceil=Math.min(front.ceil,back.ceil)*65536;
    if(floor>=ceil)return false;
    const fraction=Number((num<<16n)/den);
    if(front.floor!==back.floor)low=Math.max(low,divide(floor-eye,fraction));
    if(front.ceil!==back.ceil)high=Math.min(high,divide(ceil-eye,fraction));
    if(high<=low)return false;
  }
  return true;
}
const records=[];let total=0,seen=0;
for(const name of names) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===name)),reject=lumps[map.index+9].bytes;
  records.push(192);
  function point() {
    const t=map.things[next()%map.things.length],x=t[0]*65536,y=t[1]*65536,
      sector=map.sectors[FixedSectorAt(map,x,y)];
    return [x,y,(sector.floor+[0,16,32,64][next()%4])*65536,[16,56,64,110][next()%4]*65536];
  }
  for(let i=0;i<192;i++) {
    const a=point(),b=i%8?point():[a[0]+64*65536,a[1],a[2],56*65536];
    const ok=visible(map,reject,a,b);records.push(...a,...b,+ok);total++;seen+=+ok;
  }
}
assert(seen>0&&seen<total,'Fixture includes visible and occluded pairs.');
const packed=Buffer.alloc(records.length*8);records.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmPath.HC','TmSight.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
U8 *tm_sight_names="${names.join('')}";
I64 tm_sight_cnt=0,tm_sight_bad=0;
U0 TmSightTest()
{
  I64 i,j,n,*body=FileRead("C:/ORACLE/SIGHT.BIN"),*at=body;
  U8 name[5];
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Path *path;
  Actor a,b;
  Bool result;
  if (!body || !wad || !data) throw('Files');
  MemSet(&a,0,sizeof(Actor)); MemSet(&b,0,sizeof(Actor));
  a.active=b.active=TRUE; name[4]=0;
  for (i=0;i<${names.length};i++) {
    MemCpy(name,tm_sight_names+i*4,4); map=MapNew(wad,name);
    if (!map) throw('Map');
    world=WorldNew(map,data); path=PathNew(world); a.world=b.world=world;
    n=*at++;
    for (j=0;j<n;j++,at+=9) {
      a.x=at[0]; a.y=at[1]; a.z=at[2]; a.height=at[3];
      b.x=at[4]; b.y=at[5]; b.z=at[6]; b.height=at[7];
      a.sector=FixedSector(map,a.x,a.y); b.sector=FixedSector(map,b.x,b.y);
      result=ActorSight(path,&a,&b);
      if (result!=at[8]) {
        if (tm_sight_bad<8) "SIGHT %s %d GOT %d EXPECT %d\\n",name,j,result,at[8];
        tm_sight_bad++;
      }
      tm_sight_cnt++;
    }
    PathDel(path); WorldDel(world); MapDel(map);
  }
  Free(body); GameDataDel(data); WadDel(wad);
  "SIGHT %d RAYS BAD %d\\n",tm_sight_cnt,tm_sight_bad;
  if (tm_sight_bad) throw('Sight');
}
TmSightTest;
`;
const files=[{name:'FREEDOOM.WAD',bytes},{name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))},
  {name:'SIGHT.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:240});
  console.log(JSON.stringify({...result,reference:{total,visible:seen}},null,2));
  assert.equal(result.results[0].except,'');
  assert(!result.results[0].out.includes('WARNING:'));
  assert.match(result.results[0].out,new RegExp(`SIGHT ${total} RAYS BAD 0`));
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
  assert.equal(h.gx.rd64(h.gx.varFind('tm_sight_cnt')),total);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_sight_bad')),0);
  console.log(JSON.stringify({backend,rays:total,visible:seen,bad:0},null,2));
}
