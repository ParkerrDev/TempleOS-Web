import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root,FreedoomRead} from './Assets.mjs';
import {WadRead} from './Wad.mjs';
import {EnemyFunction} from './EnemyRef.mjs';
import {FinaleSource} from './FinaleRef.mjs';
import {StoryReference} from './StoryRef.mjs';

export async function CastDrawReference() {
  const original=await FinaleSource(),video=await FinaleSource('v_video.c'),story=await StoryReference(),
    wads=[FreedoomRead(),readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'))],
    data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),meta=JSON.parse(readFileSync(resolve(root,'games/Toom/data.json'))),
    hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(data),meta.sha256);assert.equal(hash(wads[1]),story.assets[1]);
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),
    order=original.match(/castinfo_t\s+castorder\[\]\s*=\s*\{[\s\S]*?\n\};/)?.[0];assert(order);
  const types=[...order.matchAll(/\{CC_\w+,\s*(MT_\w+)\}/g)].map(m=>defs['TM_'+m[1]]);assert.equal(types.length,17);
  const states=Array.from({length:meta.states},(_,i)=>Array.from({length:7},(_,j)=>data.readInt32LE(32+(i*7+j)*4))),
    spriteNames=Array.from({length:meta.sprites},(_,i)=>data.toString('ascii',32+meta.states*28+meta.actors*92+i*4,32+meta.states*28+meta.actors*92+i*4+4)),
    scenes=[];
  for(let phase=1;phase<2;phase++) {
    const lumps=WadRead(wads[phase]),first=lumps.findIndex(l=>l.name==='S_START'),last=lumps.findIndex(l=>l.name==='S_END'),frames=new Map();
    assert(first>=0&&last>first);
    for(let i=first+1;i<last;i++)for(let pair=4;pair<lumps[i].name.length;pair+=2) {
      const name=lumps[i].name,rotation=Number(name[pair+1]);
      if(rotation===0||rotation===1)frames.set(`${name.slice(0,4)}:${name.charCodeAt(pair)-65}`,pair===4?i+1:-i-1);
    }
    for(let num=0;num<types.length;num++) {
      const visited=new Set(),images=new Set(),name=story.cases[phase].strings[88+num];
      assert(name&&!name.includes(96));
      const add=(state,mirror)=>{
        const [sprite,frame]=states[state],code=frames.get(`${spriteNames[sprite]}:${frame&32767}`);
        assert(code,`phase ${phase} actor ${num} state ${state}: ${spriteNames[sprite]}:${frame&32767}`);
        scenes.push({phase,num,state,code,mirror,name,sprite,frame});
      };
      for(const col of [3,10,11,12]) {
        let state=data.readInt32LE(32+meta.states*28+(types[num]*23+col)*4);
        while(state&&!visited.has(state)) {
          visited.add(state);const key=states[state][0]+':'+(states[state][1]&32767);
          if(!images.has(key)){images.add(key);add(state,0);}
          state=states[state][4];
        }
      }
      add(data.readInt32LE(32+meta.states*28+(types[num]*23+3)*4),1);
    }
  }
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#define SCREENWIDTH 320
#define SCREENHEIGHT 200
#define HU_FONTSTART 33
#define HU_FONTSIZE 63
#define FF_FRAMEMASK 32767
#define PU_CACHE 0
#define SHORT(x) (x)
#define LONG(x) (x)
#define RANGECHECK
typedef unsigned char byte;
typedef int boolean;
typedef struct __attribute__((packed)){int16_t width,height,leftoffset,topoffset;int32_t columnofs[1];} patch_t;
typedef struct __attribute__((packed)){byte topdelta,length,pad;} column_t;
typedef struct {int lump[8],flip[8];} spriteframe_t;
typedef struct {int numframes;spriteframe_t *spriteframes;} spritedef_t;
typedef struct {int sprite,frame;} state_t;
typedef struct {char *name;int type;} castinfo_t;
byte pixels[320*200],*screens[5]={pixels},*wad;size_t wad_size;
patch_t *hu_font[HU_FONTSIZE];castinfo_t castorder[17];int castnum,firstspritelump;
state_t one,*caststate=&one;spriteframe_t frames[138][32];spritedef_t sprites[138];
static uint32_t u32(byte *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
void *W_CacheLumpNum(int n,int tag){(void)tag;if(n<0||(unsigned)n>=u32(wad+4))abort();byte *p=wad+u32(wad+8)+n*16;
 if((size_t)u32(p)+u32(p+4)>wad_size)abort();
 return wad+u32(p);}
void *W_CacheLumpName(char *name,int tag){uint32_t n=u32(wad+4),dir=u32(wad+8);char key[8]={0};
 if(strlen(name)>8)abort();
 memcpy(key,name,strlen(name));while(n--){byte *p=wad+dir+n*16;if(!memcmp(p+8,key,8))return W_CacheLumpNum(n,tag);}
 fprintf(stderr,"Missing %s\\n",name);abort();}
void V_MarkRect(int x,int y,int w,int h){(void)x;(void)y;(void)w;(void)h;}
void I_Error(char *message){fprintf(stderr,"%s\\n",message);abort();}
${['V_DrawPatch','V_DrawPatchFlipped'].map(n=>EnemyFunction(video,n)).join('\n')}
${['F_CastPrint','F_CastDrawer'].map(n=>EnemyFunction(original,n)).join('\n')}
static uint32_t word(void){byte b[4];if(fread(b,1,4,stdin)!=4)exit(0);return u32(b);}
int main(int argc,char **argv){if(argc!=3)abort();byte *wads[2];size_t sizes[2];
 for(int i=0;i<138;i++){sprites[i].numframes=32;sprites[i].spriteframes=frames[i];}
 for(int i=0;i<2;i++){FILE *f=fopen(argv[i+1],"rb");if(!f)abort();fseek(f,0,SEEK_END);sizes[i]=ftell(f);rewind(f);wads[i]=malloc(sizes[i]);if(fread(wads[i],1,sizes[i],f)!=sizes[i])abort();fclose(f);}
 for(;;){uint32_t phase=word();if(phase>1)abort();wad=wads[phase];wad_size=sizes[phase];
  castnum=word();one.sprite=word();one.frame=word();int lump=word(),flip=word(),len=word();
  char *name=malloc(len+1);if(fread(name,1,len,stdin)!=(unsigned)len)abort();name[len]=0;castorder[castnum].name=name;
  spriteframe_t *frame=&frames[one.sprite][one.frame&32767];frame->lump[0]=lump;frame->flip[0]=flip;
  for(int i=0;i<HU_FONTSIZE;i++){char font[9];snprintf(font,sizeof(font),"STCFN%03d",i+HU_FONTSTART);hu_font[i]=W_CacheLumpName(font,0);}
  memset(pixels,0,sizeof(pixels));F_CastDrawer();fwrite(pixels,1,sizeof(pixels),stdout);free(name);
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-cast-draw-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    const paths=wads.map((w,i)=>{const p=join(scratch,`phase${i}.wad`);writeFileSync(p,w);return p;});
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-unused-variable','-fsanitize=undefined',src,'-o',exe]);
    const input=scenes.map(s=>{const h=Buffer.alloc(28);[s.phase,s.num,s.sprite,s.frame,Math.abs(s.code)-1,Number(s.code<0)^s.mirror,s.name.length].forEach((n,i)=>h.writeUInt32LE(n,i*4));return Buffer.concat([h,s.name]);});
    const out=execFileSync(exe,paths,{input:Buffer.concat(input),maxBuffer:40*1024*1024});assert.equal(out.length,scenes.length*64000);
    return {wads,data,sourceSha256:hash(c),scenes:scenes.map((s,i)=>({...s,pixels:out.subarray(i*64000,(i+1)*64000)}))};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
