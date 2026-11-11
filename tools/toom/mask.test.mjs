import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
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
function fixed(value) {
  const scaled=value*65536,low=Math.floor(scaled),fraction=scaled-low;
  return fraction<.5?low:fraction>.5?low+1:low%2===0?low:low+1;
}
const texel=value=>Math.floor(fixed(value)/65536);
for(const [floor,ceil] of [[8,112],[8.25,111.5]])for(let texture=0;texture<3;texture++)for(let geometry=0;geometry<4;geometry++)for(let peg=0;peg<2;peg++)for(let scroll=0;scroll<2;scroll++) {
  let [ax,ay,bx,by]=[[80,96,80,-96],[32,96,144,-96],[0,96,128,-96],[80,-96,80,96]][geometry];
  const im=textures[texture],xoff=scroll?-23:0,yoff=scroll?19:0,origin=(peg?floor+im.h:ceil)+yoff;
  const pix=new Uint8Array(320*168).fill(77),depth=new Int32Array(320*168),lx=bx-ax,ly=by-ay,len=Math.hypot(lx,ly);
  for(let x=0;x<320;x++) {
    const dx=1,dy=-(x+.5-160)/160,den=dx*ly-dy*lx;
    const d=(ax*ly-ay*lx)/den,u=(ax*dy-ay*dx)/den;
    const visible=den<0&&d>=1&&u>=0&&u<1;
    const ya=Math.max(0,Math.ceil(84-(ceil-41)*160/d-.500000001));
    const iz=Math.min(2147483647,Math.trunc(1e8/d));
    const light=Math.max(0,Math.min(31,(ax===bx?8:12)-Math.floor(Math.min(texel(2560/d),47)/2)));
    // Horizontal texture lookup uses the ray/segment intersection; the row
    // coordinate is the renderer's documented Q16 stepping contract.
    const tx=((texel(xoff+u*len)%im.w)+im.w)%im.w;
    const v0=fixed(origin-41+(ya+.5-84)*d/160),step=fixed(d/160);
    for(let y=0;y<168;y++) {
      const at=x+y*320;depth[at]=x%13===0?4000000:x%17===0?-4000000:0;
      const wz=41+(84-y-.5)*d/160,v=Math.floor((v0+step*(y-ya))/65536);
      if(!visible||wz>ceil+1e-9||wz<=floor+1e-9||v<0||v>=im.h)continue;
      const c=im.pix[tx+v*im.w];
      if(c!==256&&iz>Math.abs(depth[at])) {pix[at]=colormap[light*256+c];depth[at]=iz;}
    }
  }
  tests.push([texture,ax,ay,bx,by,peg,xoff,yoff,hash(pix),hash(depth),floor*65536,ceil*65536]);
}
const names=Buffer.alloc(24);textures.forEach((t,i)=>names.write(t.name,i*8,8,'ascii'));
const expected=Buffer.alloc(tests.length*48);tests.flat().forEach((n,i)=>expected.writeUInt32LE(n>>>0,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmPal.HC','TmDraw.HC','TmMask.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=`
I64 tm_mask_done=0,tm_mask_bad=0;
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
  if (SampleFixed(1.0/131072.0) || SampleFixed(-1.0/131072.0) ||
        SampleFixed(3.0/131072.0)!=2 || SampleFixed(-3.0/131072.0)!=-2 ||
        SampleFixed(1.0-1.0e-12)>>16!=1 ||
        SampleFixed(-1.0-1.0e-12)>>16!=-1) throw('Q16');
  tmpv->x=tmpv->y=0; tmpv->z=41; tmpv->cs=1; tmpv->sn=0;
  tmps->v1=0; tmps->v2=1; tmps->line=0; tmps->side=0; tmps->offset=0;
  tmpm->line[0].side[0]=0; tmpm->line[0].side[1]=1;
  tmpm->side[0].sector=0; tmpm->side[1].sector=1;
  tmpm->sector[0].floor=-8*65536; tmpm->sector[0].ceil=128*65536; tmpm->sector[0].light=192;
  tmpm->sector[1].floor=8*65536; tmpm->sector[1].ceil=112*65536;
  tmpv->masked[0]=tmps; tmpv->masked_cnt=1;
  for (i=0;i<${tests.length};i++) {
    tmpm->sector[1].floor=tests[i*12+10]; tmpm->sector[1].ceil=tests[i*12+11];
    n=tests[i*12];
    MemCpy(tmpm->side[0].middle,names+n*8,8);
    tmpm->vertex[0].x=tests[i*12+1]; tmpm->vertex[0].y=tests[i*12+2];
    tmpm->vertex[1].x=tests[i*12+3]; tmpm->vertex[1].y=tests[i*12+4];
    tmpm->line[0].flags=4+tests[i*12+5]*16;
    tmpm->side[0].x=tests[i*12+6]; tmpm->side[0].y=tests[i*12+7];
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
    if (ph!=tests(U32 *)[i*12+8] || dh!=tests(U32 *)[i*12+9]) {
      if (bad<12) "%d PIX %d/%d DEPTH %d/%d\\n",i,ph,tests(U32 *)[i*12+8],dh,tests(U32 *)[i*12+9];
      bad++;
    }
  }
  "MASKED ${tests.length} VIEWS BAD %d\\n",bad;
  ViewDel(tmpv); GraphicsDel(tmpg); MapDel(tmpm); WadDel(tmpw); Free(names); Free(tests);
  tm_mask_bad=bad;
  if (bad) throw('Masked');
  tm_mask_done=1;
}
TmMaskTest;
`;
const files=[{name:'FREEDOOM.WAD',bytes},{name:'NAMES.BIN',bytes:names},{name:'TESTS.BIN',bytes:expected}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:240});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,/MASKED 96 VIEWS BAD 0/);
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
  assert.equal(h.gx.rd64(h.gx.varFind('tm_mask_done')),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_mask_bad')),0);
  console.log(JSON.stringify({backend,views:tests.length,bad:0},null,2));
}
