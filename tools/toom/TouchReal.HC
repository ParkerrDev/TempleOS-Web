I64 tm_touch_real_cases=0,tm_touch_real_done=0,tm_touch_real_actions,
      tm_touch_real_sounds;
Motion *tm_touch_real_motion;
Actor *tm_touch_real_skull;
Bool tm_touch_real_retire=FALSE;

U0 TmTouchRealSnd(Actor *,I64)
{
  tm_touch_real_sounds++;
}

U0 TmTouchRealAction(Actor *actor,I64 n)
{
  if (actor==tm_touch_real_skull) {
    if (n!=TM_A_LOOK || actor->vx || actor->vy || actor->vz ||
	  actor->flags&TM_MF_SKULLFLY) throw('Order');
    tm_touch_real_actions++;
    if (tm_touch_real_retire) actor->active=FALSE;
  }
}

U0 TmTouchRealContact(Actor *mover,Actor *other,I64 kind)
{
  MotionTouch(tm_touch_real_motion,mover,other,kind);
}

U0 TmTouchRealTest()
{
  I64 i,j,heap,used,cnt,kind,damage,random,old_pain;
  Bool caught,res;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world,*foreign;
  Motion *motion;
  Actor *player,*a,*b,*other;
  Player state;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  old_pain=data->info[TM_MT_TROOP].pain_chance;
  data->info[TM_MT_TROOP].pain_chance=0;
  for (i=0;i<4;i++) for (j=0;j<256;j++) {
    MemSet(&state,0,sizeof(state)); PlayerBorn(&state);
    world=WorldNew(map,data); motion=MotionNew(world,&state);
    player=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0); world->player=player->id;
    kind=TM_MT_ROCKET; if (i>=2) kind=TM_MT_SKULL;
    a=WorldSpawn(world,kind,32*65536,0);
    b=WorldSpawn(world,TM_MT_TROOP,32*65536,0); b->health=1000;
    a->target=player->id; if (i==1) a->target=0;
    if (i>=2) a->flags|=TM_MF_SKULLFLY;
    if (i==3) b->flags=TM_MF_SOLID;
    a->vx=11; a->vy=-22; a->vz=33;
    tm_touch_real_skull=NULL;
    if (i>=2) tm_touch_real_skull=a;
    tm_touch_real_actions=0; tm_touch_real_motion=motion;
    motion->touch=&TmTouchRealContact; motion->action=&TmTouchRealAction;
    world->random=j;
    damage=(data->random[(j+1)&255]%8+1)*data->info[kind].damage;
    if (WorldContacts(world,a,a->x,a->y,motion->touch)) throw('Blocked');
    random=(j+2)&255;
    if (i==3) {damage=0; random=(j+1)&255;}
    if (b->health!=1000-damage || world->random!=random) throw('Damage');
    if (i>=2) {
      if (a->flags&TM_MF_SKULLFLY || a->vx || a->vy || a->vz ||
	    a->state!=data->info[kind].spawn || tm_touch_real_actions!=1)
	throw('Skull');
    } else if (!(a->flags&TM_MF_MISSILE) || a->vx!=11 || a->vy!= -22 ||
	  a->vz!=33 || tm_touch_real_actions) throw('Missile');
    if (i==0 && b->target!=player->id || i==1 && b->target ||
	  i==2 && b->target!=a->id || i==3 && b->target) throw('Source');
    MotionDel(motion); WorldDel(world);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_touch_real_cases++;
  }
  data->info[TM_MT_TROOP].pain_chance=old_pain;
  MemSet(&state,0,sizeof(state)); PlayerBorn(&state);
  world=WorldNew(map,data); motion=MotionNew(world,&state);
  player=WorldSpawn(world,TM_MT_PLAYER,0,0); world->player=player->id;
  motion->touch=&TmTouchRealContact; motion->action=&TmTouchRealAction;
  motion->sound=&TmTouchRealSnd; tm_touch_real_motion=motion;
  tm_touch_real_skull=NULL;
  for (i=0;i<4;i++) {
    b=WorldSpawn(world,TM_MT_CLIP,0,0);
    state.ammo[TM_AM_CLIP]=50;
    if (i==1) state.ammo[TM_AM_CLIP]=state.max_ammo[TM_AM_CLIP];
    if (i==2) b->z=player->height+1;
    if (i==3) b->flags|=TM_MF_SOLID;
    tm_touch_real_sounds=0; world->random=0;
    res=WorldContacts(world,player,0,0,motion->touch);
    if (res!=(i!=3) || world->random) throw('Pickup');
    if (i==0 || i==3) {
      if (b->active || state.ammo[TM_AM_CLIP]!=60 || tm_touch_real_sounds!=1)
	throw('Item');
    } else if (!b->active || tm_touch_real_sounds) throw('Item');
    WorldRemove(world,b); tm_touch_real_cases++;
  }
  a=WorldSpawn(world,TM_MT_SKULL,64*65536,0);
  b=WorldSpawn(world,TM_MT_TROOP,64*65536,0); b->flags=TM_MF_SOLID;
  a->flags|=TM_MF_SKULLFLY; a->vx=11; a->vy=-22; a->vz=33;
  tm_touch_real_skull=a; tm_touch_real_retire=TRUE;
  tm_touch_real_actions=0;
  if (WorldContacts(world,a,a->x,a->y,motion->touch) || a->active ||
	!b->active || tm_touch_real_actions!=1) throw('Retire');
  tm_touch_real_retire=FALSE; tm_touch_real_cases++;
  WorldSweep(world); tm_touch_real_skull=NULL;
  a=WorldSpawn(world,TM_MT_ROCKET,64*65536,0);
  for (i=0;i<2;i++) {
    a->active=!i; b->active=i; world->random=0;
    MotionTouch(motion,a,b,TM_CONTACT_MISSILE);
    if (world->random) throw('Inactive');
    tm_touch_real_cases++;
  }
  a->active=b->active=TRUE;
  foreign=WorldNew(map,data); other=WorldSpawn(foreign,TM_MT_TROOP,0,0);
  for (i=0;i<6;i++) {
    heap=Fs->data_heap->used_u8s; caught=FALSE;
    try {
      if (i==0) MotionTouch(motion,other,b,TM_CONTACT_MISSILE);
      else if (i==1) MotionTouch(motion,a,other,TM_CONTACT_MISSILE);
      else {
	kind=i-3; if (i==5) kind=5;
	MotionTouch(motion,a,b,kind);
      }
    } catch {
      if (i<2 && Fs->except_ch=='World' || i>=2 && Fs->except_ch=='Contact')
	caught=Fs->catch_except=TRUE;
    }
    if (!caught || Fs->data_heap->used_u8s!=heap) throw('Guard');
    tm_touch_real_cases++;
  }
  WorldDel(foreign);
  cnt=world->actor_cnt;
  WorldRemove(world,a); WorldRemove(world,b);
  if (world->actor_cnt!=cnt-2) throw('Actors');
  MotionDel(motion); WorldDel(world);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  MapDel(map); GameDataDel(data); tm_touch_real_done=1;
  "TOUCH %d REAL CASES BAD 0\n",tm_touch_real_cases;
}

TmTouchRealTest;
