I64 tm_attack_cnt=0,tm_attack_done=0;

U0 TmAttackExpect(Attack *tmpa,Actor *source,I64 kind,I64 target,
	I64 slope=0,I64 range=512*65536)
{
  if (AttackFire(tmpa,source,0,range,slope)!=kind || tmpa->kind!=kind ||
	tmpa->target!=target) {
    "ATTACK %d KIND %d/%d TARGET %X/%X\n",tm_attack_cnt,
	  tmpa->kind,kind,tmpa->target,target;
    throw('Attack');
  }
  tm_attack_cnt++;
}

U0 TmAttackTriggers(GameData *data)
{
  Map *map=RoomsNew(FALSE);
  World *world;
  Attack *attack;
  Actor *source,*target;
  Vertex *vertex=CAlloc(90*sizeof(Vertex));
  Line *line=CAlloc(47*sizeof(Line));
  I64 i,n,last=-I64_MAX,seen=0;
  MemCpy(vertex,map->vertex,10*sizeof(Vertex));
  MemCpy(line,map->line,7*sizeof(Line));
  Free(map->vertex); Free(map->line); Free(map->blockmap);
  map->vertex=vertex; map->vertex_cnt=90;
  map->line=line; map->line_cnt=47;
  map->blockmap_cnt=68; map->blockmap=CAlloc(136);
  map->blockmap[0]=map->blockmap[1]=-256;
  map->blockmap[2]=map->blockmap[3]=4;
  for (i=0;i<16;i++) map->blockmap[4+i]=20;
  for (i=0;i<47;i++) map->blockmap[20+i]=i;
  map->blockmap[67]=-1;
  for (i=0;i<40;i++) {
    vertex[10+i*2].x=vertex[11+i*2].x=-40+i*2;
    vertex[10+i*2].y=-128; vertex[11+i*2].y=128;
    line[7+i].v1=10+i*2; line[7+i].v2=11+i*2;
    line[7+i].flags=4; line[7+i].side[1]=1; line[7+i].special=97;
  }
  world=WorldNew(map,data); attack=AttackNew(world);
  source=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0);
  target=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id);
  if (attack->special_cnt!=41 || attack->special_cap!=64) throw('Growth');
  for (i=0;i<41;i++) {
    n=attack->special[i];
    if (!(6<=n<47) || Bts(&seen,n) || world->collision->line[n].ax<last)
      throw('Order');
    last=world->collision->line[n].ax;
  }
  AttackDel(attack); WorldDel(world); MapDel(map);
}

U0 TmAttackTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Attack *attack=AttackNew(world);
  Actor *source=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0),*target,*other;
  I64 angle,slope,old_health,old_random,i;
  target=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  old_health=target->health; old_random=world->random;
  if (!AttackAim(attack,source,0,512*65536) || attack->target!=target->id ||
	!(-40960<=attack->slope<=40960)) throw('Aim');
  slope=attack->slope; tm_attack_cnt++;
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id,slope);
  if (target->health!=old_health || world->random!=old_random ||
	attack->special_cnt!=1 || attack->special[0]!=6 ||
	!(53*65536<attack->x<55*65536) || AbsI64(attack->y)>65536)
    throw('Pure');
  tm_attack_cnt++;
  TmAttackExpect(attack,source,TM_HIT_NONE,0,0,32*65536);
  if (attack->special_cnt || AttackAim(attack,source,0,32*65536))
    throw('Range');
  tm_attack_cnt++;
  map->line[6].flags|=3;
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id);
  map->line[6].flags&=~3;
  target->flags&=~TM_MF_SHOOTABLE;
  if (AttackAim(attack,source,0,512*65536)) throw('AimDead');
  TmAttackExpect(attack,source,TM_HIT_WALL,0);
  if (attack->line!=2 || !(123*65536<attack->x<125*65536)) throw('Wall');
  target->flags|=TM_MF_SHOOTABLE;
  TmAttackExpect(attack,source,TM_HIT_WALL,0,65536);
  TmAttackExpect(attack,source,TM_HIT_WALL,0,-65536);
  map->sector[0].ceil=0;
  if (AttackAim(attack,source,0,512*65536)) throw('Closed');
  TmAttackExpect(attack,source,TM_HIT_WALL,0);
  if (attack->line!=6) throw('Door');
  map->sector[0].ceil=32;
  if (!AttackAim(attack,source,0,512*65536) || attack->slope>=0)
    throw('LowAim');
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id,attack->slope);
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id,-8192);
  TmAttackExpect(attack,source,TM_HIT_WALL,0);
  map->sector[0].floor=40; map->sector[0].ceil=128;
  if (!AttackAim(attack,source,0,512*65536) || attack->slope<=0)
    throw('StepAim');
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id,attack->slope);
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id,8192);
  TmAttackExpect(attack,source,TM_HIT_WALL,0);
  map->sector[0].floor=map->sector[0].ceil=36;
  TmAttackExpect(attack,source,TM_HIT_WALL,0);
  if (attack->line!=6) throw('ClosedEq');
  map->sector[0].floor=0; map->sector[0].ceil=128;
  WorldActorUnlink(world,target); target->z=128*65536;
  WorldActorLink(world,target);
  if (AttackAim(attack,source,0,512*65536)) throw('Cone');
  tm_attack_cnt++;
  target->z=64*65536;
  if (!AttackAim(attack,source,0,512*65536) || attack->slope<=0)
    throw('HighAim');
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id,attack->slope);
  target->z=0;
  other=WorldSpawn(world,TM_MT_TROOP,32*65536,0);
  if (!AttackAim(attack,source,0,512*65536) || attack->target!=other->id)
    throw('Nearest');
  TmAttackExpect(attack,source,TM_HIT_ACTOR,other->id,attack->slope);
  other->flags&=~TM_MF_SHOOTABLE;
  TmAttackExpect(attack,source,TM_HIT_ACTOR,target->id);
  WorldRemove(world,other);
  target->flags&=~TM_MF_SHOOTABLE;
  StrCpy(map->sector[0].ceil_name,"F_SKY1");
  TmAttackExpect(attack,source,TM_HIT_SKY,0,65536);
  map->sector[0].ceil=32;
  StrCpy(map->sector[1].ceil_name,"F_SKY1");
  TmAttackExpect(attack,source,TM_HIT_SKY,0);
  if (attack->line!=6 || attack->special_cnt!=1) throw('SkyLine');
  StrCpy(map->sector[1].ceil_name,"F_SKY10");
  StrCpy(map->sector[0].ceil_name,"F_SKY10");
  source->z=-16*65536;
  TmAttackExpect(attack,source,TM_HIT_WALL,0,32768);
  map->sector[0].ceil=128; source->z=0;
  map->sector[0].ceil_name[0]=map->sector[1].ceil_name[0]=0;
  target->flags|=TM_MF_SHOOTABLE;
  WorldActorUnlink(world,source); source->x=0; WorldActorLink(world,source);
  for (i=0;i<8;i++) {
    angle=i*0x20000000;
    WorldActorUnlink(world,target);
    target->x=source->x+FixedMul(64*65536,AngleCos(data,angle));
    target->y=source->y+FixedMul(64*65536,AngleSin(data,angle));
    WorldActorLink(world,target);
    if (!AttackAim(attack,source,angle,64*65536) ||
	  attack->target!=target->id ||
	  AttackFire(attack,source,angle,64*65536,attack->slope)!=
	  TM_HIT_ACTOR ||
	  attack->target!=target->id) throw('Octant');
    tm_attack_cnt++;
  }
  if (AttackAim(attack,source,0,0) || attack->target ||
	AttackFire(attack,source,0,-1,0) ||
	attack->target || attack->special_cnt)
    throw('Invalid');
  tm_attack_cnt++;
  source->active=FALSE;
  if (AttackAim(attack,source,0,512*65536) ||
	AttackFire(attack,source,0,512*65536,0)) throw('Inactive');
  tm_attack_cnt++;
  AttackDel(attack); WorldDel(world); MapDel(map);
  TmAttackTriggers(data); GameDataDel(data);
  "ATTACK %d CASES BAD 0\n",tm_attack_cnt;
  tm_attack_done=1;
}

TmAttackTest;
