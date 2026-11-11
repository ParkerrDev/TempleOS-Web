U0 ActorRadius(Motion *tmpm,Path *path,Actor *spot,Actor *source,I64 damage)
{//Snapshot nearby handles before damage actions can move or spawn actors.
  World *world=tmpm->world;
  I16 *block=world->map->blockmap;
  I64 radius,x,y,x1,y1,x2,y2,id,*hits,n=0,i,distance;
  Actor *tmpa;
  if (path->world!=world || spot->world!=world ||
	!(0<=damage<=32767)) throw('Radius');
  if (!damage || !world->actor_cnt) return;
  radius=damage*65536+world->max_radius;
  x1=MaxI64((spot->x-radius-block[0]*65536)>>23,0);
  y1=MaxI64((spot->y-radius-block[1]*65536)>>23,0);
  x2=MinI64((spot->x+radius-block[0]*65536)>>23,block(U16 *)[2]-1);
  y2=MinI64((spot->y+radius-block[1]*65536)>>23,block(U16 *)[3]-1);
  hits=MAlloc(world->actor_cnt*sizeof(I64));
  try {
    for (y=y1;y<=y2;y++)
      for (x=x1;x<=x2;x++) {
	id=world->blocks[x+y*block(U16 *)[2]];
	while (tmpa=WorldActorGet(world,id,FALSE)) {
	  if (tmpa->active && tmpa->flags&TM_MF_SHOOTABLE &&
		tmpa->type!=TM_MT_CYBORG && tmpa->type!=TM_MT_SPIDER)
	    hits[n++]=id;
	  id=tmpa->block_next;
	}
      }
    for (i=0;i<n;i++)
      if (tmpa=WorldActorGet(world,hits[i])) {
	distance=MaxI64(AbsI64(tmpa->x-spot->x),AbsI64(tmpa->y-spot->y));
	distance=MaxI64((distance-tmpa->radius)>>16,0);
	if (distance<damage && ActorSight(path,tmpa,spot))
	  ActorDamage(tmpm,tmpa,spot,source,damage-distance);
      }
  } catch {
    Free(hits);
  }
  Free(hits);
}

U0 ActorBfg(Motion *tmpm,Attack *trace,Actor *missile)
{//The forty rays originate at the firer's current position.
  World *world=tmpm->world;
  Actor *source=WorldActorGet(world,missile->target),*target;
  I64 i,j,angle,damage;
  if (trace->world!=world || missile->world!=world) throw('Bfg');
  if (!source) return;
  for (i=0;i<40;i++) {
    angle=missile->angle-0x40000000/2+0x40000000/40*i;
    if (AttackAim(trace,source,angle,1024*65536) &&
	  (target=WorldActorGet(world,trace->target))) {
      WorldSpawn(world,TM_MT_EXTRABFG,target->x,target->y,
	    target->z+target->height>>2);
      damage=0;
      for (j=0;j<15;j++) damage+=WorldRand(world)&7+1;
      ActorDamage(tmpm,target,source,source,damage);
    }
  }
}
