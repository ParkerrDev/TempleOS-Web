I64 tm_walk_x[8]={65536,47000,0,-47000,-65536,-47000,0,47000},
	tm_walk_y[8]={0,47000,65536,47000,0,-47000,-65536,-47000};

Bool EnemyMove(Enemies *tmpe,Actor *actor)
{
  Specials *specials=tmpe->specials;
  Motion *motion=specials->sectors->motion;
  World *world=motion->world;
  Collision *clip=world->collision;
  I64 x,y,n,*lines;
  Bool res=FALSE;
  if (actor->world!=world) throw('World');
  if (!actor->active || actor->movedir==8) return FALSE;
  if (!(0<=actor->movedir<8)) throw('MoveDir');
  n=world->data->info[actor->type].speed;
  x=actor->x+n*tm_walk_x[actor->movedir];
  y=actor->y+n*tm_walk_y[actor->movedir];
  if (!WorldTryMove(world,actor,x,y,motion->touch,motion->cross)) {
    if (!actor->active) return FALSE;
    if (actor->flags&TM_MF_FLOAT && clip->float_ok) {
      if (actor->z<clip->floor) actor->z+=4*65536;
      else actor->z-=4*65536;
      actor->flags|=TM_MF_INFLOAT;
      return TRUE;
    }
    n=clip->special_cnt;
    if (!n) return FALSE;
    actor->movedir=8;
    lines=MAlloc(n*sizeof(I64)); MemCpy(lines,clip->special,n*sizeof(I64));
    try {
      while (n && actor->active)
	if (LineUse(specials,actor,lines[--n],0)) res=TRUE;
    } catch {
      Free(lines);
    }
    Free(lines);
    return res;
  }
  actor->flags&=~TM_MF_INFLOAT;
  if (!(actor->flags&TM_MF_FLOAT)) actor->z=actor->floor;
  return TRUE;
}

Bool EnemyWalk(Enemies *tmpe,Actor *actor)
{
  if (!EnemyMove(tmpe,actor)) return FALSE;
  actor->move_cnt=WorldRand(actor->world)&15;
  return TRUE;
}

U0 EnemyDir(Enemies *tmpe,Actor *actor)
{
  Actor *target=EnemyTarget(tmpe,actor);
  World *world=actor->world;
  I64 old=actor->movedir,back=8,dx,dy,x=8,y=8,n,start,step;
  if (!target) throw('Target');
  if (!(0<=old<=8)) throw('MoveDir');
  if (old<8) back=(old+4)&7;
  dx=target->x-actor->x; dy=target->y-actor->y;
  if (dx>10*65536) x=0;
  else if (dx< -10*65536) x=4;
  if (dy< -10*65536) y=6;
  else if (dy>10*65536) y=2;
  if (x!=8 && y!=8) {
    n=1;
    if (dx<0) n=3;
    if (dy<0) n=8-n;
    actor->movedir=n;
    if (n!=back && EnemyWalk(tmpe,actor)) return;
  }
  if (WorldRand(world)>200 || AbsI64(dy)>AbsI64(dx)) {
    n=x; x=y; y=n;
  }
  if (x==back) x=8;
  if (y==back) y=8;
  if (x!=8) {
    actor->movedir=x;
    if (EnemyWalk(tmpe,actor)) return;
  }
  if (y!=8) {
    actor->movedir=y;
    if (EnemyWalk(tmpe,actor)) return;
  }
  if (old!=8) {
    actor->movedir=old;
    if (EnemyWalk(tmpe,actor)) return;
  }
  start=0; step=1;
  if (!(WorldRand(world)&1)) {start=7; step=-1;}
  for (n=start;0<=n<8;n+=step)
    if (n!=back) {
      actor->movedir=n;
      if (EnemyWalk(tmpe,actor)) return;
    }
  if (back!=8) {
    actor->movedir=back;
    if (EnemyWalk(tmpe,actor)) return;
  }
  actor->movedir=8;
}

U0 EnemyChase(Enemies *tmpe,Actor *actor)
{//Turn one octant, then preserve attack, movement and sound random order.
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  Actor *target=EnemyTarget(tmpe,actor);
  ActorInfo *info;
  I64 delta;
  if (!actor->active) return;
  if (!(0<=actor->movedir<=8)) throw('MoveDir');
  info=world->data->info+actor->type;
  if (actor->reaction) actor->reaction--;
  if (actor->threshold) {
    if (!target || target->health<=0) actor->threshold=0;
    else actor->threshold--;
  }
  if (actor->movedir<8) {
    actor->angle&=0xE0000000;
    delta=actor->angle-actor->movedir<<29; delta=delta.i32[0];
    if (delta>0) actor->angle-=0x20000000;
    else if (delta<0) actor->angle+=0x20000000;
    actor->angle&=0xFFFFFFFF;
  }
  if (!target || !(target->flags&TM_MF_SHOOTABLE)) {
    if (!EnemyPlayer(tmpe,actor,TRUE))
      ActorState(world->data,actor,info->spawn,motion->action);
    return;
  }
  if (actor->flags&TM_MF_JUSTATTACKED) {
    actor->flags&=~TM_MF_JUSTATTACKED;
    if (world->skill!=4 && !world->fast) EnemyDir(tmpe,actor);
    return;
  }
  if (info->melee && EnemyMelee(tmpe,actor)) {
    if (info->attack_snd && motion->sound)
      (*motion->sound)(actor,info->attack_snd);
    ActorState(world->data,actor,info->melee,motion->action);
    return;
  }
  if (info->missile && (world->skill==4 || world->fast || !actor->move_cnt))
    if (EnemyMissile(tmpe,actor)) {
      ActorState(world->data,actor,info->missile,motion->action);
      actor->flags|=TM_MF_JUSTATTACKED;
      return;
    }
  if (--actor->move_cnt<0 || !EnemyMove(tmpe,actor)) EnemyDir(tmpe,actor);
  if (info->active_snd && WorldRand(world)<3 && motion->sound)
    (*motion->sound)(actor,info->active_snd);
}
