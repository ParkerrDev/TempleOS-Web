import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

const palette=WadRead(FreedoomRead()).find(l=>l.name==='PLAYPAL').bytes;
const colors=Array.from({length:16},(_,i)=>{
  const bright=i&8?85:0;
  return [(i&4?170:0)+bright,(i&2?170:0)+bright,(i&1?170:0)+bright];
});
colors[6][1]=85;
const result=[];
for(let i=0;i<256;i++) {
  const rgb=[...palette.subarray(i*3,i*3+3)];
  let best=Infinity,pattern=0;
  for(let a=0;a<16;a++)for(let b=a;b<16;b++)for(let n=0;n<=4;n++) {
    const error=rgb.reduce((sum,v,k)=>{
      const d=v-(colors[a][k]*(4-n)+colors[b][k]*n)/4;
      return sum+d*d*[3,6,2][k];
    },0);
    if(error<best) {
      best=error;
      const pixels=[a,a,a,a];
      for(let k=0;k<n;k++)pixels[[0,3,1,2][k]]=b;
      pattern=pixels.reduce((v,c,k)=>v+(c<<k*8),0);
    }
  }
  result.push(pattern);
}
const source='//Freedoom PLAYPAL mapped to TempleOS 2x2 patterns at build time.\n\n'+
  'U32 tm_palette[256]={\n'+Array.from({length:Math.ceil(256/6)},(_,i)=>'  '+
    result.slice(i*6,i*6+6).map(n=>'0x'+n.toString(16).toUpperCase()).join(','))
    .join(',\n')+'};\n';
const path=resolve(root,'games/Toom/TmPal.HC');
if(process.argv.includes('--check'))assert.equal(readFileSync(path,'ascii'),source);
else writeFileSync(path,source);
console.log('Verified 256 palette patterns against the pinned Freedoom PLAYPAL.');
