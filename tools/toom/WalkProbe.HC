I64 tm_walk_cases=0,tm_walk_done=0,tm_walk_ok,tm_walk_float,tm_walk_floor,
	tm_walk_specials,tm_walk_mask,tm_walk_calls,tm_walk_tx,tm_walk_ty,
	tm_walk_used,tm_walk_trace[12];
Bool tm_walk_nested=FALSE,tm_walk_fail=FALSE;
Actor *tm_walk_actor;

Bool TmWalkTry(World *world,Actor *actor,I64 x,I64 y,
	U0 (*touch)(Actor *,Actor *,I64),U0 (*cross)(Actor *,I64,I64))
{
  Collision *clip=world->collision;
  I64 i;
  if (actor!=tm_walk_actor || touch || cross) throw('Args');
  tm_walk_calls++; tm_walk_tx=x; tm_walk_ty=y;
  clip->float_ok=tm_walk_float; clip->floor=tm_walk_floor;
  clip->special_cnt=tm_walk_specials;
  for (i=0;i<tm_walk_specials;i++) clip->special[i]=i*3+1;
  if (tm_walk_ok) {
    actor->x=x; actor->y=y; actor->floor=tm_walk_floor;
  }
  return tm_walk_ok;
}

Bool TmWalkUse(Specials *,Actor *actor,I64 line,I64 side)
{
  if (actor!=tm_walk_actor || side || tm_walk_used>=12) throw('Args');
  tm_walk_trace[tm_walk_used++]=line;
  if (tm_walk_nested)
    MemSet(actor->world->collision->special,0,12*sizeof(I64));
  if (tm_walk_fail) throw('Use',TRUE);
  return !!(tm_walk_mask&1<<(line/3));
}
