import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {compileProject} from '../../../../hemu/holyc-wasm/src/project.js';
import {createTaskHost} from '../../../../hemu/holyc-wasm/src/runtime/tasks.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const modules=['Graphics','Runtime','Rooms','Actors','Main'];
const source=modules.map(n=>`#include "${n}"`).join('\n')+`
I64 Inspect(I64 n) {
 if(n==256)return kq_actor[0].x;
 if(n==257)return kq_actor[0].y;
 if(n==258)return kq_game_over;
 if(n==259)return kq_dir;
 if(n==260)return kq_control;
 return kq_var[n];
}
I64 Walk(I64 dir,I64 n) {
 kq_dir=dir;
 while(n--) {
 I64 i;for(i=0;i<MaxI64(1,kq_var[24]);i++)KqSoundTick;
 KqTick;
 }
 return kq_var[1];
}
U0 Command(U8 *st) {KqParse(st);}
I64 TestWalk(I64 x,I64 y) {
 //Probe collision without changing the actor or retaining contact flags.
 I64 a=kq_var[4],b=kq_var[5],c=kq_var[6],ok;
 if(x<2 || x>152 || y<40 || y>165)return 0;
 ok=KqWalk(0,x,y);
 if(kq_var[4] && (kq_var[1]==1 || kq_var[1]==2 || kq_var[1]==25 || 66<=kq_var[1]<=69 || kq_var[5]==1 || kq_var[5]==3 || kq_var[5]==9 || kq_var[5]==11))ok=0;
 kq_var[4]=a;kq_var[5]=b;kq_var[6]=c;
 return ok;
}
I64 GetMsgPtr() {return kq_messages;}
U0 Boot() {
 I64 n;
 Seed(12345);Cd("C:/Game");kq_words=FileRead("Data/WORDS.BIN",&n);
 kq_frame=DCNew(640,336);KqReset;
}
Boot;
`;
const result=compileProject({source,filename:'Test.HC',files:modules.map(n=>({path:n+'.HC',source:readFileSync(root+n+'.HC','utf8')})),exports:['Inspect','Walk','Command','MAlloc','Free','GetMsgPtr','TestWalk']});
if(result.compileError)throw Error(result.compileError);
const files=readdirSync(root+'Data').filter(n=>n.endsWith('.BIN')).map(n=>({path:'C:/Game/Data/'+n,bytes:readFileSync(root+'Data/'+n)}));
const host=createTaskHost({files,gfx:{width:640,height:480,indices:new Uint8Array(640*480),palette(){},flip(){}},onText:()=>{},ansi:false});
const {instance}=await WebAssembly.instantiate(result.bytes,{env:host.env});host.attach(instance);await host.run();
const f=instance.exports;
const state=()=>[1,256,257,258,259,260].map(n=>Number(f.Inspect(BigInt(n))));
const trace=[];
function cmd(s){trace.push({cmd:s});const p=f.MAlloc(BigInt(s.length+1),0n);const b=new Uint8Array(f.memory.buffer);b.set(Buffer.from(s),Number(p));b[Number(p)+s.length]=0;f.Command(p);f.Free(p);}
const walk=(d,n=1)=>{
 const last=trace.at(-1);
 if(last?.walk===d)last.n+=n;else trace.push({walk:d,n});
 f.Walk(BigInt(d),BigInt(n));return state();};
function messages(){const p=Number(f.GetMsgPtr());return Buffer.from(f.memory.buffer,p,648).toString('latin1').split('\0').filter(Boolean);}



const dirs=[[0,0],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
function go(tx,ty){
 let [room,x,y]=state(),steps=0;
 for(let retry=0;retry<10;retry++){
  const seen=new Int32Array(160*168).fill(-1),from=new Int32Array(160*168).fill(-1),q=[y*160+x];seen[y*160+x]=0;
  let at=0,end=ty*160+tx;
  while(at<q.length&&seen[end]<0){
   const i=q[at++],xx=i%160,yy=Math.floor(i/160);
   for(let d=1;d<=8;d++){
    const a=xx+dirs[d][0],b=yy+dirs[d][1],j=b*160+a;
    if(a<2||a>152||b<40||b>165||seen[j]>=0)continue;
    if(!f.TestWalk(BigInt(a),BigInt(b)))continue;
    seen[j]=d;from[j]=i;q.push(j);
   }
  }
  if(seen[end]<0)throw Error('No floor path: '+JSON.stringify({room,x,y,tx,ty,visited:q.length}));
  const path=[];for(let i=end;from[i]>=0;i=from[i])path.push(seen[i]);path.reverse();
  let stuck=false;
  for(const d of path){
   const old=state();walk(d,1);steps++;[room,x,y]=state();
   if(Number(f.Inspect(178n))==6)return {state:state(),won:true};
   if(state()[3])throw Error('Died at '+state());
   if(room!==old[0])return {state:state(),steps,transition:true};
   if(x!==old[1]+dirs[d][0]||y!==old[2]+dirs[d][1]){stuck=true;break;}
  }
  if(!stuck)return {state:state(),steps};
 }
 throw Error('Repeated obstruction at '+state());
}

const flags={'get carrot':[77,1],'get dagger':[73,1],'get mirror':[64,1],
 'get key':[78,1],'get clover':[87,1],'get walnut':[88,1],
 'open walnut':[89,1],'get mushroom':[84,1],'give walnut':[89,0],
 'get shield':[65,1],'get chest':[63,1]};
const route=JSON.parse(readFileSync(new URL('Journey.json',import.meta.url)));
for(const [step,v] of route.entries()){
 try{
  if(v.cmd)cmd(v.cmd);
  if(v.walk!==undefined)walk(v.walk,v.n??1);
  if(v.go)go(...v.go);
  if(v.cmd && flags[v.cmd]){
   const [flag,value]=flags[v.cmd];
   assert.equal(Number(f.Inspect(BigInt(flag))),value,v.cmd);
   trace.push({check:[flag,value],label:v.cmd});
  }
 }catch(error){throw new Error(`Journey step ${step} ${JSON.stringify(v)}: ${error.message}; state ${state()}`);}
}
for(const n of [63,64,65])assert.equal(Number(f.Inspect(BigInt(n))),1);
assert.equal(Number(f.Inspect(178n)),6,'Graham must become king');
assert.equal(Number(f.Inspect(33n)),1,'Original ending flag');
console.log(JSON.stringify({engine:'HolyC-wasm',steps:route.length,inputs:trace.length,room:state()[0],ending:6,messages:messages()}));
if(process.argv.includes('--native')){
 const {QemuRun}=await import('../../../../hemu/holyc-wasm/tests/oracle/Qemu.mjs');
 const files=modules.map(n=>({name:n.toUpperCase()+'.HC',bytes:readFileSync(root+n+'.HC')}));
 for(const n of readdirSync(root+'Data').filter(n=>n.endsWith('.BIN')))
  files.push({name:n,bytes:readFileSync(root+'Data/'+n)});
 const prefix=`Cd("C:/ORACLE");;
DirMk("Data");Copy("*.BIN","Data");;
`+
  modules.map(n=>`#include "${n.toUpperCase()}"`).join('\n');
 const body=trace.map(v=>{
  if(v.cmd)return `StrCpy(kq_input,"${v.cmd}");KqParse(kq_input);`;
  if(v.check)return `if (kq_var[${v.check[0]}]!=${v.check[1]}) {"FAIL ${v.label} room=%d x=%d y=%d\\n",kq_var[1],kq_actor[0].x,kq_actor[0].y;throw('Journey');} "PASS ${v.label}\\n";`;
  return `KqJourneyStep(${v.walk},${v.n});`;
 }).join('\n');
 const test=prefix+`
U0 KqJourneyStep(I64 d,I64 n)
{
 I64 i;
 kq_dir=d;
 while(n--) {
  for(i=0;i<MaxI64(1,kq_var[24]);i++)KqSoundTick;
  KqTick;
 }
}
U0 KqJourney()
{
 I64 n,i;
 Seed(12345);kq_words=FileRead("Data/WORDS.BIN",&n);
 kq_frame=DCNew(640,336);KqReset;
`+body+`
 "ENDING=%d ROOM=%d TREASURES=%d,%d,%d\\n",kq_var[178],kq_var[1],kq_var[63],kq_var[64],kq_var[65];
 for(i=0;i<8;i++)"%s\\n",kq_messages[i];
}
KqJourney;
`;
 const result=await QemuRun([test],{files,timeout:600});
 if(process.env.KQ_EVIDENCE)writeFileSync(process.env.KQ_EVIDENCE,JSON.stringify(result));
 assert.equal(result.results?.[0]?.except,'','Stock TempleOS exception');
 console.log(JSON.stringify({engine:'TempleOS V5.03',backend:result.backend,evidence:result.evidence,output:result.results[0].out.slice(result.results[0].out.indexOf('PASS get carrot'))}));
 assert.match(JSON.stringify(result),/ENDING=6 ROOM=53 TREASURES=1,1,1/);
}
