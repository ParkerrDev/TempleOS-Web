I64 tm_damage_cnt=0,tm_damage_done=0,tm_damage_action=0;
Bool tm_damage_remove=FALSE;

U0 TmDamageAction(Actor *tmpa,I64 n)
{
  tm_damage_action=n;
  if (tm_damage_remove) tmpa->active=FALSE;
}

U0 TmDamagePlayers(Motion *tmpm)
{
  I64 *data=FileRead("C:/ORACLE/DAMAGE.BIN"),*at=data,n,i;
  World *tmpw=tmpm->world;
  Player *tmpp=tmpm->player;
  Actor *tmpa;
  if (!data) throw('Files');
  n=*at++;
  for (i=0;i<n;i++,at+=14) {
    MemSet(tmpp,0,sizeof(Player));
    tmpa=WorldSpawn(tmpw,TM_MT_PLAYER,0,0); tmpw->player=tmpa->id;
    tmpp->health=tmpa->health=at[0]; tmpp->armor=at[1]; tmpp->armor_type=at[2];
    tmpw->skill=at[4]; tmpp->god_mode=at[5];
    tmpp->power[TM_PW_INVULNERABILITY]=at[6];
    tmpw->map->sector[tmpa->sector].special=at[7];
    ActorDamage(tmpm,tmpa,NULL,NULL,at[3]);
    if (tmpa->health!=at[8] || tmpp->health!=MaxI64(at[8],0) ||
	  tmpp->armor!=at[9] || tmpp->armor_type!=at[10] ||
	  tmpp->damage_cnt!=at[11] || tmpp->dead!=at[12] ||
	  tmpa->height!=at[13] ||
	  at[12] && tmpa->flags&(TM_MF_SHOOTABLE|TM_MF_SOLID)) {
      "DAMAGE %d GOT HP %d ARMOR %d/%d CNT %d DEAD %d HEIGHT %d\n",i,
	    tmpa->health,tmpp->armor,tmpp->armor_type,tmpp->damage_cnt,
	    tmpp->dead,tmpa->height;
      throw('Player');
    }
    WorldRemove(tmpw,tmpa); tm_damage_cnt++;
  }
  Free(data);
}

U0 TmDamageMonsters(Motion *tmpm)
{
  World *tmpw=tmpm->world;
  Player *tmpp=tmpm->player;
  Actor *source,*target,*other;
  ActorInfo *info=tmpw->data->info+TM_MT_TROOP;
  I64 pain=info->pain_chance,i,type,drop,kills,old_random;
  MemSet(tmpp,0,sizeof(Player)); tmpw->skill=2;
  tmpw->map->sector[0].special=tmpw->map->sector[1].special=0;
  source=WorldSpawn(tmpw,TM_MT_PLAYER,-64*65536,0); tmpw->player=source->id;
  tmpp->ready_weapon=TM_WP_PISTOL; tmpp->health=100;
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0);
  tmpw->random=0; tm_damage_action=0;
  ActorDamage(tmpm,target,NULL,source,1);
  if (target->health!=info->health-1 || target->state!=info->pain ||
	!(target->flags&TM_MF_JUSTHIT) || target->reaction ||
	target->target!=source->id || target->threshold!=100 ||
	tm_damage_action || tmpw->random!=1) throw('Pain');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  info->pain_chance=0;
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0); tmpw->random=0;
  ActorDamage(tmpm,target,source,source,20);
  if (target->vx!=163837 || target->vy!=62 || target->state!=info->see ||
	target->target!=source->id || target->threshold!=100) throw('Thrust');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0);
  tmpp->ready_weapon=TM_WP_CHAINSAW;
  ActorDamage(tmpm,target,source,source,20);
  if (target->vx || target->vy) throw('Saw');
  tm_damage_cnt++; WorldRemove(tmpw,target); tmpp->ready_weapon=TM_WP_PISTOL;
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0); target->flags|=TM_MF_NOCLIP;
  ActorDamage(tmpm,target,source,source,1);
  if (target->vx || target->vy) throw('NoClip');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0); target->threshold=7;
  ActorDamage(tmpm,target,NULL,source,1);
  if (target->target || target->threshold!=7 || target->reaction)
    throw('Thresh');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  other=WorldSpawn(tmpw,TM_MT_VILE,64*65536,0);
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0);
  ActorDamage(tmpm,target,NULL,other,1);
  if (target->target || target->threshold) throw('VileSrc');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  other->threshold=7; ActorDamage(tmpm,other,NULL,source,1);
  if (other->target!=source->id || other->threshold!=100) throw('VileDst');
  tm_damage_cnt++; WorldRemove(tmpw,other);
  target=WorldSpawn(tmpw,TM_MT_SKULL,0,0);
  target->vx=target->vy=target->vz=65536; target->flags|=TM_MF_SKULLFLY;
  tmpw->random=0; ActorDamage(tmpm,target,NULL,NULL,1);
  if (target->vx || target->vy || target->vz ||
	target->flags&TM_MF_JUSTHIT || tmpw->random!=1) throw('Skull');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  for (i=0;i<5;i++) {
    switch (i) {
      case 0:
	type=TM_MT_POSSESSED; drop=TM_MT_CLIP;
	break;
      case 1:
	type=TM_MT_WOLFSS; drop=TM_MT_CLIP;
	break;
      case 2:
	type=TM_MT_SHOTGUY; drop=TM_MT_SHOTGUN;
	break;
      case 3:
	type=TM_MT_CHAINGUY; drop=TM_MT_CHAINGUN;
	break;
      default:
	type=TM_MT_TROOP; drop=-1;
    }
    target=WorldSpawn(tmpw,type,0,0); kills=tmpp->kills;
    tmpw->random=0; ActorDamage(tmpm,target,NULL,NULL,target->health);
    if (target->flags&TM_MF_SHOOTABLE || !(target->flags&TM_MF_CORPSE) ||
	  target->height!=tmpw->data->info[type].height>>2 ||
	  target->state!=tmpw->data->info[type].death || tmpp->kills!=kills+1)
      throw('Death');
    if (drop>=0) {
      other=WorldActorGet(tmpw,tmpw->last);
      if (other->type!=drop || !(other->flags&TM_MF_DROPPED) ||
	    tmpw->random!=2) throw('Drop');
      WorldRemove(tmpw,other);
    } else if (tmpw->random!=1) throw('Random');
    tm_damage_cnt++; WorldRemove(tmpw,target);
  }
  target=WorldSpawn(tmpw,TM_MT_POSSESSED,0,0);
  ActorDamage(tmpm,target,NULL,source,41);
  if (target->state!=tmpw->data->info[target->type].xdeath) throw('XDeath');
  tm_damage_cnt++;
  WorldRemove(tmpw,WorldActorGet(tmpw,tmpw->last)); WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0,65*65536); target->health=10;
  tmpw->random=1; ActorDamage(tmpm,target,source,source,20);
  if (target->vx>=0 || tmpw->random!=3) throw('Forward');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_HEAD,0,0);
  ActorDamage(tmpm,target,NULL,NULL,target->health);
  if (target->flags&(TM_MF_NOGRAVITY|TM_MF_FLOAT)) throw('Fall');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_SKULL,0,0);
  ActorDamage(tmpm,target,NULL,NULL,target->health);
  if (!(target->flags&TM_MF_NOGRAVITY)) throw('SkullDie');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  info->pain_chance=pain;
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0); tmpw->random=0;
  info->pain++;
  tm_damage_remove=TRUE; ActorDamage(tmpm,target,NULL,source,1);
  tm_damage_remove=FALSE; info->pain--;
  if (target->active || target->target || target->threshold) throw('Removed');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_POSSESSED,0,0); old_random=tmpw->random;
  tmpw->data->info[target->type].death++;
  tm_damage_remove=TRUE; ActorDamage(tmpm,target,NULL,NULL,target->health);
  tm_damage_remove=FALSE; tmpw->data->info[target->type].death--;
  if (target->active || tmpw->actor_cnt!=2 || tmpw->random!=old_random)
    throw('KillGone');
  tm_damage_cnt++; WorldRemove(tmpw,target);
  target=WorldSpawn(tmpw,TM_MT_TROOP,0,0);
  source->flags|=TM_MF_NOCLIP; tmpp->god_mode=TRUE;
  old_random=tmpw->random; ActorDamage(tmpm,source,target,target,20);
  if (source->health!=100 || tmpp->health!=100 || source->vx ||
	tmpw->random!=old_random) throw('Immune');
  source->flags&=~TM_MF_NOCLIP;
  ActorDamage(tmpm,source,target,target,20);
  if (source->health!=100 || !source->vx || tmpw->random!=old_random)
    throw('InvPush');
  tm_damage_cnt++;
  WorldRemove(tmpw,target); WorldRemove(tmpw,source);
}

U0 TmDamageTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  if (!data || GameDataNew("C:/ORACLE/BADMASS.BIN")) throw('Mass');
  motion->action=&TmDamageAction;
  TmDamagePlayers(motion); TmDamageMonsters(motion);
  "DAMAGE %d CASES BAD 0\n",tm_damage_cnt;
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  tm_damage_done=1;
}

TmDamageTest;
