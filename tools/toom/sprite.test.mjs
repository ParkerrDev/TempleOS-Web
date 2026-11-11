import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const states=Array.from({length:967},(_,i)=>[data.readInt32LE(32+i*28),data.readInt32LE(36+i*28)]);
const names=Array.from({length:138},(_,i)=>data.toString('ascii',32+967*28+137*92+i*4,32+967*28+137*92+i*4+4));
const frames=new Map(),images=new Map();
const first=lumps.findIndex(l=>l.name==='S_START'),last=lumps.findIndex(l=>l.name==='S_END');
for(let i=first+1;i<last;i++) {
  const name=lumps[i].name;
  for(let pair=4;pair<name.length;pair+=2) {
    const frame=name.charCodeAt(pair)-65,rot=Number(name[pair+1]);
    for(const angle of rot?[rot-1]:[0,1,2,3,4,5,6,7])
      frames.set(`${name.slice(0,4)}:${frame}:${angle}`,pair===4?i+1:-i-1);
  }
  const b=lumps[i].bytes,w=b.readUInt16LE(0),h=b.readUInt16LE(2),pixels=new Uint16Array(w*h).fill(256);
  for(let x=0;x<w;x++) {
    let at=b.readUInt32LE(8+x*4),prev=-1;
    while(b[at]!==255) {
      let y=b[at];if(y<=prev)y+=prev;prev=y;
      for(let j=0;j<b[at+1];j++)pixels[(y+j)*w+x]=b[at+3+j];
      at+=b[at+1]+4;
    }
  }
  images.set(i+1,{w,h,left:b.readInt16LE(4),top:b.readInt16LE(6),pixels});
}
const frameBytes=Buffer.alloc(states.length*8*4);
for(let i=0;i<states.length;i++)for(let angle=0;angle<8;angle++) {
  const [sprite,frame]=states[i],code=frames.get(`${names[sprite]}:${frame&32767}:${angle}`);
  frameBytes.writeInt32LE(code||0,(i*8+angle)*4);
}
const hash=pixels=>{let h=2166136261;for(const p of pixels)h=Math.imul(h^p,16777619)>>>0;return h;};
const imageBytes=Buffer.alloc(images.size*8);
[...images].forEach(([code,image],i)=>{imageBytes.writeInt32LE(code,i*8);imageBytes.writeUInt32LE(hash(image.pixels),i*8+4);});
const colormap=lumps.find(l=>l.name==='COLORMAP').bytes,tests=[];
const chosen=['PLAY','POSS','TROO','PISF','BFGF','BON1'].map(name=>states.findIndex(s=>names[s[0]]===name));
for(const state of chosen)for(let angle=0;angle<8;angle++) {
  const d=[48,80,128][angle%3],r=[-32,0,32][angle%3],z=angle%2?8:0;
  const a=angle*Math.PI/4,rot=((Math.floor((Math.atan2(r,-d)-a+Math.PI/8)/(Math.PI/4))%8)+8)%8;
  const [sprite,frame]=states[state],code=frames.get(`${names[sprite]}:${frame&32767}:${rot}`),im=images.get(Math.abs(code));
  const light=frame&32768?0:Math.max(0,Math.min(31,4*(15-10)-Math.floor(Math.min(Math.floor(2560/d),47)/2)));
  const pix=new Uint8Array(320*168).fill(77),depth=new Int32Array(320*168),iz=Math.round(1e8/d);
  for(let y=0;y<168;y++)for(let x=0;x<320;x++) {
    const at=x+y*320;depth[at]=x%13===0?4000000:0;
    const worldZ=41+(84-y-.5)*d/160;
    let u=Math.floor((x+.5-160)*d/160-r+(code<0?im.w-im.left:im.left));
    const v=Math.floor(z+im.top-worldZ);
    if(code<0)u=im.w-1-u;
    if(worldZ>128||worldZ<=0||u<0||u>=im.w||v<0||v>=im.h)continue;
    const c=im.pixels[u+v*im.w];
    if(c!==256&&iz>depth[at]) {pix[at]=colormap[light*256+c];depth[at]=iz;}
  }
  tests.push([state,d,r,z,angle,hash(pix),hash(depth)]);
}
const testBytes=Buffer.alloc(tests.length*28);tests.flat().forEach((n,i)=>testBytes.writeUInt32LE(n>>>0,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmData.HH','TmState.HC','TmPal.HC','TmDraw.HC','TmSprite.HC']
  .map(name=>readFileSync(resolve(root,'games/Toom',name),'latin1')).join('\n');
source+=`
U0 TmSpriteTest()
{
  I64 i,j,k,pass,n,bad=0,hash,ph,dh,peak=0,reads;
  I32 *frames=FileRead("C:/ORACLE/FRAMES.BIN"),*images=FileRead("C:/ORACLE/IMAGES.BIN"),
        *tests=FileRead("C:/ORACLE/TESTS.BIN");
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *tmpd=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Sprites *tmps=SpritesNew(tmpw,tmpd);
  Image *tmpi;
  Graphics *tmpg=GraphicsNew(tmpw);
  Map *tmpm=MapNew(tmpw,"E1M1");
  View *tmpv=ViewNew(tmpm,tmpg);
  Actor *tmpa=CAlloc(sizeof(Actor));
  if (!tmps || !tmpv || !frames || !images || !tests) throw('Files');
  for (i=0;i<TM_STATE_NUM;i++)
    for (j=0;j<8;j++)
      if (SpriteFrame(tmps,tmpd->state[i].sprite,tmpd->state[i].frame,j)!=frames[i*8+j])
        throw('Frame');
  for (pass=0;pass<2;pass++)
    for (i=0;i<${images.size};i++) {
      if (!(tmpi=SpriteGet(tmps,images[i*2]))) {
        "IMAGE %d CODE %d CACHE %d\\n",i,images[i*2],tmps->cache_size;
        throw('Image');
      }
      hash=2166136261;
      for (j=0;j<tmpi->width*tmpi->height;j++)
        hash=(hash^tmpi->pix[j])*16777619&0xFFFFFFFF;
      if (hash!=images(U32 *)[i*2+1]) throw('Pixels');
      reads=tmpw->read_bytes;
      if (SpriteGet(tmps,-images[i*2])!=tmpi || reads!=tmpw->read_bytes) throw('Hit');
      peak=MaxI64(peak,tmps->cache_size);
      if (peak>TM_SPRITE_CACHE_SIZE) throw('Cache');
    }
  tmpv->x=tmpv->y=0; tmpv->z=41; tmpv->cs=1; tmpv->sn=0;
  tmpm->sector[0].floor=0; tmpm->sector[0].ceil=128; tmpm->sector[0].light=160;
  tmpa->active=TRUE; tmpa->sector=0;
  for (i=0;i<${tests.length};i++) {
    n=tests[i*7];
    tmpa->sprite=tmpd->state[n].sprite; tmpa->frame=tmpd->state[n].frame;
    tmpa->x=tests[i*7+1]*65536; tmpa->y=-tests[i*7+2]*65536;
    tmpa->z=tests[i*7+3]*65536; tmpa->angle=tests[i*7+4]*536870912;
    MemSet(tmpv->pix,77,320*168);
    for (j=0;j<168;j++)
      for (k=0;k<320;k++) {
        n=0; if (!(k%13)) n=4000000;
        tmpv->depth[k+j*320]=n;
      }
    SpriteDraw(tmpv,tmps,tmpa);
    ph=dh=2166136261;
    for (j=0;j<320*168;j++) {
      ph=(ph^tmpv->pix[j])*16777619&0xFFFFFFFF;
      dh=(dh^tmpv->depth[j])*16777619&0xFFFFFFFF;
    }
    if (ph!=tests(U32 *)[i*7+5] || dh!=tests(U32 *)[i*7+6]) {
      "%d PIX %d/%d DEPTH %d/%d\\n",i,ph,tests(U32 *)[i*7+5],dh,tests(U32 *)[i*7+6];
      bad++;
    }
  }
  "FRAMES 7736 IMAGES ${images.size} VIEWS ${tests.length} BAD %d PEAK %d\\n",bad,peak;
  Free(frames); Free(images); Free(tests); Free(tmpa);
  SpritesDel(tmps); ViewDel(tmpv); GraphicsDel(tmpg); MapDel(tmpm);
  GameDataDel(tmpd); WadDel(tmpw);
  if (bad) throw('Draw');
}
TmSpriteTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'TMDATA.BIN',bytes:data},{name:'FRAMES.BIN',bytes:frameBytes},
  {name:'IMAGES.BIN',bytes:imageBytes},{name:'TESTS.BIN',bytes:testBytes}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/FRAMES 7736 IMAGES \d+ VIEWS 48 BAD 0/);
