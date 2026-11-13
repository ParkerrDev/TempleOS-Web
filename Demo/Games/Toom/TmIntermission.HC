#define TM_IM_STATS 0
#define TM_IM_NEXT  1
#define TM_IM_WAIT  2
#define TM_IM_DONE  3

#define TM_FINALE_NONE	  0
#define TM_FINALE_EPISODE 1
#define TM_FINALE_TEXT	  2
#define TM_FINALE_CAST	  3

class Intermission
{
  I64 episode,map_num,next,finale;
  I64 kills,items,secrets,time,par;
  I64 shown_kills,shown_items,shown_secrets,shown_time,shown_par;
  I64 phase,state,wait,tic;
  Bool commercial,secret,did_secret,attack_down,use_down;
  U0 (*sound)(I64 n,U8 *context);
  U8 *context;
};

I64 MapNext(I64 episode,I64 map_num,Bool commercial,Bool secret)
{//One-based map numbers; zero ends an episode without an intermission.
  if (commercial) {
    if (!(1<=map_num<=32)) throw('Map');
    if (secret) {
      if (map_num==15) return 31;
      if (map_num==31) return 32;
      throw('Secret');
    }
    if (map_num==31 || map_num==32) return 16;
    return map_num+1;
  }
  if (!(1<=episode<=4) || !(1<=map_num<=9)) throw('Map');
  if (map_num==8) return 0;
  if (secret) return 9;
  if (map_num==9)
    switch (episode) {
      case 1: return 4;
      case 2: return 6;
      case 3: return 7;
      case 4: return 3;
    }
  return map_num+1;
}

I64 MapFinale(I64 map_num,Bool commercial,Bool secret)
{
  if (commercial) {
    if (map_num==30) return TM_FINALE_CAST;
    if (map_num==6 || map_num==11 || map_num==20 ||
	  secret && (map_num==15 || map_num==31)) return TM_FINALE_TEXT;
  } else if (map_num==8) return TM_FINALE_EPISODE;
  return TM_FINALE_NONE;
}

U0 IntermissionStart(Intermission *tmpi,Game *game,I64 par=0,
      Bool did_secret=FALSE)
{//Copy the result before the old level can be replaced. Times are in tics.
  Level *level=game->level;
  World *world;
  Player *player;
  I64 next;
  if (!level || par<0) throw('Level');
  world=level->world; player=&level->player;
  WorldIdle(world);
  if (!(TM_EXIT_NORMAL<=world->exit_rqst<=TM_EXIT_SECRET)) throw('Exit');
  next=MapNext(level->episode,level->map_num,game->commercial,
	world->exit_rqst==TM_EXIT_SECRET);
  MemSet(tmpi,0,sizeof(Intermission));
  tmpi->episode=level->episode; tmpi->map_num=level->map_num;
  tmpi->next=next; tmpi->commercial=game->commercial;
  tmpi->secret=world->exit_rqst==TM_EXIT_SECRET;
  tmpi->did_secret=did_secret || !game->commercial && level->map_num==9;
  tmpi->finale=MapFinale(level->map_num,game->commercial,tmpi->secret);
  tmpi->kills=player->kills*100/MaxI64(world->total_kills,1);
  tmpi->items=player->items*100/MaxI64(world->total_items,1);
  tmpi->secrets=player->secrets*100/MaxI64(world->total_secrets,1);
  tmpi->time=world->tic/TM_TICK_HZ; tmpi->par=par/TM_TICK_HZ;
  tmpi->shown_kills=tmpi->shown_items=tmpi->shown_secrets=-1;
  tmpi->shown_time=tmpi->shown_par=-1;
  tmpi->attack_down=player->attack_down; tmpi->use_down=player->use_down;
  tmpi->state=1; tmpi->wait=TM_TICK_HZ;
  if (!next) tmpi->phase=TM_IM_DONE;
}

U0 IntermissionSnd(Intermission *tmpi,I64 n)
{
  if (tmpi->sound) (*tmpi->sound)(n,tmpi->context);
}

U0 IntermissionWait(Intermission *tmpi)
{
  tmpi->phase=TM_IM_WAIT; tmpi->wait=10;
}

U0 IntermissionTick(Intermission *tmpi,I64 buttons)
{//A new attack/use press skips one stage; a held exit key does not.
  Bool attack=!!(buttons&TM_BTF_ATTACK),use=!!(buttons&TM_BTF_USE),
	accelerate=attack && !tmpi->attack_down || use && !tmpi->use_down;
  I64 *shown,target;
  if (tmpi->phase==TM_IM_DONE) return;
  tmpi->attack_down=attack; tmpi->use_down=use;
  tmpi->tic++;
  if (tmpi->phase==TM_IM_WAIT) {
    if (!--tmpi->wait) tmpi->phase=TM_IM_DONE;
    return;
  }
  if (tmpi->phase==TM_IM_NEXT) {
    if (!--tmpi->wait || accelerate) IntermissionWait(tmpi);
    return;
  }
  if (accelerate && tmpi->state!=10) {
    accelerate=FALSE;
    tmpi->shown_kills=tmpi->kills; tmpi->shown_items=tmpi->items;
    tmpi->shown_secrets=tmpi->secrets;
    tmpi->shown_time=tmpi->time; tmpi->shown_par=tmpi->par;
    IntermissionSnd(tmpi,TM_SFX_BAREXP); tmpi->state=10;
  }
  switch (tmpi->state) {
    case 2:
    case 4:
    case 6:
      switch (tmpi->state) {
	case 2: shown=&tmpi->shown_kills; target=tmpi->kills; break;
	case 4: shown=&tmpi->shown_items; target=tmpi->items; break;
	case 6: shown=&tmpi->shown_secrets; target=tmpi->secrets; break;
      }
      *shown+=2;
      if (!(tmpi->tic&3)) IntermissionSnd(tmpi,TM_SFX_PISTOL);
      if (*shown>=target) {
	*shown=target; tmpi->state++;
	IntermissionSnd(tmpi,TM_SFX_BAREXP);
      }
      break;
    case 8:
      if (!(tmpi->tic&3)) IntermissionSnd(tmpi,TM_SFX_PISTOL);
      tmpi->shown_time=MinI64(tmpi->shown_time+3,tmpi->time);
      tmpi->shown_par=MinI64(tmpi->shown_par+3,tmpi->par);
      if (tmpi->shown_time==tmpi->time && tmpi->shown_par==tmpi->par) {
	tmpi->state++; IntermissionSnd(tmpi,TM_SFX_BAREXP);
      }
      break;
    case 10:
      if (accelerate) {
	IntermissionSnd(tmpi,TM_SFX_SGCOCK);
	if (tmpi->commercial) IntermissionWait(tmpi);
	else {tmpi->phase=TM_IM_NEXT; tmpi->wait=4*TM_TICK_HZ;}
      }
      break;
    default:
      if (!--tmpi->wait) {tmpi->state++; tmpi->wait=TM_TICK_HZ;}
  }
}
