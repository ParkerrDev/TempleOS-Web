import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),meta=JSON.parse(readFileSync(resolve(root,'games/Toom/data.json')));
assert.equal(meta.format,2);
const offset=32+meta.states*28+meta.actors*92+meta.sprites*4+meta.sounds*8;
const sine=Array.from({length:10240},(_,i)=>data.readInt32LE(offset+i*4));
const angle=Array.from({length:2049},(_,i)=>data.readUInt32LE(offset+40960+i*4));
const trig=Buffer.alloc(8192*8);
for(let i=0;i<8192;i++){trig.writeInt32LE(sine[i],i*8);trig.writeInt32LE(sine[i+2048],i*8+4);}
const abs=n=>n<0n?-n:n,word=n=>Number(BigInt.asIntN(32,n));
const mul=(a,b)=>word((BigInt(a)*BigInt(b))>>16n);
const div=(a,b)=>{
  a=BigInt(a);b=BigInt(b);
  if((abs(a)>>14n)>=abs(b))return (a^b)<0n?-2147483648:2147483647;
  return Number((a*65536n)/b);
};
const direction=(x,y)=>{
  if(!x&&!y)return 0;
  const slope=(n,d)=>d<512?2048:Math.min(2048,Number((BigInt(n)<<3n)/(BigInt(d)>>8n)));
  const low=angle[slope(Math.min(Math.abs(x),Math.abs(y)),Math.max(Math.abs(x),Math.abs(y)))];
  let a;
  if(x>=0&&y>=0)a=x>y?low:0x40000000-1-low;
  else if(x<0&&y>=0)a=-x>y?0x80000000-1-low:0x40000000+low;
  else if(x<0&&y<0)a=-x>-y?0x80000000+low:0xC0000000-1-low;
  else a=x>-y?-low:0xC0000000+low;
  return a>>>0;
};
const records=[],edge=[-2147483648,-2147483647,-65537,-65536,-65535,-513,-512,-511,-1,0,1,511,512,513,65535,65536,65537,2147483646,2147483647];
for(const a of edge)for(const b of edge)records.push([a,b,mul(a,b),div(a,b),direction(a,b)]);
let random=0x29ABED30;
const next=()=>random=(Math.imul(random,1664525)+1013904223)>>>0;
for(let i=0;i<4096;i++){const a=next()|0,b=next()|0;records.push([a,b,mul(a,b),div(a,b),direction(a,b)]);}
const expected=Buffer.alloc(records.length*40);records.flat().forEach((n,i)=>expected.writeBigInt64LE(BigInt(n),i*8));
const bad=Buffer.from(data);bad.writeInt32LE(65537,offset);
const badAngles=Buffer.from(data);badAngles.writeUInt32LE(0xFFFFFFFF,offset+40960);
const source=['TmData.HH','TmState.HC','TmMath.HC'].map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+`
U0 TmMathTest()
{
  I64 i,n,a,b,bad=0,*expected=FileRead("C:/ORACLE/MATH.BIN");
  I32 *trig=FileRead("C:/ORACLE/TRIG.BIN");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!data || !expected || !trig) throw('Files');
  for (i=0;i<8192;i++)
    if (AngleSin(data,i<<19+357)!=trig[i*2] ||
          AngleCos(data,i<<19+357)!=trig[i*2+1]) throw('Trig');
  for (i=0;i<${records.length};i++) {
    n=i*5; a=expected[n]; b=expected[n+1];
    if (FixedMul(a,b)!=expected[n+2] || FixedDiv(a,b)!=expected[n+3] ||
          AngleFrom(data,a,b)!=expected[n+4]) {
      if (bad<8) "%d %d,%d MUL %d/%d DIV %d/%d ANG %d/%d\\n",i,a,b,
            FixedMul(a,b),expected[n+2],FixedDiv(a,b),expected[n+3],AngleFrom(data,a,b),expected[n+4];
      bad++;
    }
  }
  if (GameDataNew("C:/ORACLE/BADSIN.BIN") || GameDataNew("C:/ORACLE/BADANG.BIN"))
    throw('Invalid');
  "MATH ${records.length} VECTORS TRIG 16384 BAD %d\\n",bad;
  GameDataDel(data); Free(expected); Free(trig);
  if (bad) throw('Math');
}
TmMathTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'TMDATA.BIN',bytes:data},{name:'MATH.BIN',bytes:expected},{name:'TRIG.BIN',bytes:trig},
  {name:'BADSIN.BIN',bytes:bad},{name:'BADANG.BIN',bytes:badAngles}],timeout:120});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/MATH \d+ VECTORS TRIG 16384 BAD 0/);
