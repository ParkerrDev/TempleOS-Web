import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root,FreedoomRead} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
async function source(name) {
  const dir=resolve(root,'tools/toom/source'),meta=JSON.parse(readFileSync(resolve(dir,'story.json'))),
    file=meta.files.find(f=>f.path.endsWith('/'+name)),path=resolve(dir,name);assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/chocolate-doom/chocolate-doom/${meta.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(hash(bytes),file.sha256);
  return bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
}
function fn(original,name) {
  const m=new RegExp(`(?:char\\s*\\*|int|boolean)\\s*${name}\\s*\\([^)]*\\)\\s*\\{`).exec(original);assert(m,name);
  let at=m.index+m[0].length,depth=1;
  for(;depth&&at<original.length;at++){if(original[at]==='{')depth++;if(original[at]==='}')depth--;}
  assert.equal(depth,0);return original.slice(m.index,at);
}
export const storyKeys=[...Array.from({length:36},(_,i)=>`HUSTR_E${Math.floor(i/9)+1}M${i%9+1}`),
  ...Array.from({length:32},(_,i)=>`HUSTR_${i+1}`),
  ...['E1','E2','E3','E4','C1','C2','C3','C4','C5','C6'].map(s=>s+'TEXT'),
  ...['E1','E2','E3','E4','06','11','20','30','15','31'].map(s=>'BGFLAT'+s)];

export async function StoryReference() {
  const io=await source('deh_io.c'),main=await source('deh_main.c');
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <ctype.h>
#include <stdint.h>
typedef int boolean;
#define true 1
#define false 0
#define DEH_INPUT_FILE 0
#define DEH_INPUT_LUMP 1
typedef struct {int type,last_was_newline,linenum,input_buffer_pos,input_buffer_len,readbuffer_size;
 unsigned char *input_buffer;char *readbuffer;FILE *stream;} deh_context_t;
void IncreaseReadBuffer(deh_context_t *c){c->readbuffer_size*=2;c->readbuffer=realloc(c->readbuffer,c->readbuffer_size);if(!c->readbuffer)abort();}
${['DEH_GetCharFile','DEH_GetCharLump','DEH_GetChar','DEH_ReadLine'].map(n=>fn(io,n)).join('\n')}
${['CleanString','DEH_ParseAssignment'].map(n=>fn(main,n)).join('\n')}
static void word(uint32_t v){for(int i=0;i<4;i++)putchar((int)(v>>(8*i)&255));}
int main(void){deh_context_t ctx={0};char *line,*name,*value;int strings=0;
 ctx.type=DEH_INPUT_FILE;ctx.stream=stdin;ctx.readbuffer_size=32;ctx.readbuffer=malloc(32);
 while((line=DEH_ReadLine(&ctx,strings))){line=CleanString(line);
  if(!*line)strings=0;else if(*line!='#'){
   if(!strcasecmp(line,"[STRINGS]"))strings=1;
   else if(strings&&DEH_ParseAssignment(line,&name,&value)){
    word(strlen(name));word(strlen(value));fwrite(name,1,strlen(name),stdout);fwrite(value,1,strlen(value),stdout);
   }
  }
 }
 free(ctx.readbuffer);return 0;
}`;
  const phase2=readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad')),
    phase1=FreedoomRead(),assets=[phase1,phase2],inputs=assets.map(b=>WadRead(b).findLast(x=>x.name==='DEHACKED').bytes);
  assert.equal(hash(phase2),'a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b');
  for(const newline of ['\n','\r\n'])for(const trailing of ['',newline])for(const indent of ['','  ','\t']) {
    inputs.push(Buffer.from(['[STRINGS]','HUSTR_E1M1 = first','HUSTR_E1M1 = last\\nline\\',
      indent+' continued\\q\\\\ end  ','E1TEXT = A\\n\\',indent+'B\\n\\',indent+'\\nC',
      'BGFLATE1 = TEST','UNKNOWN = harmless','HUSTR_32 = final',
      '','[PARS]','par 1 1 0 # authored zero','par 32 100','par 1 2 123',
      '', '[STRINGS]','C6TEXT = no final linefeed'].join(newline)+trailing,'latin1'));
  }
  inputs.push(Buffer.from('[STRINGS]\nE1TEXT = \\n  \nHUSTR_1 = \\','latin1'));
  inputs.push(Buffer.from('No recognized section\n\n','latin1'));
  const scratch=mkdtempSync(join(tmpdir(),'toom-story-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-fsanitize=undefined',src,'-o',exe]);
    const cases=inputs.map(input=>{
      const out=execFileSync(exe,{input}),strings=new Map();
      for(let pos=0;pos<out.length;){
        const a=out.readUInt32LE(pos),b=out.readUInt32LE(pos+4);pos+=8;
        strings.set(out.toString('latin1',pos,pos+a),out.subarray(pos+a,pos+a+b));pos+=a+b;assert(pos<=out.length);
      }
      const pars=Array(68).fill(0);
      for(const match of input.toString('latin1').matchAll(/^par\s+(\d+)\s+(\d+)(?:[ \t]+(\d+))?/gm)) {
        const [a,b,d]=match.slice(1).map(v=>v===undefined?null:Number(v));
        if(d===null)pars[36+a-1]=b*35;else pars[(a-1)*9+b-1]=d*35;
      }
      return {input,pars,strings:storyKeys.map(k=>strings.has(k)?strings.get(k):null)};
    });
    return {cases,assets:assets.map(hash),referenceSourceSha256:hash(c)};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
