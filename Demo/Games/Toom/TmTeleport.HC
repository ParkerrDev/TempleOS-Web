Bool ActorTeleportMove(Motion *tmpm,Actor *tmpa,I64 x,I64 y,
	Bool monsters_stomp=FALSE)
{//Teleport occupancy ignores scenery, walls and vertical separation.
  World *world=tmpm->world;
  Map *map=world->map;
  I16 *block=map->blockmap;
  I64 sector,floor,ceil,radius,x1,x2,y1,y2,bx,by,id,*hits,n=0,i;
  Actor *other;
  Bool res=TRUE;
  if (tmpa->world!=world) throw('World');
  if (!tmpa->active) return FALSE;
  sector=FixedSector(map,x,y);
  floor=map->sector[sector].floor; ceil=map->sector[sector].ceil;
  radius=tmpa->radius+world->max_radius;
  x1=MaxI64((x-radius-block[0]*65536)>>23,0);
  y1=MaxI64((y-radius-block[1]*65536)>>23,0);
  x2=MinI64((x+radius-block[0]*65536)>>23,block(U16 *)[2]-1);
  y2=MinI64((y+radius-block[1]*65536)>>23,block(U16 *)[3]-1);
  hits=MAlloc(world->actor_cnt*sizeof(I64));
  try {
    for (bx=x1;bx<=x2;bx++)
      for (by=y1;by<=y2;by++) {
	id=world->blocks[bx+by*block(U16 *)[2]];
	while (other=WorldActorGet(world,id,FALSE)) {
	  if (other->active && other!=tmpa && other->flags&TM_MF_SHOOTABLE)
	    hits[n++]=id;
	  id=other->block_next;
	}
      }
    for (i=0;i<n && res;i++)
      if (other=WorldActorGet(world,hits[i])) {
	radius=tmpa->radius+other->radius;
	if (other->flags&TM_MF_SHOOTABLE && AbsI64(other->x-x)<radius &&
	      AbsI64(other->y-y)<radius) {
	  if (!MotionPlayer(tmpm,tmpa) && !monsters_stomp) res=FALSE;
	  else ActorDamage(tmpm,other,tmpa,tmpa,10000);
	}
	if (!tmpa->active) res=FALSE;
      }
  } catch {
    Free(hits);
  }
  Free(hits);
  if (!res) return FALSE;
  WorldActorUnlink(world,tmpa);
  tmpa->x=x; tmpa->y=y; tmpa->sector=sector;
  tmpa->floor=floor; tmpa->ceil=ceil;
  WorldActorLink(world,tmpa);
  return TRUE;
}

Bool ActorTeleport(Motion *tmpm,Actor *tmpa,I64 line,I64 side,
	Bool monsters_stomp=FALSE)
{//The first destination in tagged-sector and thinker order is decisive.
  World *world=tmpm->world;
  Map *map=world->map;
  Actor *dest,*fog;
  Player *player;
  I64 i,id,tag,old_x,old_y,old_z,x,y,angle;
  if (tmpa->world!=world) throw('World');
  if (!tmpa->active || tmpa->flags&TM_MF_MISSILE || side ||
	!(0<=line<map->line_cnt)) return FALSE;
  tag=map->line[line].tag;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==tag) {
      id=world->first;
      while (dest=WorldActorGet(world,id,FALSE)) {
	if (dest->active && dest->type==TM_MT_TELEPORTMAN && dest->sector==i) {
	  old_x=tmpa->x; old_y=tmpa->y; old_z=tmpa->z;
	  x=dest->x; y=dest->y; angle=dest->angle;
	  if (!ActorTeleportMove(tmpm,tmpa,x,y,monsters_stomp)) return FALSE;
	  tmpa->z=tmpa->floor;
	  player=MotionPlayer(tmpm,tmpa);
	  if (player) player->view_z=tmpa->z+player->view_height;
	  fog=WorldSpawn(world,TM_MT_TFOG,old_x,old_y,old_z);
	  if (tmpm->sound) (*tmpm->sound)(fog,TM_SFX_TELEPT);
	  fog=WorldSpawn(world,TM_MT_TFOG,x+20*AngleCos(world->data,angle),
		y+20*AngleSin(world->data,angle),tmpa->z);
	  if (tmpm->sound) (*tmpm->sound)(fog,TM_SFX_TELEPT);
	  if (player) tmpa->reaction=18;
	  tmpa->angle=angle; tmpa->vx=tmpa->vy=tmpa->vz=0;
	  return TRUE;
	}
	id=dest->tick_next;
      }
    }
  return FALSE;
}
