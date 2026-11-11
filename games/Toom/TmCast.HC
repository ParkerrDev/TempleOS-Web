#define TM_CAST_NUM 17

I64 tm_cast_types[TM_CAST_NUM]={TM_MT_POSSESSED,TM_MT_SHOTGUY,TM_MT_CHAINGUY,
	TM_MT_TROOP,TM_MT_SERGEANT,TM_MT_SKULL,TM_MT_HEAD,TM_MT_KNIGHT,
	TM_MT_BRUISER,TM_MT_BABY,TM_MT_PAIN,TM_MT_UNDEAD,TM_MT_FATSO,
	TM_MT_VILE,TM_MT_SPIDER,TM_MT_CYBORG,TM_MT_PLAYER};

class Cast
{
  GameData *data;
  I64 num,state,tics,frames;
  Bool death,on_melee,attacking;
  U0 (*sound)(I64,U8*);
  U8 *context;
};

U0 CastStart(Cast *tmpc,GameData *tmpd,
	U0 (*sound)(I64,U8*)=NULL,U8 *context=NULL)
{//Animate state records without spawning actors or running their actions.
  MemSet(tmpc,0,sizeof(Cast));
  tmpc->data=tmpd;
  tmpc->state=tmpd->info[tm_cast_types[0]].see;
  tmpc->tics=tmpd->state[tmpc->state].tics;
  tmpc->sound=sound; tmpc->context=context;
}

U0 CastSnd(Cast *tmpc,I64 n)
{
  if (n && tmpc->sound) (*tmpc->sound)(n,tmpc->context);
}

I64 CastAttackSnd(I64 n)
{
  switch (n) {
    case TM_S_PLAY_ATK1:
      return TM_SFX_DSHTGN;
    case TM_S_POSS_ATK2:
      return TM_SFX_PISTOL;
    case TM_S_SPOS_ATK2: case TM_S_CPOS_ATK2: case TM_S_CPOS_ATK3:
    case TM_S_CPOS_ATK4: case TM_S_SPID_ATK2: case TM_S_SPID_ATK3:
      return TM_SFX_SHOTGN;
    case TM_S_VILE_ATK2:
      return TM_SFX_VILATK;
    case TM_S_SKEL_FIST2:
      return TM_SFX_SKESWG;
    case TM_S_SKEL_FIST4:
      return TM_SFX_SKEPCH;
    case TM_S_SKEL_MISS2:
      return TM_SFX_SKEATK;
    case TM_S_FATT_ATK2: case TM_S_FATT_ATK5: case TM_S_FATT_ATK8:
    case TM_S_BOSS_ATK2: case TM_S_BOS2_ATK2: case TM_S_HEAD_ATK2:
      return TM_SFX_FIRSHT;
    case TM_S_TROO_ATK3:
      return TM_SFX_CLAW;
    case TM_S_SARG_ATK2:
      return TM_SFX_SGTATK;
    case TM_S_SKULL_ATK2: case TM_S_PAIN_ATK3:
      return TM_SFX_SKLATK;
    case TM_S_BSPI_ATK2:
      return TM_SFX_PLASMA;
    case TM_S_CYBER_ATK2: case TM_S_CYBER_ATK4: case TM_S_CYBER_ATK6:
      return TM_SFX_RLAUNC;
  }
  return 0;
}

U0 CastTick(Cast *tmpc)
{
  GameData *tmpd=tmpc->data;
  State *tmps=tmpd->state+tmpc->state;
  ActorInfo *tmpi;
  if (--tmpc->tics>0) return;
  if (tmps->tics==-1 || !tmps->next) {
    if (++tmpc->num==TM_CAST_NUM) tmpc->num=0;
    tmpc->death=FALSE;
    tmpi=tmpd->info+tm_cast_types[tmpc->num];
    CastSnd(tmpc,tmpi->see_snd);
    tmpc->state=tmpi->see;
    tmpc->frames=0;
  } else {
    if (tmpc->state==TM_S_PLAY_ATK1) goto ct_stop;
    tmpc->state=tmps->next;
    tmpc->frames++;
    CastSnd(tmpc,CastAttackSnd(tmpc->state));
  }
  tmpi=tmpd->info+tm_cast_types[tmpc->num];
  if (tmpc->frames==12) {
    tmpc->attacking=TRUE;
    if (tmpc->on_melee) tmpc->state=tmpi->melee;
    else tmpc->state=tmpi->missile;
    tmpc->on_melee^=1;
    if (!tmpc->state) {
      if (tmpc->on_melee) tmpc->state=tmpi->melee;
      else tmpc->state=tmpi->missile;
    }
  }
  if (tmpc->attacking &&
	(tmpc->frames==24 || tmpc->state==tmpi->see)) {
ct_stop:
    tmpc->attacking=FALSE;
    tmpc->frames=0;
    tmpc->state=tmpd->info[tm_cast_types[tmpc->num]].see;
  }
  tmpc->tics=tmpd->state[tmpc->state].tics;
  if (tmpc->tics==-1) tmpc->tics=15;
}

Bool CastKey(Cast *tmpc,Bool down)
{//Only key-down events enter death; repeat presses do not restart it.
  ActorInfo *tmpi=tmpc->data->info+tm_cast_types[tmpc->num];
  if (!down) return FALSE;
  if (tmpc->death) return TRUE;
  tmpc->death=TRUE;
  tmpc->state=tmpi->death;
  tmpc->tics=tmpc->data->state[tmpc->state].tics;
  tmpc->frames=0;
  tmpc->attacking=FALSE;
  CastSnd(tmpc,tmpi->death_snd);
  return TRUE;
}
