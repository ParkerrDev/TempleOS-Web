U0 ActorKill(Motion *tmpm,Actor *target)
{//Single-player totals include monster deaths caused by other monsters.
  World *tmpw=tmpm->world;
  Player *tmpp=MotionPlayer(tmpm,target);
  ActorInfo *info=tmpw->data->info+target->type;
  Actor *item;
  I64 state=info->death,type=-1;
  target->flags&=~(TM_MF_SHOOTABLE|TM_MF_FLOAT|TM_MF_SKULLFLY);
  if (target->type!=TM_MT_SKULL) target->flags&=~TM_MF_NOGRAVITY;
  target->flags|=TM_MF_CORPSE|TM_MF_DROPOFF;
  target->height>>=2;
  if (tmpm->player && target->flags&TM_MF_COUNTKILL) tmpm->player->kills++;
  if (tmpp) {
    target->flags&=~TM_MF_SOLID; tmpp->dead=TRUE;
  }
  if (target->health< -info->health && info->xdeath) state=info->xdeath;
  if (!ActorState(tmpw->data,target,state,tmpm->action)) return;
  target->tics=MaxI64(target->tics-GameRand(tmpw->data,&tmpw->random)&3,1);
  switch (target->type) {
    case TM_MT_WOLFSS:
    case TM_MT_POSSESSED:
      type=TM_MT_CLIP;
      break;
    case TM_MT_SHOTGUY:
      type=TM_MT_SHOTGUN;
      break;
    case TM_MT_CHAINGUY:
      type=TM_MT_CHAINGUN;
      break;
  }
  if (type>=0) {
    item=WorldSpawn(tmpw,type,target->x,target->y);
    item->flags|=TM_MF_DROPPED;
  }
}

U0 ActorDamage(Motion *tmpm,Actor *target,Actor *inflictor,Actor *source,
	I64 damage)
{//Inflictor supplies thrust; source supplies credit and the retaliation target.
  World *tmpw=tmpm->world;
  Player *tmpp=MotionPlayer(tmpm,target),*source_player=NULL;
  ActorInfo *info=tmpw->data->info+target->type;
  I64 angle,thrust,saved;
  if (!(0<=damage<=0x7FFFFFFF) || !target->active ||
	!(target->flags&TM_MF_SHOOTABLE) || target->health<=0) return;
  if (target->flags&TM_MF_SKULLFLY) target->vx=target->vy=target->vz=0;
  if (tmpp && !tmpw->skill) damage>>=1;
  if (source) source_player=MotionPlayer(tmpm,source);
  if (inflictor && !(target->flags&TM_MF_NOCLIP) &&
	(!source_player || source_player->ready_weapon!=TM_WP_CHAINSAW)) {
    angle=AngleFrom(tmpw->data,target->x-inflictor->x,target->y-inflictor->y);
    thrust=damage*8192*100/info->mass;
    if (damage<40 && damage>target->health &&
	  target->z-inflictor->z>64*65536 &&
	  GameRand(tmpw->data,&tmpw->random)&1) {
      angle=(angle+0x80000000)&0xFFFFFFFF; thrust*=4;
    }
    target->vx+=FixedMul(thrust,AngleCos(tmpw->data,angle));
    target->vy+=FixedMul(thrust,AngleSin(tmpw->data,angle));
  }
  if (tmpp) {
    if (tmpw->map->sector[target->sector].special==11 && damage>=target->health)
      damage=target->health-1;
    if (damage<1000 && (tmpp->god_mode || tmpp->power[TM_PW_INVULNERABILITY]))
      return;
    if (tmpp->armor_type) {
      saved=damage/2;
      if (tmpp->armor_type==1) saved=damage/3;
      if (tmpp->armor<=saved) {
	saved=tmpp->armor; tmpp->armor_type=0;
      }
      tmpp->armor-=saved; damage-=saved;
    }
    tmpp->health=MaxI64(target->health-damage,0);
    tmpp->attacker=0;
    if (source) tmpp->attacker=source->id;
    tmpp->damage_cnt=MinI64(tmpp->damage_cnt+damage,100);
  }
  target->health-=damage;
  if (target->health<=0) {
    ActorKill(tmpm,target); return;
  }
  if (GameRand(tmpw->data,&tmpw->random)<info->pain_chance &&
	!(target->flags&TM_MF_SKULLFLY)) {
    target->flags|=TM_MF_JUSTHIT;
    if (!ActorState(tmpw->data,target,info->pain,tmpm->action)) return;
  }
  target->reaction=0;
  if ((!target->threshold || target->type==TM_MT_VILE) && source &&
	source!=target && source->type!=TM_MT_VILE) {
    target->target=source->id; target->threshold=100;
    if (target->state==info->spawn && info->see)
      ActorState(tmpw->data,target,info->see,tmpm->action);
  }
}
