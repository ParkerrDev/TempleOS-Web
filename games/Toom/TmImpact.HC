Actor *ImpactNew(Motion *tmpm,I64 x,I64 y,I64 z,I64 damage,
	Bool blood,Bool punch=FALSE)
{
  World *tmpw=tmpm->world;
  Actor *tmpa;
  I64 type=TM_MT_PUFF,state=0;
  z+=WorldRandDiff(tmpw)*1024;
  if (blood) type=TM_MT_BLOOD;
  tmpa=WorldSpawn(tmpw,type,x,y,z);
  tmpa->vz=65536;
  if (blood) tmpa->vz*=2;
  tmpa->tics=MaxI64(tmpa->tics-WorldRand(tmpw)&3,1);
  if (blood) {
    if (9<=damage<=12) state=TM_S_BLOOD2;
    else if (damage<9) state=TM_S_BLOOD3;
  } else if (punch)
    state=TM_S_PUFF3;
  if (state) ActorState(tmpw->data,tmpa,state,tmpm->action);
  return tmpa;
}

U0 AttackApply(Motion *tmpm,Attack *trace,Actor *source,I64 damage,
	U0 (*special)(Actor *source,I64 line)=NULL)
{//Snapshot query results before line actions can issue another attack.
  World *tmpw=tmpm->world;
  I64 n=trace->special_cnt,i,*lines,kind=trace->kind,id=trace->target,
	x=trace->x,y=trace->y,z=trace->z,range=trace->range;
  Actor *target;
  if (trace->world!=tmpw || !(0<=damage<=0x7FFFFFFF)) throw('Attack');
  if (special && n) {
    lines=MAlloc(n*sizeof(I64));
    MemCpy(lines,trace->special,n*sizeof(I64));
    try {
      for (i=0;i<n;i++) (*special)(source,lines[i]);
    } catch {
      Free(lines);
    }
    Free(lines);
  }
  if (kind==TM_HIT_WALL)
    ImpactNew(tmpm,x,y,z,damage,FALSE,range==64*65536);
  else if (kind==TM_HIT_ACTOR)
    if (target=WorldActorGet(tmpw,id)) {
      ImpactNew(tmpm,x,y,z,damage,!(target->flags&TM_MF_NOBLOOD),
	    range==64*65536);
      if (damage) ActorDamage(tmpm,target,source,source,damage);
    }
}

U0 MissileStart(Motion *tmpm,Actor *tmpa)
{//The initial half-step uses the same atomic position and block-link update.
  tmpa->tics=MaxI64(tmpa->tics-WorldRand(tmpm->world)&3,1);
  tmpa->z+=tmpa->vz>>1;
  if (!WorldTryMove(tmpm->world,tmpa,tmpa->x+tmpa->vx>>1,
	tmpa->y+tmpa->vy>>1,tmpm->touch,tmpm->cross) && tmpa->active)
    MissileExplode(tmpm,tmpa);
}

Actor *MissileNew(Motion *tmpm,Actor *source,I64 type,I64 angle,I64 slope)
{
  World *tmpw=tmpm->world;
  ActorInfo *info;
  Actor *tmpa;
  if (!(0<=type<TM_ACTOR_NUM)) throw('Missile');
  info=tmpw->data->info+type;
  if (!(info->flags&TM_MF_MISSILE) || info->speed<=0) throw('Missile');
  tmpa=WorldSpawn(tmpw,type,source->x,source->y,source->z+32*65536);
  if (tmpm->sound && info->see_snd) (*tmpm->sound)(tmpa,info->see_snd);
  tmpa->target=source->id; tmpa->angle=angle&0xFFFFFFFF;
  tmpa->vx=FixedMul(info->speed,AngleCos(tmpw->data,angle));
  tmpa->vy=FixedMul(info->speed,AngleSin(tmpw->data,angle));
  tmpa->vz=FixedMul(info->speed,slope);
  MissileStart(tmpm,tmpa);
  return tmpa;
}

Actor *PlayerMissileNew(Motion *tmpm,Attack *trace,Actor *source,I64 type)
{
  I64 angle=source->angle,slope=0;
  if (!AttackAim(trace,source,angle,1024*65536)) {
    angle+=1<<26;
    if (!AttackAim(trace,source,angle,1024*65536)) {
      angle-=2<<26;
      AttackAim(trace,source,angle,1024*65536);
    }
  }
  if (trace->target) slope=trace->slope;
  else angle=source->angle;
  return MissileNew(tmpm,source,type,angle,slope);
}
