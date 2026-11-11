import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead,SubsectorAt} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,
  'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes);
function Fixture(name)
{
const map=MapRead(lumps,lumps.findIndex(l=>l.name===name));
const start=map.things.find(t=>t[3]===1),poses=[],expected=[];
const sectorAt=(x,y)=>{
  const sub=map.subsectors[SubsectorAt(map,x,y)],seg=map.segs[sub[1]];
  return map.sides[map.lines[seg[3]][5+seg[4]]].sector;
};
for (let pos=0;pos<2;pos++)for(let turn=0;turn<4;turn++) {
  const x=start[0]+pos*8,y=start[1]-pos*8;
  const sector=sectorAt(x,y),z=map.sectors[sector].floor+41,angle=turn*Math.PI/2;
  poses.push([x,y,z,angle]);
  const cs=Math.cos(angle),sn=Math.sin(angle),rays=[];
  for(let px=2;px<320;px+=4) {
    const right=(px+0.5-160)/160,dx=cs+sn*right,dy=sn-cs*right,hits=[];
    for(const seg of map.segs) {
      const line=map.lines[seg[3]],a=map.vertices[seg[0]],b=map.vertices[seg[1]];
      const lx=b[0]-a[0],ly=b[1]-a[1],den=dx*ly-dy*lx;
      if(den>=-1e-10)continue;
      const qx=a[0]-x,qy=a[1]-y,t=(qx*ly-qy*lx)/den,u=(qx*dy-qy*dx)/den;
      if(t>=1&&u>=0&&u<1)hits.push({t,line,side:seg[4]});
    }
    hits.sort((a,b)=>a.t-b.t);rays.push({hits,sector:sectorAt(x+dx,y+dy)});
  }
  for(let py=2;py<168;py+=4)for(let col=0;col<80;col++) {
    const dz=(84-py-0.5)/160;
    let current=rays[col].sector,previous=1,answer=null;
    const plane=(until)=>{
      const s=map.sectors[current],height=dz>0?s.ceil:s.floor;
      const t=(height-z)/dz;
      // The shared outdoor ceiling follows the next sky sector's height.
      // Doom r_segs.c sets worldtop=worldhigh for two sky ceilings.
      if(dz>0&&s.ceilName==='F_SKY1')return null;
      if(t>=previous-1e-6&&t<until-1e-6)
        return dz<0&&s.floorName==='F_SKY1'?0:t;
      return null;
    };
    for(const {t,line,side} of rays[col].hits) {
      const front=map.sides[line[5+side]].sector;
      const back=line[6-side]===65535||!(line[2]&4)?-1:map.sides[line[6-side]].sector;
      if(front!==current&&back!==current)continue;
      const p=plane(t);
      if(p!==null) {answer=p;break;}
      const other=front===current?back:front,at=z+dz*t;
      const s=map.sectors[current],b=other<0?null:map.sectors[other];
      const bothSky=b&&s.ceilName==='F_SKY1'&&b.ceilName==='F_SKY1';
      if(s.ceilName==='F_SKY1'&&at>(bothSky?b.ceil:s.ceil)+1e-9) {answer=0;break;}
      if(other<0||at<=Math.max(s.floor,b.floor)+1e-9||
          !bothSky&&at>Math.min(s.ceil,b.ceil)+1e-9) {
        answer=t;break;
      }
      current=other;previous=t;
    }
    if(answer===null)answer=plane(Infinity)||0;
    expected.push(answer>0?Math.min(2147483647,Math.round(100000000/answer)):0);
  }
}
const poseBytes=Buffer.alloc(poses.length*32),expectedBytes=Buffer.alloc(expected.length*4);
poses.flat().forEach((value,i)=>poseBytes.writeDoubleLE(value,i*8));
expected.forEach((value,i)=>expectedBytes.writeInt32LE(value,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmPal.HC','TmDraw.HC']
  .map(name=>readFileSync(resolve(root,'games/Toom',name),'latin1')).join('\n');
source+=`
U8 *TmGuardNew(U8 *old,I64 size)
{
  U8 *res=MAlloc(size+128);
  Free(old);
  MemSet(res,0xA5,size+128);
  return res+64;
}
U0 TmGuardChk(U8 *src,I64 size)
{
  I64 i;
  for (i=0;i<64;i++)
    if (src[i-64]!=0xA5 || src[size+i]!=0xA5) throw('Guard');
}
U0 TmDrawTest()
{
  I64 p,x,y,n=0,bad=0,got,want,frame_bad,wi,color,phase;
  F64 *poses=FileRead("C:/ORACLE/${name}P.BIN"),start;
  I32 *expected=FileRead("C:/ORACLE/${name}D.BIN");
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Map *tmpm=MapNew(tmpw,"${name}");
  Graphics *tmpg=GraphicsNew(tmpw);
  View *tmpv=ViewNew(tmpm,tmpg);
  CDC *dc=DCNew(643,343);
  if (!tmpv || !poses || !expected) throw('Files');
  tmpv->pix=TmGuardNew(tmpv->pix,320*168);
  tmpv->plane=TmGuardNew(tmpv->plane,320*168*2);
  tmpv->depth=TmGuardNew(tmpv->depth,320*168*4);
  tmpv->top=TmGuardNew(tmpv->top,320*2);
  tmpv->bottom=TmGuardNew(tmpv->bottom,320*2);
  start=tS;
  for (p=0;p<${poses.length};p++) {
    tmpv->x=poses[p*4]; tmpv->y=poses[p*4+1];
    tmpv->z=poses[p*4+2]; tmpv->angle=poses[p*4+3];
    ViewDraw(tmpv);
    TmGuardChk(tmpv->pix,320*168);
    TmGuardChk(tmpv->plane,320*168*2);
    TmGuardChk(tmpv->depth,320*168*4);
    TmGuardChk(tmpv->top,320*2);
    TmGuardChk(tmpv->bottom,320*2);
    frame_bad=0;
    for (y=2;y<168;y+=4)
      for (x=2;x<320;x+=4) {
        got=tmpv->depth[x+y*320]; want=expected[n++];
        if (AbsI64(got-want)>3) {
          if (bad<12) "%d %d,%d got %d want %d\\n",p,x,y,got,want;
          bad++; frame_bad++;
        }
      }
    "POSE %d BAD %d\\n",p,frame_bad;
  }
  "DEPTH %d BAD %d MS %.1f\\n",n,bad,(tS-start)*1000;
  wi=dc->width_internal;
  MemSet(dc->body,0xA5,wi*dc->height);
  ViewBlot(tmpv,dc,1,3);
  for (y=0;y<dc->height;y++)
    for (x=0;x<wi;x++) {
      want=0xA5;
      if (1<=x<641 && 3<=y<339) {
        color=tm_palette[tmpv->pix[(x-1)/2+(y-3)/2*320]];
        phase=(x-1)&1;
        if ((y-3)&1) phase+=2;
        want=color.u8[phase];
      }
      if (dc->body[x+y*wi]!=want) throw('Blot');
    }
  Free(tmpv->pix-64); tmpv->pix=NULL;
  Free(tmpv->plane(U8 *)-64); tmpv->plane=NULL;
  Free(tmpv->depth(U8 *)-64); tmpv->depth=NULL;
  Free(tmpv->top(U8 *)-64); tmpv->top=NULL;
  Free(tmpv->bottom(U8 *)-64); tmpv->bottom=NULL;
  DCDel(dc);
  ViewDel(tmpv); GraphicsDel(tmpg); MapDel(tmpm); WadDel(tmpw);
  Free(poses); Free(expected);
  if (bad) throw('Depth');
}
TmDrawTest;
`;
return {source:Buffer.from(source,'latin1'),files:[
  {name:`${name}P.BIN`,bytes:poseBytes},{name:`${name}D.BIN`,bytes:expectedBytes}]};
}
const names=process.env.ALL?lumps.filter(l=>/^E[1-4]M[1-9]$/.test(l.name)).map(l=>l.name):
  [process.env.MAP||'E1M1'];
const fixtures=names.map(Fixture);
const result=await QemuRun(fixtures.map(f=>f.source),{files:[
  {name:'FREEDOOM.WAD',bytes},...fixtures.flatMap(f=>f.files)],timeout:240});
console.log(JSON.stringify(result,null,2));
for (let i=0;i<result.results.length;i++) {
  assert.equal(result.results[i].except,'',names[i]);
  assert.match(result.results[i].out,/DEPTH 26880 BAD 0/,names[i]);
}
