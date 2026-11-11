import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {SpecialReference} from './SpecialRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),reference=await SpecialReference(),constants=new Map();
for(const file of ['TmData.HH','TmDoor.HC','TmFloor.HC','TmPlat.HC','TmCeil.HC'])
  for(const m of readFileSync(resolve(game,file),'latin1').matchAll(/^#define\s+(TM_\w+)\s+(-?\d+)\s*$/gm))
    constants.set(m[1],Number(m[2]));
const value=name=>{assert(constants.has(name),name);return constants.get(name);};
const door={normal:'RAISE',close30ThenOpen:'CLOSE_OPEN',close:'CLOSE',open:'OPEN',
  blazeRaise:'BLAZE_RAISE',blazeOpen:'BLAZE_OPEN',blazeClose:'BLAZE_CLOSE'};
const floor={lowerFloor:'LOWER',lowerFloorToLowest:'LOWEST',turboLower:'TURBO_LOWER',raiseFloor:'RAISE',
  raiseFloorCrush:'CRUSH',raiseFloorTurbo:'TURBO_RAISE',raiseFloorToNearest:'NEAREST',
  raiseFloor24:'RAISE_24',raiseFloor512:'RAISE_512',raiseFloor24AndChange:'RAISE_CHANGE',
  raiseToTexture:'TEXTURE',lowerAndChange:'LOWER_CHANGE'};
const plat={perpetualRaise:'PERPETUAL',downWaitUpStay:'DOWN_WAIT_UP',raiseAndChange:'RAISE_CHANGE',
  raiseToNearestAndChange:'NEAREST_CHANGE',blazeDWUS:'BLAZE'};
const ceil={lowerToFloor:'LOWER_FLOOR',raiseToHighest:'RAISE_HIGHEST',lowerAndCrush:'LOWER_CRUSH',
  crushAndRaise:'CRUSH_RAISE',fastCrushAndRaise:'FAST',silentCrushAndRaise:'SILENT'};
function decode({name,args},side) {
  const type=(prefix,table)=>{assert(table[args[1]],args.join(','));return value(`TM_${prefix}_${table[args[1]]}`);};
  switch(name) {
    case 'EV_VerticalDoor':return [1,0,0,side];
    case 'EV_BuildStairs':assert(['build8','turbo16'].includes(args[1]));return [2,+(args[1]==='turbo16'),0,0];
    case 'EV_DoDonut':return [3,0,0,0];
    case 'EV_DoDoor':return [4,type('DOOR',door),0,0];
    case 'EV_DoFloor':return [5,type('FLOOR',floor),0,0];
    case 'EV_DoPlat':return [6,type('PLAT',plat),Number(args[2]),0];
    case 'EV_DoCeiling':return [7,type('CEIL',ceil),0,0];
    case 'EV_DoLockedDoor':return [8,type('DOOR',door),0,0];
    case 'EV_LightTurnOn':return [9,Number(args[1]),0,0];
    case 'P_ChangeSwitchTexture':return [10,Number(args[1]),0,0];
    case 'G_ExitLevel':return [11,0,0,0];
    case 'G_SecretExitLevel':return [11,1,0,0];
    case 'EV_Teleport':return [12,0,0,side];
    case 'EV_StartLightStrobing':return [13,0,0,0];
    case 'EV_TurnTagLightsOff':return [14,0,0,0];
    case 'EV_StopPlat':return [15,0,0,0];
    case 'EV_CeilingCrushStop':return [16,0,0,0];
    default:assert.fail(name);
  }
}
const data=readFileSync(resolve(game,'TMDATA.BIN')),
  types=['MT_PLAYER','MT_TROOP','MT_ROCKET','MT_PLASMA','MT_BFG','MT_TROOPSHOT','MT_HEADSHOT','MT_BRUISERSHOT','MT_TRACER'];
const records=[0];let cases=0,calls=0;
for(let event=0;event<3;event++)for(let special=0;special<=150;special++)for(const player of [0,1])
for(const side of [0,1])for(const secret of [0,1])for(const success of [0,1])for(const typeName of types) {
  const ref=reference.events[event],type=value(`TM_${typeName}`),desc=ref.cases.get(special);
  let allowed=true,after=special;
  if(!player&&(!ref.monsters.includes(special)||ref.blockedTypes.includes(typeName)))allowed=false;
  if(event===0&&(side&&!ref.backSides.includes(special)||!player&&secret))allowed=false;
  const result=+(event===0&&allowed),actions=[];
  if(allowed&&desc&&!(desc.monstersOnly&&player)) {
    for(const call of desc.calls) {
      if(call.name==='P_ChangeSwitchTexture'&&desc.conditional&&!success)continue;
      const action=decode(call,side);assert(action.every(Number.isInteger));actions.push(...action);
      if(action[0]===10&&!action[1])after=0;
    }
    if(desc.consume)after=0;
  }
  const flags=data.readInt32LE(32+967*28+type*92+21*4);
  records.push(event,special,player,side,secret,success,type,flags,result,after,actions.length/4,...actions);
  cases++;calls+=actions.length/4;
}
records[0]=cases;assert.equal(cases,65232);
const packed=Buffer.alloc(records.length*8);records.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const signatures=[
  ['DoorUse','Bool','Sectors *,Actor *actor,I64 line,I64 side',1,'0,0,side',true],
  ['FloorStairs','Bool','Sectors *,I64 line,Bool turbo=FALSE',2,'turbo,0,0'],
  ['FloorDonut','Bool','Sectors *,I64 line',3,'0,0,0'],
  ['DoorTag','Bool','Sectors *,I64 line,I64 type',4,'type,0,0'],
  ['FloorTag','Bool','Sectors *,I64 line,I64 type',5,'type,0,0'],
  ['PlatTag','Bool','Sectors *,I64 line,I64 type,I64 amount=0',6,'type,amount,0'],
  ['CeilTag','Bool','Sectors *,I64 line,I64 type',7,'type,0,0'],
  ['DoorLocked','Bool','Sectors *,Actor *actor,I64 line,I64 type',8,'type,0,0',true],
  ['LightTagOn','U0','Sectors *,I64 line,I64 bright',9,'bright,0,0'],
  ['SwitchChange','Bool','Switches *,I64 line,Bool repeat',10,'repeat,0,0'],
  ['ActorTeleport','Bool','Motion *,Actor *actor,I64 line,I64 side,Bool monsters_stomp=FALSE',12,'0,monsters_stomp,side',true],
  ['LightStrobeTag','Bool','Lights *,I64 line',13,'0,0,0'],
  ['LightTagOff','U0','Sectors *,I64 line',14,'0,0,0'],
  ['PlatStop','Bool','Sectors *,I64 line',15,'0,0,0'],
  ['CeilStop','Bool','Sectors *,I64 line',16,'0,0,0'],
];
const load=readFileSync(resolve(game,'Load.HC'),'latin1');
let source=[...load.matchAll(/#include "([^"]+)"/g)].filter(m=>!['TmSpecial','TmTick'].includes(m[1]))
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n');
source+=`
I64 tm_event_cases=0,tm_event_done=0,tm_event_calls=0,tm_probe_cnt=0,tm_probe_values[16];
Bool tm_probe_success;
Actor *tm_probe_actor;
Map *tm_probe_map;
U0 TmProbe(I64 action,I64 value,I64 amount,I64 side)
{
  if (tm_probe_cnt>=4) throw('Calls');
  tm_probe_values[tm_probe_cnt*4]=action;
  tm_probe_values[tm_probe_cnt*4+1]=value;
  tm_probe_values[tm_probe_cnt*4+2]=amount;
  tm_probe_values[tm_probe_cnt*4+3]=side; tm_probe_cnt++;
}
`;
for(const [name,result,args,id,values,actor] of signatures)source+=`
${result} TmProbe${name}(${args})
{
  if (line!=3${actor?' || actor!=tm_probe_actor':''}) throw('Args');
  ${name==='SwitchChange'?"if (tm_probe_actor->world->exit_rqst) throw('ExitOrd');":''}
  TmProbe(${id},${values});
  ${name==='SwitchChange'?'if (!repeat) tm_probe_map->line[line].special=0;':''}
  ${result==='Bool'?'return tm_probe_success;':''}
}
`;
source+='\n'+signatures.map(([name])=>`#define ${name} TmProbe${name}`).join('\n')+'\n'+
  readFileSync(resolve(game,'TmSpecial.HC'),'latin1')+'\n';
source+=`
U0 TmEventsTest()
{
  I64 *body,*row,size,i,j,n,result;
  Map map;
  Line lines[4];
  World world;
  Motion motion;
  Player player;
  Actor actor;
  Sectors sectors;
  Specials specials;
  MemSet(&map,0,sizeof(Map)); MemSet(lines,0,sizeof(lines));
  MemSet(&world,0,sizeof(World)); MemSet(&motion,0,sizeof(Motion));
  MemSet(&player,0,sizeof(Player)); MemSet(&actor,0,sizeof(Actor));
  MemSet(&sectors,0,sizeof(Sectors)); MemSet(&specials,0,sizeof(Specials));
  map.line=lines; map.line_cnt=4; world.map=&map;
  motion.world=&world; motion.player=&player; actor.world=&world; actor.id=1;
  actor.active=TRUE; sectors.motion=&motion; specials.sectors=&sectors;
  tm_probe_actor=&actor; tm_probe_map=&map;
  body=FileRead("C:/ORACLE/EVENTS.BIN",&size); row=body+1;
  if (!body) throw('Files');
  for (i=0;i<body[0];i++) {
    lines[3].special=row[1]; world.player=row[2]; lines[3].flags=4|row[4]*32;
    tm_probe_success=row[5]; actor.type=row[6]; actor.flags=row[7];
    tm_probe_cnt=0; result=0; world.exit_rqst=0;
    switch (row[0]) {
      case 0: result=LineUse(&specials,&actor,3,row[3]); break;
      case 1: LineCross(&specials,&actor,3,row[3]); break;
      case 2: LineShoot(&specials,&actor,3); break;
    }
    if (world.exit_rqst) TmProbe(11,world.exit_rqst-TM_EXIT_NORMAL,0,0);
    if (result!=row[8] || lines[3].special!=row[9] || tm_probe_cnt!=row[10]) {
      "EVENT %d KIND %d SPECIAL %d PLAYER %d SIDE %d SECRET %d OK %d TYPE %d\\n",
            i,row[0],row[1],row[2],row[3],row[4],row[5],row[6];
      "GOT %d %d %d EXPECT %d %d %d\\n",result,lines[3].special,tm_probe_cnt,
            row[8],row[9],row[10];
      throw('Dispatch');
    }
    n=row[10]; row+=11;
    for (j=0;j<n*4;j++)
      if (tm_probe_values[j]!=row[j]) {
        "EVENT %d ARG %d GOT %d EXPECT %d\\n",i,j,tm_probe_values[j],row[j];
        throw('Argument');
      }
    row+=n*4; tm_event_cases++; tm_event_calls+=n;
  }
  if (row(U8 *)-body(U8 *)!=size) throw('Rows');
  Free(body); tm_event_done=1;
  "EVENTS %d CASES %d CALLS BAD 0\\n",tm_event_cases,tm_event_calls;
}
TmEventsTest;
`;
const files=[{name:'EVENTS.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`EVENTS ${cases} CASES ${calls} CALLS BAD 0`));
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
  for(const [name,n] of [['done',1],['cases',cases],['calls',calls]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_event_${name}`)),n);
  console.log(JSON.stringify({backend,cases,calls,bad:0},null,2));
}
