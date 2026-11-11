import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {BrainMaps} from './BrainMaps.mjs';
import {WadRead} from './Wad.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function OverlayReference() {
  const revision='a77dfb96cb91780ca334d0d4cfd86957558007e0',files=[
    ['r_things.c','b3ff03ba213782ed6488a9e0fb0afa0a0ee1f5cfbff8ce498c7133e93e01e0e3'],
    ['r_draw.c','b19edd950d3d56d2d1d6168677d6345c190f081baa8269bfac3d2f3920a36a96']
  ],sources=[];
  for(const [name,sha]of files) {
    const path=resolve(root,'tools/toom/source',name);
    if(!existsSync(path)) {
      const r=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${revision}/linuxdoom-1.10/${name}`);
      assert(r.ok);writeFileSync(path,Buffer.from(await r.arrayBuffer()));
    }
    const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
    sources.push(bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''));
  }
  const {bytes:wad}=await BrainMaps();
  const lumps=WadRead(wad),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),
    states=Array.from({length:967},(_,i)=>[data.readInt32LE(32+i*28),data.readInt32LE(36+i*28)]),
    names=Array.from({length:138},(_,i)=>data.toString('ascii',32+967*28+137*92+i*4,32+967*28+137*92+i*4+4)),frames=new Map();
  const first=lumps.findIndex(l=>l.name==='S_START'),last=lumps.findIndex(l=>l.name==='S_END');
  for(let i=first+1;i<last;i++)for(let pair=4;pair<lumps[i].name.length;pair+=2) {
    const name=lumps[i].name,frame=name.charCodeAt(pair)-65,rot=Number(name[pair+1]);
    if(rot===0||rot===1)frames.set(`${name.slice(0,4)}:${frame}`,pair===4?i+1:-i-1);
  }
  const code=state=>state?frames.get(`${names[states[state][0]]}:${states[state][1]&32767}`):0,inputs=[];
  const add=(state,flash=0,x=65536,y=32*65536,light=160,extra=0,fixed=0,power=0,fuzz=0,flip=0)=>inputs.push([state,flash,x,y,light,extra,fixed,power,fuzz,flip,Math.abs(code(state)),Math.abs(code(flash))]);
  for(let state=2;state<90;state++) {
    assert(code(state));
    for(const [x,y]of [[0,32*65536],[98304,32*65536+32768],[-160*65536+1,32*65536-1],[160*65536-1,32*65536+65535],[0,128*65536]])add(state,0,x,y);
    add(state,0,65536,32*65536,160,0,0,0,49,1);
  }
  for(const state of [10,17])for(const power of [0,1,8,9,120,127,128,129,200])
    for(const fixed of [0,1,32])for(const extra of [-4,0,4])for(const light of [0,160,255])
      add(state,0,65536,32*65536+32768,light,extra,fixed,power,(power+light)%50);
  for(const [weapon,flash]of [[14,17],[22,30],[37,47],[52,55],[61,63],[77,79],[84,88]])
    for(const power of [0,8,129])add(weapon,flash,65536,32*65536,160,0,0,power,49);
  add(0);
  const fuzz=/int\s+fuzzoffset\[FUZZTABLE\]\s*=\s*\{[^}]+\};/.exec(sources[1]);assert(fuzz);
  const funcs=[...['R_DrawColumn','R_DrawFuzzColumn'].map(n=>EnemyFunction(sources[1],n)),
    ...['R_DrawMaskedColumn','R_DrawVisSprite','R_DrawPSprite','R_DrawPlayerSprites'].map(n=>EnemyFunction(sources[0],n))].join('\n');
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define SCREENWIDTH 320
#define SCREENHEIGHT 168
#define FRACUNIT 65536
#define FRACBITS 16
#define FUZZTABLE 50
#define FUZZOFF 320
#define BASEYCENTER 100
#define NUMPSPRITES 2
#define LIGHTSEGSHIFT 4
#define LIGHTLEVELS 16
#define MAXLIGHTSCALE 48
#define FF_FULLBRIGHT 32768
#define FF_FRAMEMASK 32767
#define MF_TRANSLATION 0xC000000
#define MF_TRANSSHIFT 26
#define PU_CACHE 0
#define pw_invisibility 2
#define SHORT(x) (x)
#define LONG(x) (x)
typedef uint8_t byte;
typedef int boolean;
typedef int32_t fixed_t;
typedef byte lighttable_t;
typedef struct {byte topdelta,length,unused;} column_t;
typedef struct {short width,height,leftoffset,topoffset;int columnofs[1];} patch_t;
typedef struct {int lump[8],flip[8];} spriteframe_t;
typedef struct {int numframes;spriteframe_t *spriteframes;} spritedef_t;
typedef struct {int sprite,frame;} state_t;
typedef struct {state_t *state;int tics;fixed_t sx,sy;} pspdef_t;
typedef struct {int lightlevel;} sector_t;
typedef struct {sector_t *sector;} subsector_t;
typedef struct {subsector_t *subsector;} mobj_t;
typedef struct {mobj_t *mo;int powers[6];pspdef_t psprites[2];} player_t;
typedef struct {int x1,x2,mobjflags;fixed_t texturemid,scale,xiscale,startfrac;int patch;lighttable_t *colormap;} vissprite_t;
byte pixels[SCREENWIDTH*SCREENHEIGHT],*ylookup[SCREENHEIGHT],*colormaps,*dc_colormap,*dc_source,*dc_translation,*translationtables;
int columnofs[SCREENWIDTH],dc_x,dc_yl,dc_yh,centery=84,viewwidth=320,viewheight=168,detailshift,firstspritelump,extralight,fuzzpos;
fixed_t dc_iscale,dc_texturemid,spryscale,sprtopscreen,centeryfrac=84*FRACUNIT,centerxfrac=160*FRACUNIT,pspritescale=FRACUNIT,pspriteiscale=FRACUNIT;
fixed_t spriteoffset[2],spritewidth[2],spritetopoffset[2];
short *mfloorclip,*mceilingclip,negonearray[SCREENWIDTH],screenheightarray[SCREENWIDTH];
lighttable_t *scalelight[16][48],**spritelights,*fixedcolormap;
spriteframe_t frames[2];spritedef_t sprites[2];state_t states[2];player_t player,*viewplayer=&player;
sector_t sector;subsector_t subsector={&sector};mobj_t actor={&subsector};patch_t *patches[2];
void R_DrawColumn(void);void R_DrawFuzzColumn(void);
void (*colfunc)(void)=R_DrawColumn,(*basecolfunc)(void)=R_DrawColumn,(*fuzzcolfunc)(void)=R_DrawFuzzColumn;
void R_DrawTranslatedColumn(void){abort();}
void *W_CacheLumpNum(int n,int tag){(void)tag;if(n<0||n>=2)abort();return patches[n];}
fixed_t FixedMul(fixed_t a,fixed_t b){return (int64_t)a*b>>16;}
${fuzz[0]}
${funcs}
int main(int argc,char **argv){FILE *f;byte *wad;long size;int i,j,k,n,off,width,height,left,top,frame,code[2],state[2],sx,sy,light,extra,fixed,power,start,flip,zero;uint32_t hash;
 if(argc!=2)abort();f=fopen(argv[1],"rb");if(!f)abort();fseek(f,0,SEEK_END);size=ftell(f);rewind(f);wad=malloc(size);if(fread(wad,1,size,f)!=(size_t)size)abort();fclose(f);
 for(i=0;i<168;i++)ylookup[i]=pixels+i*320;for(i=0;i<320;i++){columnofs[i]=i;negonearray[i]=-1;screenheightarray[i]=168;}
 player.mo=&actor;
 while(scanf("%d %d %d %d %d %d %d %d %d %d %d",&state[0],&state[1],&sx,&sy,&light,&extra,&fixed,&power,&start,&flip,&off)==11){
  colormaps=wad+off;
  for(j=0;j<2;j++){if(scanf("%d %d %d",&code[j],&off,&frame)!=3)abort();patches[j]=(patch_t*)(wad+off);states[j].sprite=j;states[j].frame=frame&32768;frames[j].lump[0]=j;frames[j].flip[0]=flip;sprites[j].numframes=1;sprites[j].spriteframes=&frames[j];spriteoffset[j]=patches[j]->leftoffset*FRACUNIT;spritewidth[j]=patches[j]->width*FRACUNIT;spritetopoffset[j]=patches[j]->topoffset*FRACUNIT;player.psprites[j].state=state[j]?&states[j]:NULL;player.psprites[j].sx=sx;player.psprites[j].sy=sy;}
  for(i=0;i<16;i++)for(j=0;j<48;j++){n=(15-i)*4-j/2;if(n<0)n=0;if(n>31)n=31;scalelight[i][j]=colormaps+n*256;}
  sector.lightlevel=light;extralight=extra;fixedcolormap=fixed?colormaps+fixed*256:NULL;player.powers[pw_invisibility]=power;fuzzpos=start;
  for(i=0;i<320*168;i++)pixels[i]=(i*37+i/320*11)&255;
  R_DrawPlayerSprites();hash=2166136261U;for(i=0;i<320*168;i++)hash=(hash^pixels[i])*16777619U;
  printf("%u %d\\n",hash,fuzzpos);
 }
 free(wad);return 0;
}`;
  const colormap=lumps.find(l=>l.name==='COLORMAP');assert(colormap);
  const input=inputs.map(r=>[...r.slice(0,10),colormap.start,...[0,1].flatMap(j=>{const n=r[10+j]||Math.abs(code(10));return [n,lumps[n-1].start,states[r[j]||10][1]];})].join(' ')).join('\n')+'\n';
  const work=mkdtempSync(join(tmpdir(),'toom-overlay-'));
  try {
    writeFileSync(join(work,'ref.c'),c);writeFileSync(join(work,'freedoom.wad'),wad);
    execFileSync('cc',['-std=c99','-O2',join(work,'ref.c'),'-o',join(work,'ref')]);
    const out=execFileSync(join(work,'ref'),[join(work,'freedoom.wad')],{input,encoding:'utf8',maxBuffer:4*1024*1024});
    const rows=out.trim().split('\n').map((line,i)=>[...inputs[i],...line.split(' ').map(Number)]);
    assert.equal(rows.length,inputs.length);assert(rows.every(r=>r.length===14));
    return {rows,reference:{revision,files:files.map(([name,sha256])=>({path:'linuxdoom-1.10/'+name,sha256})),functions:['R_DrawPlayerSprites','R_DrawPSprite','R_DrawVisSprite','R_DrawMaskedColumn','R_DrawColumn','R_DrawFuzzColumn'],view:[320,168],scope:'Original column/overlay renderer at unit horizontal and vertical scale, using official Freedoom patches and COLORMAP; hardware/display, wall geometry and actor sorting are outside this witness.'}};
  } finally {rmSync(work,{recursive:true,force:true});}
}
