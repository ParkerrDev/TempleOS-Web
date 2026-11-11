I64 tm_motion_cnt=0,tm_motion_done=0,tm_motion_snd=0,tm_motion_action=0;
Bool tm_motion_remove=FALSE;

U0 TmMotionSnd(Actor *tmpa,I64 n)
{
  if (!tmpa->active || !(0<n<TM_SND_NUM)) throw('Sound');
  tm_motion_snd=n;
}

U0 TmMotionAction(Actor *tmpa,I64 n)
{
  if (!(0<n<TM_ACTION_NUM)) throw('Action');
  tm_motion_action=n;
  if (tm_motion_remove) tmpa->active=FALSE;
}

U0 TmMotionRst(Motion *tmpm,Actor *tmpa)
{
  tmpa->flags=tmpm->world->data->info[tmpa->type].flags|TM_MF_NOCLIP;
  WorldTryMove(tmpm->world,tmpa,0,0);
  tmpa->flags&=~TM_MF_NOCLIP;
  tmpa->vx=tmpa->vy=tmpa->vz=0; tmpa->z=0;
  tmpa->floor=0; tmpa->ceil=128*65536; tmpa->target=0;
  tmpm->player->forward=tmpm->player->side=0;
  tmpm->player->view_height=TM_EYE_HEIGHT;
  tmpm->player->delta_view_height=0; tmpm->player->no_momentum=FALSE;
}

U0 TmMotionXY(Motion *tmpm,Actor *tmpa)
{
  I64 i,j,v,expected;
  for (i=-1;i<=1;i+=2)
    for (j=0;j<4;j++) {
      TmMotionRst(tmpm,tmpa);
      v=i*(15*65536+j*65536+1); tmpa->vx=v; tmpa->vy=-v;
      ActorXY(tmpm,tmpa);
      if (tmpa->x!=v || tmpa->y!=-v ||
	    tmpa->vx!=FixedMul(v,TM_FRICTION) ||
	    tmpa->vy!=FixedMul(-v,TM_FRICTION)) throw('Substep');
      tm_motion_cnt++;
    }
  TmMotionRst(tmpm,tmpa);
  tmpa->vx=100*65536; tmpa->vy=-100*65536; ActorXY(tmpm,tmpa);
  if (tmpa->x!=TM_MOVE_MAX || tmpa->y!=-TM_MOVE_MAX ||
	tmpa->vx!=TM_MOVE_MAX*29/32 || tmpa->vy!=-TM_MOVE_MAX*29/32)
    throw('Limit');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  tmpa->vx=4095; tmpa->vy=-4095; tmpa->state=TM_S_PLAY_RUN3;
  ActorXY(tmpm,tmpa);
  if (tmpa->vx || tmpa->vy || tmpa->state!=TM_S_PLAY) throw('Stop');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  tmpa->vx=4095; tmpm->player->forward=1; ActorXY(tmpm,tmpa);
  if (tmpa->vx!=3711) throw('Forward');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  tmpa->vx=4096; ActorXY(tmpm,tmpa);
  if (tmpa->vx!=3712) throw('StopEdge');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  tmpa->vx=65536; tmpa->z=1; ActorXY(tmpm,tmpa);
  if (tmpa->vx!=65536) throw('Air');
  tm_motion_cnt++;
  tmpm->player->no_momentum=TRUE; ActorXY(tmpm,tmpa);
  if (tmpa->vx || tmpa->vy) throw('NoMom');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  WorldTryMove(tmpm->world,tmpa,-8*65536,0);
  tmpm->world->map->sector[0].floor=1*65536;
  tmpa->flags|=TM_MF_CORPSE; tmpa->floor=tmpa->z=65536;
  tmpa->vx=16385; ActorXY(tmpm,tmpa);
  if (tmpa->vx!=16385) throw('Corpse');
  tmpm->world->map->sector[0].floor=0;
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  tmpa->vx=65536; expected=0;
  for (i=0;i<100;i++) {
    expected+=tmpa->vx;
    ActorXY(tmpm,tmpa);
    if (tmpa->x!=expected) throw('Drift');
  }
  if (tmpa->vx || tmpa->vy || expected!=662473) throw('Friction');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa);
  WorldTryMove(tmpm->world,tmpa,100*65536,0);
  tmpa->vx=20*65536; tmpa->vy=10*65536; ActorXY(tmpm,tmpa);
  if (tmpa->x!=7319550 || tmpa->y!=645120 || tmpa->vx ||
	tmpa->vy!=237568) throw('Slide');
  tm_motion_cnt++;
}

U0 TmMotionZ(Motion *tmpm,Actor *tmpa)
{
  I64 i,expect_z=20*65536,expect_v=0;
  TmMotionRst(tmpm,tmpa); tmpa->z=expect_z;
  for (i=0;i<8;i++) {
    expect_z+=expect_v;
    if (expect_z<=0) {expect_z=expect_v=0;}
    else if (!expect_v) expect_v=-2*65536;
    else expect_v-=65536;
    ActorZ(tmpm,tmpa);
    if (tmpa->z!=expect_z || tmpa->vz!=expect_v) throw('Gravity');
  }
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa); tmpa->floor=24*65536;
  ActorZ(tmpm,tmpa);
  if (tmpa->z!=24*65536 || tmpa->vz ||
	tmpm->player->view_height!=17*65536 ||
	tmpm->player->delta_view_height!=3*65536) throw('ViewStep');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa); tmpa->z=4*65536; tmpa->vz=-9*65536;
  tm_motion_snd=0; ActorZ(tmpm,tmpa);
  if (tmpa->z || tmpa->vz || tmpm->player->delta_view_height!=-73728 ||
	tm_motion_snd!=TM_SFX_OOF) throw('Land');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa); tmpa->z=4*65536; tmpa->vz=-8*65536;
  tm_motion_snd=0; ActorZ(tmpm,tmpa);
  if (tm_motion_snd || tmpm->player->delta_view_height) throw('SoftLand');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa); tmpa->z=70*65536; tmpa->vz=8*65536;
  ActorZ(tmpm,tmpa);
  if (tmpa->z!=72*65536 || tmpa->vz) throw('Ceiling');
  tm_motion_cnt++;
  TmMotionRst(tmpm,tmpa); tmpa->flags|=TM_MF_NOGRAVITY;
  tmpa->z=10*65536; tmpa->vz=65536; ActorZ(tmpm,tmpa);
  if (tmpa->z!=11*65536 || tmpa->vz!=65536) throw('NoGrav');
  tm_motion_cnt++;
}

U0 TmMotionActors(Motion *tmpm,Actor *player)
{
  World *tmpw=tmpm->world;
  Actor *tmpa,*target;
  I64 old_random,expect_tics;
  TmMotionRst(tmpm,player);
  player->flags&=~TM_MF_SOLID;
  tmpa=WorldSpawn(tmpw,TM_MT_TROOP,100*65536,0);
  tmpa->vx=30*65536; tmpa->vy=5*65536; ActorXY(tmpm,tmpa);
  if (tmpa->vx || tmpa->vy || tmpa->x!=100*65536 || tmpa->y)
    throw('Monster');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  tmpa=WorldSpawn(tmpw,TM_MT_SKULL,0,0);
  tmpa->flags|=TM_MF_SKULLFLY; tmpa->vz=65536; ActorXY(tmpm,tmpa);
  if (tmpa->flags&TM_MF_SKULLFLY || tmpa->vx || tmpa->vy || tmpa->vz ||
	tmpa->state!=tmpw->data->info[TM_MT_SKULL].spawn) throw('Skull');
  tm_motion_cnt++;
  tmpa->flags|=TM_MF_SKULLFLY; tmpa->z=65536; tmpa->vz=-2*65536;
  ActorZ(tmpm,tmpa);
  if (tmpa->z || tmpa->vz!=2*65536) throw('Bounce');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  target=WorldSpawn(tmpw,TM_MT_TROOP,32*65536,0,64*65536);
  tmpa=WorldSpawn(tmpw,TM_MT_HEAD,0,0,32*65536); tmpa->target=target->id;
  ActorZ(tmpm,tmpa);
  if (tmpa->z!=36*65536) throw('FloatUp');
  tm_motion_cnt++;
  target->z=0; tmpa->z=64*65536; ActorZ(tmpm,tmpa);
  if (tmpa->z!=60*65536) throw('FloatDn');
  tm_motion_cnt++;
  tmpa->flags|=TM_MF_INFLOAT; ActorZ(tmpm,tmpa);
  if (tmpa->z!=60*65536) throw('InFloat');
  tm_motion_cnt++;
  tmpa->flags&=~TM_MF_INFLOAT; WorldRemove(tmpw,target); ActorZ(tmpm,tmpa);
  if (tmpa->z!=60*65536) throw('Stale');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  tmpa=WorldSpawn(tmpw,TM_MT_ROCKET,100*65536,0,32*65536);
  tmpa->vx=30*65536; old_random=tmpw->random;
  expect_tics=tmpw->data->state[tmpw->data->info[tmpa->type].death].tics;
  expect_tics=MaxI64(expect_tics-GameRand(tmpw->data,&old_random)&3,1);
  tm_motion_snd=tm_motion_action=0; ActorXY(tmpm,tmpa);
  if (tmpa->flags&TM_MF_MISSILE || tmpa->vx || tmpa->vy || tmpa->vz ||
	tmpa->tics!=expect_tics || tmpw->random!=old_random ||
	tm_motion_snd!=TM_SFX_BAREXP || tm_motion_action!=TM_A_EXPLODE)
    throw('Explode');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  tmpa=WorldSpawn(tmpw,TM_MT_ROCKET,0,0,65536); tmpa->vz=-2*65536;
  ActorZ(tmpm,tmpa);
  if (tmpa->flags&TM_MF_MISSILE || tmpa->vz || tmpa->z) throw('FloorHit');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  tmpa=WorldSpawn(tmpw,TM_MT_ROCKET,0,0,120*65536); tmpa->vz=2*65536;
  ActorZ(tmpm,tmpa);
  if (tmpa->flags&TM_MF_MISSILE || tmpa->vz ||
	tmpa->z!=128*65536-tmpa->height) throw('CeilHit');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  tmpa=WorldSpawn(tmpw,TM_MT_ROCKET,20*65536,0,64*65536);
  tmpw->map->sector[1].ceil=32*65536;
  StrCpy(tmpw->map->sector[1].ceil_name,"F_SKY1");
  tmpa->vx=-15*65536; old_random=tmpw->random; tm_motion_snd=0;
  ActorXY(tmpm,tmpa);
  if (tmpa->active || tmpw->random!=old_random || tm_motion_snd ||
	tmpw->collision->ceil_line!=6) throw('Sky');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
  tmpw->map->sector[1].ceil=128*65536;
  tmpa=WorldSpawn(tmpw,TM_MT_ROCKET,0,0,32*65536);
  old_random=tmpw->random; tm_motion_snd=0; tm_motion_remove=TRUE;
  MissileExplode(tmpm,tmpa); tm_motion_remove=FALSE;
  if (tmpa->active || tmpw->random!=old_random || tm_motion_snd ||
	ActorMotion(tmpm,tmpa)) throw('Removed');
  tm_motion_cnt++; WorldRemove(tmpw,tmpa);
}

U0 TmMotionTest()
{
  GameData *tmpd=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *tmpw=WorldNew(map,tmpd);
  Player player;
  Motion *tmpm=MotionNew(tmpw,&player);
  Actor *tmpa=WorldSpawn(tmpw,TM_MT_PLAYER,0,0);
  MemSet(&player,0,sizeof(Player));
  tmpw->player=tmpa->id;
  tmpm->sound=&TmMotionSnd; tmpm->action=&TmMotionAction;
  TmMotionXY(tmpm,tmpa); TmMotionZ(tmpm,tmpa); TmMotionActors(tmpm,tmpa);
  "MOTION %d CASES BAD 0\n",tm_motion_cnt;
  MotionDel(tmpm); WorldDel(tmpw); MapDel(map); GameDataDel(tmpd);
  tm_motion_done=1;
}

TmMotionTest;
