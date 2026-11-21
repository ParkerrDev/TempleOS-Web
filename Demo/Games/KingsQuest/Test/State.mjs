// Stock TempleOS regression for sprite underlays and save/restore during movement.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {QemuRun} from '../../../../hemu/holyc-wasm/tests/oracle/Qemu.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const modules=['Graphics','Runtime','Rooms','Actors','Main'];
const files=modules.map(n=>({name:n.toUpperCase()+'.HC',bytes:readFileSync(root+n+'.HC')}));
for(const n of readdirSync(root+'Data').filter(n=>n.endsWith('.BIN')))
  files.push({name:n,bytes:readFileSync(root+'Data/'+n)});
const source=`Cd("C:/ORACLE");;
DirMk("Data");Copy("*.BIN","Data");;
`+modules.map(n=>`#include "${n.toUpperCase()}"`).join('\n')+`
I64 BackHash()
{
  I64 i;
  U32 h=2166136261;
  for (i=0;i<KQ_PIXELS;i++) h=(h^kq_pic[i])*16777619;
  for (i=0;i<KQ_PIXELS;i++) h=(h^kq_pri[i])*16777619;
  return h;
}
U0 Require(Bool ok,U8 *name)
{
  if (!ok) {"FAIL %s\\n",name;throw('KqState');}
  "PASS %s\\n",name;
}
U0 StateTest()
{
  I64 before,stamp,n,i;
  KqActor saved,after;
  kq_words=FileRead("Data/WORDS.BIN",&n);
  kq_frame=DCNew(640,336);KqReset;KqUnderClear;
  MemSet(kq_pic,3,KQ_PIXELS);MemSet(kq_pri,1,KQ_PIXELS);
  before=BackHash;
  KqAction(2,34);KqAction(25,34,50,140);KqAction(38,34,0,0);
  stamp=BackHash;
  Require(before!=stamp,"stamp changes background");
  KqSave(FALSE);KqAction(12,34);
  Require(BackHash==before,"removal restores background");
  KqSave(TRUE);
  Require(BackHash==stamp && kq_under[34].data!=NULL,"save restores stamped underlay");
  KqAction(39,34,0,0);
  Require(BackHash==before,"activation restores underlay");
  KqAction(57,34);
  Require(BackHash==stamp && !kq_actor[34].visible,"stop stamps current cel");
  for (i=0;i<111;i++) kq_actor[i].visible=FALSE;
  KqActorSet(0,0);
  kq_actor[0].visible=TRUE;kq_actor[0].x=20;kq_actor[0].y=120;
  kq_actor[0].target_x=60;kq_actor[0].target_y=120;
  kq_actor[0].mode=14;kq_actor[0].delay=0;
  kq_actor[0].step_x=1;kq_actor[0].step_y=1;
  kq_var[8]=0;kq_control=FALSE;
  for (i=0;i<3;i++) KqActorTick(0);
  MemCpy(&saved,&kq_actor[0],sizeof(KqActor));KqSave(FALSE);
  for (i=0;i<15;i++) KqActorTick(0);
  MemCpy(&after,&kq_actor[0],sizeof(KqActor));
  Require(after.x>saved.x,"actor advances after save");
  KqSave(TRUE);
  Require(!MemCmp(&saved,&kq_actor[0],sizeof(KqActor)),"restore movement state");
  for (i=0;i<15;i++) KqActorTick(0);
  Require(!MemCmp(&after,&kq_actor[0],sizeof(KqActor)),"resume identical movement");
  KqAction(12,34);
  Require(BackHash==before,"restored underlay remains removable");
  KqUnderClear;
  "STATE PASS\\n";
}
StateTest;
`;
const result=await QemuRun([source],{files,timeout:180});
if(process.env.KQ_EVIDENCE)writeFileSync(process.env.KQ_EVIDENCE,JSON.stringify(result));
assert.equal(result.results?.[0]?.except,'','Stock TempleOS exception');
const output=result.results?.[0]?.out??'';
assert.match(output,/STATE PASS/);
assert.doesNotMatch(output,/FAIL /);
console.log(JSON.stringify({engine:'TempleOS V5.03',backend:result.backend,evidence:result.evidence,output:output.slice(output.indexOf('PASS stamp'))}));
