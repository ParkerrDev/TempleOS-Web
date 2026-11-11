import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmWorld.HC','TmContact.HC','TmMove.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n');
source+=readFileSync(resolve(root,'tools/toom/Rooms.HC'),'latin1');
source+=`
I64 tm_move_cnt,tm_cross_cnt,tm_cross[128],tm_touch_cnt;
Bool tm_reenter;
U0 TmMoveCross(Actor *actor,I64 line,I64 side)
{
  if (tm_cross_cnt>=128 || side!=1 || actor->x!=8*65536 || actor->sector)
    throw('Cross');
  tm_cross[tm_cross_cnt++]=line;
  if (tm_reenter) {
    actor->world->map->line[6].special=0;
    WorldPosition(actor->world,actor,-64*65536,0);
  }
}
U0 TmMoveThrow(Actor *,I64,I64)
{
  throw('CrossErr',TRUE);
}
U0 TmMoveTouch(Actor *,Actor *other,I64 kind)
{
  if (kind!=TM_CONTACT_PICKUP) throw('Touch');
  other->active=FALSE; tm_touch_cnt++;
}
U0 TmMoveExpect(World *world,Actor *actor,I64 x,I64 y,Bool pass)
{
  I64 old_x=actor->x,old_y=actor->y,old_sector=actor->sector,
        old_block=actor->block,old_floor=actor->floor,old_ceil=actor->ceil;
  Bool got=WorldTryMove(world,actor,x*65536,y*65536,&TmMoveTouch,&TmMoveCross);
  tm_move_cnt++;
  if (got!=pass) {
    "MOVE %d GOT %d/%d\\n",tm_move_cnt,got,pass;
    throw('Move');
  }
  if (pass) {
    if (actor->x!=x*65536 || actor->y!=y*65536 ||
          actor->block>=0 && WorldActorGet(world,world->blocks[actor->block])!=actor)
      throw('Link');
  } else if (actor->x!=old_x || actor->y!=old_y || actor->sector!=old_sector ||
        actor->block!=old_block || actor->floor!=old_floor || actor->ceil!=old_ceil)
    throw('Atomic');
}
U0 TmMovementTest()
{
  I64 flags,before;
  Bool caught=FALSE;
  Map *map=RoomsNew;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  World *world=WorldNew(map,data);
  Actor *actor=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0),*other;
  tm_move_cnt=tm_cross_cnt=tm_touch_cnt=0; tm_reenter=FALSE;
  flags=actor->flags;
  TmMoveExpect(world,actor,-32,0,TRUE);
  if (actor->sector!=1 || actor->floor || actor->ceil!=128*65536) throw('Bounds');
  TmMoveExpect(world,actor,-8,0,TRUE);
  if (tm_cross_cnt) throw('Side');
  TmMoveExpect(world,actor,8,0,TRUE);
  if (tm_cross_cnt!=3 || tm_cross[0]!=8 || tm_cross[1]!=7 || tm_cross[2]!=6)
    throw('Order');
  actor->flags|=TM_MF_TELEPORT;
  TmMoveExpect(world,actor,-64,0,TRUE);
  if (tm_cross_cnt!=3) throw('Teleport');
  actor->flags=flags;
  TmMoveExpect(world,actor,120,0,FALSE);
  if (world->collision->float_ok) throw('Solid');
  map->sector[0].floor=24;
  TmMoveExpect(world,actor,8,0,TRUE);
  if (actor->floor!=24*65536 || actor->z) throw('Step');
  actor->flags|=TM_MF_TELEPORT;
  TmMoveExpect(world,actor,-64,0,TRUE);
  actor->flags=flags; map->sector[0].floor=25;
  TmMoveExpect(world,actor,8,0,FALSE);
  if (!world->collision->float_ok) throw('Float');
  actor->flags|=TM_MF_TELEPORT;
  TmMoveExpect(world,actor,8,0,TRUE);
  TmMoveExpect(world,actor,-64,0,TRUE);
  actor->flags=flags; map->sector[0].floor=0; map->sector[0].ceil=55;
  TmMoveExpect(world,actor,8,0,FALSE);
  if (world->collision->float_ok) throw('Height');
  map->sector[0].ceil=56;
  TmMoveExpect(world,actor,8,0,TRUE);
  actor->flags|=TM_MF_TELEPORT;
  TmMoveExpect(world,actor,-64,0,TRUE);
  actor->flags=flags; map->sector[0].ceil=128;
  actor->z=73*65536;
  TmMoveExpect(world,actor,8,0,FALSE);
  if (!world->collision->float_ok) throw('Lower');
  actor->flags|=TM_MF_TELEPORT;
  TmMoveExpect(world,actor,8,0,TRUE);
  TmMoveExpect(world,actor,-64,0,TRUE);
  actor->z=0; actor->flags=flags&~TM_MF_DROPOFF;
  map->sector[0].floor=-25;
  TmMoveExpect(world,actor,8,0,FALSE);
  actor->flags|=TM_MF_FLOAT;
  TmMoveExpect(world,actor,8,0,TRUE);
  actor->flags=flags|TM_MF_TELEPORT;
  TmMoveExpect(world,actor,-64,0,TRUE);
  actor->flags=flags; map->sector[0].floor=0;
  other=WorldSpawn(world,TM_MT_TROOP,8*65536,0);
  TmMoveExpect(world,actor,8,0,FALSE);
  other->active=FALSE; WorldSweep(world);
  other=WorldSpawn(world,TM_MT_CLIP,8*65536,0);
  tm_cross_cnt=0; tm_reenter=TRUE;
  TmMoveExpect(world,actor,8,0,TRUE);
  if (tm_cross_cnt!=2 || tm_cross[0]!=8 || tm_cross[1]!=7 || tm_touch_cnt!=1 ||
        other->active) throw('Reenter');
  tm_reenter=FALSE;
  actor->flags=flags|TM_MF_NOCLIP;
  TmMoveExpect(world,actor,400,0,TRUE);
  if (actor->block!=-1 || tm_cross_cnt!=2) throw('NoClip');
  actor->flags=flags|TM_MF_TELEPORT;
  WorldTryMove(world,actor,-64*65536,0); actor->flags=flags;
  map->line[6].special=97; before=Fs->data_heap->used_u8s;
  try {
    WorldTryMove(world,actor,8*65536,0,NULL,&TmMoveThrow);
  } catch {
    if (Fs->except_ch=='CrossErr') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || Fs->data_heap->used_u8s!=before || actor->x!=8*65536)
    throw('Cleanup');
  tm_move_cnt++;
  "MOVEMENT %d CHECKS BAD 0\\n",tm_move_cnt;
  WorldDel(world); MapDel(map); GameDataDel(data);
}
TmMovementTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))}],timeout:120});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/MOVEMENT \d+ CHECKS BAD 0/);
