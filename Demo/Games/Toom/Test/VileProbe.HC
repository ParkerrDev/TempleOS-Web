I64 tm_vile_cases=0,tm_vile_done=0,tm_vile_allow,tm_vile_cnt,
	tm_vile_trace[24];
Actor *tm_vile_actor,*tm_vile_bodies[3];

I64 TmVileWho(Actor *actor)
{
  I64 i;
  if (actor==tm_vile_actor) return -1;
  for (i=0;i<3;i++) if (actor==tm_vile_bodies[i]) return i;
  throw('Actor');
}

U0 TmVileRecord(I64 event,I64 actor,I64 value)
{
  I64 n=tm_vile_cnt++*3;
  if (n>=24) throw('Trace');
  tm_vile_trace[n]=event; tm_vile_trace[n+1]=actor;
  tm_vile_trace[n+2]=value;
}

Bool TmVilePosition(World *world,Actor *actor,I64 x,I64 y,
	U0 (*touch)(Actor *mover,Actor *other,I64 kind),Bool fit)
{
  I64 n=TmVileWho(actor);
  if (actor->world!=world || x!=actor->x || y!=actor->y || touch || fit)
    throw('Query');
  TmVileRecord(1,n,actor->height);
  return !!(tm_vile_allow&1<<n);
}

U0 TmVileFace(Enemies *,Actor *actor)
{
  I64 n=TmVileWho(WorldActorGet(actor->world,actor->target));
  TmVileRecord(2,n,0); actor->flags&=~TM_MF_AMBUSH; actor->angle=123+n;
}

Bool TmVileState(GameData *,Actor *actor,I64 n,U0 (*action)(Actor *,I64))
{
  if (action) throw('Action');
  TmVileRecord(3,TmVileWho(actor),n); actor->state=n; return TRUE;
}

U0 TmVileSound(Enemies *,Actor *actor,I64 n)
{
  TmVileRecord(4,TmVileWho(actor),n);
}

U0 TmVileChase(Enemies *,Actor *actor)
{
  if (actor!=tm_vile_actor) throw('Chase');
  TmVileRecord(5,-1,0);
}
