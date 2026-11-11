class State
{
  I32 sprite,frame,tics,action,next,misc1,misc2;
};

class ActorInfo
{
  I32 number,spawn,health,see,see_snd,reaction,attack_snd,pain,pain_chance,
	pain_snd,melee,missile,death,xdeath,death_snd,speed,radius,height,
	mass,damage,active_snd,flags,raise;
};

class GameData
{
  U8 *body,*sprite,*sound,*random;
  State *state;
  ActorInfo *info;
};

class Actor
{
  I64 type,state,tics,sprite,frame,health,flags;
  I64 x,y,z,vx,vy,vz,angle,sector,target,reaction,threshold;
  Bool active;
};

U0 GameDataDel(GameData *tmpd)
{
  if (tmpd) {
    Free(tmpd->body);
    Free(tmpd);
  }
}

Bool StateValid(I64 n)
{
  return 0<=n<TM_STATE_NUM;
}

GameData *GameDataNew(U8 *filename="TMDATA.BIN")
{//Fixed records replace text parsing, FramePtr names and pointer identities.
  I64 size,i;
  U32 *header;
  State *tmps;
  ActorInfo *tmpi;
  GameData *tmpd=CAlloc(sizeof(GameData));
  if (!(tmpd->body=FileRead(filename,&size))) goto gd_fail;
  if (size!=TM_DATA_SIZE) goto gd_fail;
  header=tmpd->body;
  if (header[0]!='TMST' || header[1]!=1 ||
	header[2]!=TM_STATE_NUM || header[3]!=TM_ACTOR_NUM ||
	header[4]!=TM_SPRITE_NUM || header[5]!=TM_ACTION_NUM ||
	header[6]!=TM_SND_NUM || header[7]!=256)
    goto gd_fail;
  tmpd->state=tmpd->body+32;
  tmpd->info=tmpd->state+TM_STATE_NUM;
  tmpd->sprite=tmpd->info+TM_ACTOR_NUM;
  tmpd->sound=tmpd->sprite+TM_SPRITE_NUM*4;
  tmpd->random=tmpd->sound+TM_SND_NUM*8;
  for (i=0;i<TM_STATE_NUM;i++) {
    tmps=tmpd->state+i;
    if (!(0<=tmps->sprite<TM_SPRITE_NUM) || tmps->tics< -1 ||
	!(0<=tmps->action<TM_ACTION_NUM) || !StateValid(tmps->next))
      goto gd_fail;
  }
  for (i=0;i<TM_ACTOR_NUM;i++) {
    tmpi=tmpd->info+i;
    if (!StateValid(tmpi->spawn) || !StateValid(tmpi->see) ||
	!StateValid(tmpi->pain) || !StateValid(tmpi->melee) ||
	!StateValid(tmpi->missile) || !StateValid(tmpi->death) ||
	!StateValid(tmpi->xdeath) || !StateValid(tmpi->raise) ||
	tmpi->radius<0 || tmpi->height<0)
      goto gd_fail;
  }
  return tmpd;
gd_fail:
  GameDataDel(tmpd);
  return NULL;
}

I64 GameRand(GameData *tmpd,I64 *_index)
{//Simulation and cosmetic callers keep separate byte-stream positions.
  *_index=(*_index+1)&255;
  return tmpd->random[*_index];
}

Bool ActorState(GameData *tmpd,Actor *tmpa,I64 n,
	U0 (*action)(Actor *tmpa,I64 n))
{//Enter states and run their actions; zero-tic states advance immediately.
  I64 left=TM_STATE_NUM;
  State *tmps;
  do {
    if (!n) {
      tmpa->state=0;
      tmpa->active=FALSE;
      return FALSE;
    }
    if (!StateValid(n) || !left--) throw('State');
    tmps=tmpd->state+n;
    tmpa->state=n;
    tmpa->tics=tmps->tics;
    tmpa->sprite=tmps->sprite;
    tmpa->frame=tmps->frame;
    if (action && tmps->action) (*action)(tmpa,tmps->action);
    n=tmps->next;
  } while (!tmpa->tics && tmpa->active);
  return tmpa->active;
}

Bool ActorTick(GameData *tmpd,Actor *tmpa,
	U0 (*action)(Actor *tmpa,I64 n))
{//One simulation tic; drawing never changes actor state or consumes its RNG.
  if (tmpa->active && tmpa->tics!=-1)
    if (!--tmpa->tics)
      ActorState(tmpd,tmpa,tmpd->state[tmpa->state].next,action);
  return tmpa->active;
}
