import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),defs=readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii');
const flag=name=>Number(defs.match(new RegExp(`#define TM_MF_${name}\\s+(\\d+)`))[1]);
const MF=Object.fromEntries(['NOCLIP','DROPOFF','FLOAT','TELEPORT','MISSILE'].map(n=>[n,flag(n)]));
const maps=lumps.flatMap((l,i)=>/^E[1-4]M[1-9]$/.test(l.name)?[MapRead(lumps,i)]:[]);
const tests=[],offsets=[];
let rng=0x12345678;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
function side(x,y,ax,ay,dx,dy) {
  if(dx===0)return Number(x<=ax?dy>0:dy<0);
  if(dy===0)return Number(y<=ay?dx<0:dx>0);
  return Number(Math.floor(dy*(x-ax)/65536)<=Math.floor(dx*(y-ay)/65536));
}
function sectorAt(m,x,y) {
  let n=m.nodes.length-1;
  if(n<0)n=0x8000;
  while(!(n&0x8000)) {
    const p=m.nodes[n];n=p.children[side(x,y,p.origin[0]*65536,p.origin[1]*65536,...p.delta)];
  }
  const seg=m.segs[m.subsectors[n&32767][1]];
  return m.sides[m.lines[seg[3]][5+seg[4]]].sector;
}
function scan(m,q) {
  const [x,y,z,r,height,flags,player]=q,sector=sectorAt(m,x,y),base=m.sectors[sector];
  let floor=base.floor*65536,ceil=base.ceil*65536,dropoff=floor,special=0,good=true;
  if(flags&MF.NOCLIP)return [1,sector,floor,ceil,dropoff,0];
  const corners=[[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]];
  // Deliberately scan every linedef: the native query uses the WAD blockmap.
  for(let i=0;i<m.lines.length;i++) {
    const l=m.lines[i],[ax,ay]=m.vertices[l[0]].map(n=>n*65536),[bx,by]=m.vertices[l[1]].map(n=>n*65536);
    if(x+r<=Math.min(ax,bx)||x-r>=Math.max(ax,bx)||y+r<=Math.min(ay,by)||y-r>=Math.max(ay,by))continue;
    const sides=corners.map(([px,py])=>side(px,py,ax,ay,(bx-ax)/65536,(by-ay)/65536));
    if(sides.every(v=>v===sides[0]))continue;
    if(!(l[2]&4)||l[6]===65535||!(flags&MF.MISSILE)&&(l[2]&1||!player&&(l[2]&2))) {good=false;break;}
    const front=m.sectors[m.sides[l[5]].sector],back=m.sectors[m.sides[l[6]].sector];
    floor=Math.max(floor,front.floor*65536,back.floor*65536);
    ceil=Math.min(ceil,front.ceil*65536,back.ceil*65536);
    dropoff=Math.min(dropoff,front.floor*65536,back.floor*65536);
    if(l[3])special=(special^Math.imul(i+1,2654435761))>>>0;
  }
  good=good&&ceil-floor>=height&&((flags&MF.TELEPORT)||ceil-z>=height&&floor-z<=24*65536)&&
    ((flags&(MF.DROPOFF|MF.FLOAT))||floor-dropoff<=24*65536);
  return [Number(!!good),sector,floor,ceil,dropoff,special];
}
for(const m of maps) {
  offsets.push(tests.length);
  const points=m.things.map(t=>[t[0]*65536,t[1]*65536]);
  for(let i=0;i<m.lines.length;i+=Math.max(1,Math.floor(m.lines.length/512))) {
    const a=m.vertices[m.lines[i][0]],b=m.vertices[m.lines[i][1]];
    points.push([(a[0]+b[0])*32768+32767,(a[1]+b[1])*32768-32767]);
    points.push([a[0]*65536+1,a[1]*65536-1]);
  }
  const minx=Math.min(...m.vertices.map(v=>v[0])),maxx=Math.max(...m.vertices.map(v=>v[0]));
  const miny=Math.min(...m.vertices.map(v=>v[1])),maxy=Math.max(...m.vertices.map(v=>v[1]));
  for(let i=0;i<256;i++)points.push([(minx+next()%(maxx-minx+1))*65536+next()%65536,
    (miny+next()%(maxy-miny+1))*65536+next()%65536]);
  for(let i=0;i<points.length;i++) {
    const [x,y]=points[i],base=m.sectors[sectorAt(m,x,y)].floor*65536;
    const [r,h,f,player,z]=[[16,56,MF.DROPOFF,1,base],[20,56,0,0,base],
      [6,8,MF.MISSILE|MF.DROPOFF,0,base+32*65536],[16,56,MF.NOCLIP,1,base],
      [16,56,MF.TELEPORT|MF.DROPOFF,1,base-100*65536],[31,64,MF.FLOAT,0,base+8*65536]][i%6];
    const q=[x,y,z,r*65536,h*65536,f,player];tests.push([...q,...scan(m,q)]);
  }
}
offsets.push(tests.length);
const records=Buffer.alloc(tests.length*13*8),ranges=Buffer.alloc(offsets.length*8);
tests.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),i*8));
offsets.forEach((n,i)=>ranges.writeBigInt64LE(BigInt(n),i*8));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
U0 TmCollisionTest()
{
  I64 i,j,k,n,got,bad=0,hash,passed=0,*q,*tests=FileRead("C:/ORACLE/TESTS.BIN"),
        *offsets=FileRead("C:/ORACLE/OFFSETS.BIN");
  F64 start=tS;
  U8 name[9];
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Map *tmpm;
  Collision *tmpc;
  if (!tmpw || !tests || !offsets) throw('Files');
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",i/9+1,i%9+1);
    tmpm=MapNew(tmpw,name); tmpc=CollisionNew(tmpm);
    for (j=offsets[i];j<offsets[i+1];j++) {
      q=tests+j*13;
      got=CollisionCheck(tmpc,q[0],q[1],q[2],q[3],q[4],q[5],q[6]);
      hash=0;
      for (k=0;k<tmpc->special_cnt;k++)
        hash^=(tmpc->special[k]+1)*2654435761&0xFFFFFFFF;
      n=0;
      if (got!=q[7] || tmpc->sector!=q[8]) n=1;
      if (got && q[7] && (tmpc->floor!=q[9] || tmpc->ceil!=q[10] ||
            tmpc->dropoff!=q[11] || hash!=q[12])) n=1;
      if (n) {
        if (bad<12) "%s %d GOT %d/%d SECTOR %d/%d FLOOR %d/%d CEIL %d/%d DROP %d/%d SPECIAL %d/%d\\n",
              name,j-offsets[i],got,q[7],tmpc->sector,q[8],tmpc->floor,q[9],tmpc->ceil,q[10],tmpc->dropoff,q[11],hash,q[12];
        bad++;
      }
      if (got) passed++;
    }
    CollisionDel(tmpc); MapDel(tmpm);
  }
  "COLLISION ${tests.length} QUERIES BAD %d PASSABLE %d MS %.1f\\n",bad,passed,(tS-start)*1000;
  WadDel(tmpw); Free(tests); Free(offsets);
  if (bad) throw('Collide');
}
TmCollisionTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'TESTS.BIN',bytes:records},{name:'OFFSETS.BIN',bytes:ranges}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/COLLISION \d+ QUERIES BAD 0/);
