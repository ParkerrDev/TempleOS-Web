import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),find=name=>lumps.findLast(l=>l.name===name),textures=[];
const pn=find('PNAMES').bytes,pnames=Array.from({length:pn.readUInt32LE(0)},(_,i)=>pn.toString('ascii',4+i*8,12+i*8).replace(/\0.*$/s,''));
for(const table of ['TEXTURE1','TEXTURE2']) {
  const b=find(table).bytes;
  for(let i=0;i<b.readUInt32LE(0);i++) {
    const offset=b.readUInt32LE(4+i*4),name=b.toString('ascii',offset,offset+8).replace(/\0.*$/s,''),w=b.readUInt16LE(offset+12),h=b.readUInt16LE(offset+14);
    if(!name.startsWith('MID'))continue;
    const pix=new Uint16Array(w*h).fill(256);
    for(let j=0;j<b.readUInt16LE(offset+20);j++) {
      const p=offset+22+j*10,x0=b.readInt16LE(p),y0=b.readInt16LE(p+2),patch=find(pnames[b.readUInt16LE(p+4)]).bytes;
      for(let x=0;x<patch.readUInt16LE(0);x++) {
        let at=patch.readUInt32LE(8+x*4),prev=-1;
        while(patch[at]!==255) {
          let y=patch[at];if(y<=prev)y+=prev;prev=y;
          for(let k=0;k<patch[at+1];k++) {
            const dx=x0+x,dy=y0+y+k;
            if(dx>=0&&dx<w&&dy>=0&&dy<h)pix[dy*w+dx]=patch[at+3+k];
          }
          at+=patch[at+1]+4;
        }
      }
    }
    if(pix.includes(256)&&pix.some(p=>p!==256))textures.push({name,w,h,pix});
  }
}
assert(textures.length>=3);textures.length=3;
const tests=[],colormap=find('COLORMAP').bytes;
const hash=values=>{let h=2166136261;for(const n of values)h=Math.imul(h^n,16777619)>>>0;return h;};
for(let texture=0;texture<3;texture++)for(let geometry=0;geometry<4;geometry++)for(let peg=0;peg<2;peg++)for(let scroll=0;scroll<2;scroll++) {
  let [ax,ay,bx,by]=[[80,96,80,-96],[32,96,144,-96],[0,96,128,-96],[80,-96,80,96]][geometry];
  const im=textures[texture],xoff=scroll?-23:0,yoff=scroll?19:0,origin=(peg?8+im.h:112)+yoff;
  const pix=new Uint8Array(320*168).fill(77),depth=new Int32Array(320*168),lx=bx-ax,ly=by-ay,len=Math.hypot(lx,ly);
  for(let x=0;x<320;x++) {
    const dx=1,dy=-(x+.5-160)/160,den=dx*ly-dy*lx;
    const d=(ax*ly-ay*lx)/den,u=(ax*dy-ay*dx)/den;
    const visible=den<0&&d>=1&&u>=0&&u<1;
    const ya=Math.max(0,Math.ceil(84-(112-41)*160/d-.500000001));
    const iz=Math.min(2147483647,Math.trunc(1e8/d));
    const light=Math.max(0,Math.min(31,(ax===bx?8:12)-Math.floor(Math.min(Math.floor(2560/d),47)/2)));
    // Horizontal texture lookup uses the ray/segment intersection; the row
    // coordinate is the renderer's documented Q16 stepping contract.
    const tx=((Math.floor(xoff+u*len)%im.w)+im.w)%im.w;
    const v0=Math.trunc((origin-41+(ya+.5-84)*d/160)*65536),step=Math.trunc(d/160*65536);
    for(let y=0;y<168;y++) {
      const at=x+y*320;depth[at]=x%13===0?4000000:x%17===0?-4000000:0;
      const wz=41+(84-y-.5)*d/160,v=Math.floor((v0+step*(y-ya))/65536);
      if(!visible||wz>112+1e-9||wz<=8+1e-9||v<0||v>=im.h)continue;
      const c=im.pix[tx+v*im.w];
      if(c!==256&&iz>Math.abs(depth[at])) {pix[at]=colormap[light*256+c];depth[at]=iz;}
    }
  }
  tests.push([texture,ax,ay,bx,by,peg,xoff,yoff,hash(pix),hash(depth)]);
}
const names=Buffer.alloc(24);textures.forEach((t,i)=>names.write(t.name,i*8,8,'ascii'));
const expected=Buffer.alloc(tests.length*40);tests.flat().forEach((n,i)=>expected.writeUInt32LE(n>>>0,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmPal.HC','TmDraw.HC','TmMask.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
U0 TmMaskTest()
{
  I64 i,j,x,y,n,bad=0,ph,dh;
  U8 *names=FileRead("C:/ORACLE/NAMES.BIN");
  I32 *tests=FileRead("C:/ORACLE/TESTS.BIN");
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Graphics *tmpg=GraphicsNew(tmpw);
  Map *tmpm=MapNew(tmpw,"E1M1");
  View *tmpv=ViewNew(tmpm,tmpg);
  Seg *tmps=tmpm->seg;
  if (!tmpv || !names || !tests) throw('Files');
  tmpv->x=tmpv->y=0; tmpv->z=41; tmpv->cs=1; tmpv->sn=0;
  tmps->v1=0; tmps->v2=1; tmps->line=0; tmps->side=0; tmps->offset=0;
  tmpm->line[0].side[0]=0; tmpm->line[0].side[1]=1;
  tmpm->side[0].sector=0; tmpm->side[1].sector=1;
  tmpm->sector[0].floor=-8; tmpm->sector[0].ceil=128; tmpm->sector[0].light=192;
  tmpm->sector[1].floor=8; tmpm->sector[1].ceil=112;
  tmpv->masked[0]=tmps; tmpv->masked_cnt=1;
  for (i=0;i<${tests.length};i++) {
    n=tests[i*10];
    MemCpy(tmpm->side[0].middle,names+n*8,8);
    tmpm->vertex[0].x=tests[i*10+1]; tmpm->vertex[0].y=tests[i*10+2];
    tmpm->vertex[1].x=tests[i*10+3]; tmpm->vertex[1].y=tests[i*10+4];
    tmpm->line[0].flags=4+tests[i*10+5]*16;
    tmpm->side[0].x=tests[i*10+6]; tmpm->side[0].y=tests[i*10+7];
    MemSet(tmpv->pix,77,320*168);
    for (y=0;y<168;y++)
      for (x=0;x<320;x++) {
        n=0; if (!(x%17)) n=-4000000;
        if (!(x%13)) n=4000000;
        tmpv->depth[x+y*320]=n;
      }
    ViewMasked(tmpv);
    ph=dh=2166136261;
    for (j=0;j<320*168;j++) {
      ph=(ph^tmpv->pix[j])*16777619&0xFFFFFFFF;
      dh=(dh^tmpv->depth[j])*16777619&0xFFFFFFFF;
    }
    if (ph!=tests(U32 *)[i*10+8] || dh!=tests(U32 *)[i*10+9]) {
      if (bad<12) "%d PIX %d/%d DEPTH %d/%d\\n",i,ph,tests(U32 *)[i*10+8],dh,tests(U32 *)[i*10+9];
      bad++;
    }
  }
  "MASKED ${tests.length} VIEWS BAD %d\\n",bad;
  ViewDel(tmpv); GraphicsDel(tmpg); MapDel(tmpm); WadDel(tmpw); Free(names); Free(tests);
  if (bad) throw('Masked');
}
TmMaskTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'NAMES.BIN',bytes:names},{name:'TESTS.BIN',bytes:expected}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/MASKED 48 VIEWS BAD 0/);
