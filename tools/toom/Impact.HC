I64 tm_impact_cnt=0,tm_impact_done=0,tm_impact_special=0,tm_impact_sound=0;
Attack *tm_impact_trace;
Motion *tm_impact_motion;

U0 TmImpactSound(Actor *,I64 n)
{
  tm_impact_sound=n;
}

U0 TmImpactSpecial(Actor *source,I64 line)
{
  if (line!=6) throw('Line');
  tm_impact_special++;
  AttackFire(tm_impact_trace,source,0,32*65536,0);
}

U0 TmImpactThrow(Actor *,I64)
{
  throw('LineErr',TRUE);
}

U0 TmImpactContact(Actor *missile,Actor *other,I64 kind)
{
  World *world=tm_impact_motion->world;
  if (kind!=TM_CONTACT_MISSILE) throw('Contact');
  ActorDamage(tm_impact_motion,other,missile,
	WorldActorGet(world,missile->target),20);
}

U0 TmImpactTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Attack *trace=AttackNew(world);
  Actor *source=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0),*target,*effect;
  I64 i,state,before,health,random,old_id;
  Bool caught;
  if (!data) throw('Files');
  MemSet(&player,0,sizeof(Player)); PlayerBorn(&player);
  world->player=source->id;
  motion->sound=&TmImpactSound; tm_impact_trace=trace; tm_impact_motion=motion;
  for (i=0;i<5;i++) {
    world->random=0; state=TM_S_PUFF1;
    if (i<3) {
      effect=ImpactNew(motion,0,0,32*65536,8+i*4,TRUE);
      state=TM_S_BLOOD3-i;
    } else
      effect=ImpactNew(motion,0,0,32*65536,0,FALSE,i==4);
    if (i==4) state=TM_S_PUFF3;
    if (effect->state!=state || effect->z!=32*65536-103424 ||
	  world->random!=4 || effect->vx || effect->vy ||
	  i<3 && effect->vz!=2*65536 || i>=3 && effect->vz!=65536)
      throw('Effect');
    if ((i==2 || i==3) && effect->tics!=data->state[state].tics-2)
      throw('Timer');
    tm_impact_cnt++; WorldRemove(world,effect);
  }
  target=WorldSpawn(world,TM_MT_TROOP,64*65536,0); health=target->health;
  world->random=0;
  AttackFire(trace,source,0,512*65536,0);
  AttackApply(motion,trace,source,5,&TmImpactSpecial);
  effect=WorldActorGet(world,world->last);
  if (target->health!=health-5 || effect->type!=TM_MT_BLOOD ||
	effect->state!=TM_S_BLOOD3 || tm_impact_special!=1 ||
	trace->kind!=TM_HIT_NONE || !(53*65536<effect->x<55*65536))
    throw('Nested');
  tm_impact_cnt++; WorldRemove(world,effect);
  target->flags|=TM_MF_NOBLOOD;
  AttackFire(trace,source,0,512*65536,0); AttackApply(motion,trace,source,5);
  effect=WorldActorGet(world,world->last);
  if (target->health!=health-10 || effect->type!=TM_MT_PUFF) throw('NoBlood');
  tm_impact_cnt++; WorldRemove(world,effect);
  AttackFire(trace,source,0,512*65536,0); old_id=target->id;
  WorldRemove(world,target); target=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  before=world->actor_cnt; random=world->random;
  AttackApply(motion,trace,source,1000);
  if (target->id==old_id || target->health!=data->info[TM_MT_TROOP].health ||
	world->actor_cnt!=before || world->random!=random) throw('Stale');
  tm_impact_cnt++; WorldRemove(world,target);
  AttackFire(trace,source,0,512*65536,0); AttackApply(motion,trace,source,10);
  effect=WorldActorGet(world,world->last);
  if (effect->type!=TM_MT_PUFF || !(123*65536<effect->x<125*65536))
    throw('WallPuff');
  tm_impact_cnt++; WorldRemove(world,effect);
  StrCpy(map->sector[0].ceil_name,"F_SKY1");
  AttackFire(trace,source,0,512*65536,65536);
  before=world->actor_cnt; random=world->random;
  AttackApply(motion,trace,source,10);
  if (world->actor_cnt!=before || world->random!=random) throw('Sky');
  tm_impact_cnt++; map->sector[0].ceil_name[0]=0;
  AttackFire(trace,source,0,512*65536,0);
  before=Fs->data_heap->used_u8s;
  for (i=0;i<8;i++) {
    caught=FALSE;
    try {
      AttackApply(motion,trace,source,10,&TmImpactThrow);
    } catch {
      if (Fs->except_ch=='LineErr') {caught=TRUE; Fs->catch_except=TRUE;}
    }
    if (!caught || Fs->data_heap->used_u8s!=before) throw('Cleanup');
  }
  tm_impact_cnt++;
  for (i=0;i<3;i++) {
    switch (i) {
      case 0:
	state=TM_MT_ROCKET;
	break;
      case 1:
	state=TM_MT_PLASMA;
	break;
      default:
	state=TM_MT_BFG;
    }
    world->random=0; tm_impact_sound=0;
    effect=MissileNew(motion,source,state,0,0);
    if (!effect->active || !(effect->flags&TM_MF_MISSILE) ||
	  effect->target!=source->id || effect->vx!=
	  FixedMul(data->info[state].speed,65535) || effect->vz ||
	  effect->x!=source->x+effect->vx>>1 ||
	  effect->y!=source->y+effect->vy>>1 || effect->z!=32*65536 ||
	  (effect->flags&TM_MF_NOBLOCKMAP && effect->block!=-1 ||
	    !(effect->flags&TM_MF_NOBLOCKMAP) && effect->block<0) ||
	    world->random!=2 ||
	  tm_impact_sound!=data->info[state].see_snd) {
      "MISSILE %d ACTIVE %d FLAGS %X TARGET %X/%X\n",i,
	    effect->active,effect->flags,effect->target,source->id;
      "POS %d,%d,%d VEL %d,%d,%d BLOCK %d RNG %d SND %d/%d\n",
	    effect->x,effect->y,effect->z,effect->vx,effect->vy,effect->vz,
	    effect->block,world->random,tm_impact_sound,
	    data->info[state].see_snd;
      throw('Missile');
    }
    tm_impact_cnt++; WorldRemove(world,effect);
  }
  target=WorldSpawn(world,TM_MT_TROOP,64*65536,0,64*65536);
  effect=PlayerMissileNew(motion,trace,source,TM_MT_ROCKET);
  if (effect->vz<=0 || trace->target!=target->id ||
	effect->angle!=source->angle)
    throw('Aim');
  tm_impact_cnt++; WorldRemove(world,effect); WorldRemove(world,target);
  effect=PlayerMissileNew(motion,trace,source,TM_MT_ROCKET);
  if (effect->vz || effect->angle!=source->angle) throw('AimNone');
  tm_impact_cnt++; WorldRemove(world,effect);
  WorldTryMove(world,source,110*65536,0); tm_impact_sound=0;
  effect=MissileNew(motion,source,TM_MT_ROCKET,0,0);
  if (effect->flags&TM_MF_MISSILE || effect->vx || effect->vy ||
	effect->x!=source->x || tm_impact_sound!=TM_SFX_BAREXP)
    throw('Close');
  tm_impact_cnt++; WorldRemove(world,effect);
  WorldTryMove(world,source,-64*65536,0);
  target=WorldSpawn(world,TM_MT_TROOP,-24*65536,0); health=target->health;
  motion->touch=&TmImpactContact;
  effect=MissileNew(motion,source,TM_MT_ROCKET,0,0);
  if (target->health!=health-20 || effect->flags&TM_MF_MISSILE)
    throw('Contact');
  tm_impact_cnt++;
  "IMPACT %d CASES BAD 0\n",tm_impact_cnt;
  AttackDel(trace); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data); tm_impact_done=1;
}

TmImpactTest;
