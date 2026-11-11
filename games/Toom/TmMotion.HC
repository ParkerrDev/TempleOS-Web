#define TM_MOVE_MAX	(30*65536)
#define TM_STOP_SPEED	0x1000
#define TM_FRICTION	0xE800
#define TM_GRAVITY	65536
#define TM_VIEW_HEIGHT	(41*65536)

class Motion
{
  World *world;
  Path *path;
  Player *player;
  U0 (*action)(Actor *actor,I64 n);
  U0 (*touch)(Actor *mover,Actor *other,I64 kind);
  U0 (*cross)(Actor *actor,I64 line,I64 side);
  U0 (*sound)(Actor *actor,I64 n);
};

U0 MotionDel(Motion *tmpm)
{
  if (tmpm) {
    PathDel(tmpm->path); Free(tmpm);
  }
}

Motion *MotionNew(World *tmpw,Player *tmpp=NULL)
{//The level and persistent player state are borrowed; the path is owned.
  Motion *tmpm=CAlloc(sizeof(Motion));
  tmpm->world=tmpw; tmpm->player=tmpp; tmpm->path=PathNew(tmpw);
  return tmpm;
}

Player *MotionPlayer(Motion *tmpm,Actor *tmpa)
{
  if (tmpa->id==tmpm->world->player) return tmpm->player;
  return NULL;
}

U0 MissileExplode(Motion *tmpm,Actor *tmpa)
{
  World *tmpw=tmpm->world;
  ActorInfo *info=tmpw->data->info+tmpa->type;
  tmpa->vx=tmpa->vy=tmpa->vz=0;
  if (!ActorState(tmpw->data,tmpa,info->death,tmpm->action)) return;
  tmpa->tics=MaxI64(tmpa->tics-GameRand(tmpw->data,&tmpw->random)&3,1);
  tmpa->flags&=~TM_MF_MISSILE;
  if (tmpm->sound && info->death_snd) (*tmpm->sound)(tmpa,info->death_snd);
}

Bool MissileSky(Motion *tmpm)
{
  World *tmpw=tmpm->world;
  I64 n=tmpw->collision->ceil_line,back;
  if (n<0) return FALSE;
  back=tmpw->collision->line[n].back;
  return back>=0 && SectorSky(tmpw->map->sector+back);
}

U0 ActorXY(Motion *tmpm,Actor *tmpa)
{//One 35 Hz tic, with symmetric substeps preserving odd fixed-point deltas.
  World *tmpw=tmpm->world;
  Player *tmpp=MotionPlayer(tmpm,tmpa);
  I64 dx,dy,xmove,ymove;
  if (!tmpa->vx && !tmpa->vy) {
    if (tmpa->flags&TM_MF_SKULLFLY) {
      tmpa->flags&=~TM_MF_SKULLFLY;
      tmpa->vx=tmpa->vy=tmpa->vz=0;
      ActorState(tmpw->data,tmpa,tmpw->data->info[tmpa->type].spawn,
	    tmpm->action);
    }
    return;
  }
  tmpa->vx=ClampI64(tmpa->vx,-TM_MOVE_MAX,TM_MOVE_MAX);
  tmpa->vy=ClampI64(tmpa->vy,-TM_MOVE_MAX,TM_MOVE_MAX);
  xmove=tmpa->vx; ymove=tmpa->vy;
  do {
    dx=xmove; dy=ymove;
    if (AbsI64(dx)>TM_MOVE_MAX/2 || AbsI64(dy)>TM_MOVE_MAX/2) {
      dx/=2; dy/=2;
    }
    xmove-=dx; ymove-=dy;
    if (!WorldTryMove(tmpw,tmpa,tmpa->x+dx,tmpa->y+dy,
	  tmpm->touch,tmpm->cross)) {
      if (!tmpa->active) return;
      if (tmpp) {
	//Only the uncommitted remainder may slide after a partial move.
	tmpa->vx=dx+xmove; tmpa->vy=dy+ymove;
	WorldSlide(tmpw,tmpa,tmpm->path,tmpm->touch,tmpm->cross);
      } else if (tmpa->flags&TM_MF_MISSILE) {
	if (MissileSky(tmpm)) tmpa->active=FALSE;
	else MissileExplode(tmpm,tmpa);
	return;
      } else
	tmpa->vx=tmpa->vy=0;
      break;
    }
    if (!tmpa->active) return;
  } while (xmove || ymove);
  if (!tmpa->active) return;
  if (tmpp && tmpp->no_momentum) {
    tmpa->vx=tmpa->vy=0; return;
  }
  if (tmpa->flags&(TM_MF_MISSILE|TM_MF_SKULLFLY) || tmpa->z>tmpa->floor)
    return;
  if (tmpa->flags&TM_MF_CORPSE &&
	(AbsI64(tmpa->vx)>16384 || AbsI64(tmpa->vy)>16384) &&
	tmpa->floor!=tmpw->map->sector[tmpa->sector].floor*65536) return;
  if (AbsI64(tmpa->vx)<TM_STOP_SPEED && AbsI64(tmpa->vy)<TM_STOP_SPEED &&
	(!tmpp || !tmpp->forward && !tmpp->side)) {
    if (tmpp && TM_S_PLAY_RUN1<=tmpa->state<=TM_S_PLAY_RUN4)
      ActorState(tmpw->data,tmpa,TM_S_PLAY,tmpm->action);
    tmpa->vx=tmpa->vy=0;
  } else {
    tmpa->vx=FixedMul(tmpa->vx,TM_FRICTION);
    tmpa->vy=FixedMul(tmpa->vy,TM_FRICTION);
  }
}

U0 ActorZ(Motion *tmpm,Actor *tmpa)
{
  World *tmpw=tmpm->world;
  Player *tmpp=MotionPlayer(tmpm,tmpa);
  Actor *target;
  I64 distance,delta;
  if (tmpp && tmpa->z<tmpa->floor) {
    tmpp->view_height-=tmpa->floor-tmpa->z;
    tmpp->delta_view_height=(TM_VIEW_HEIGHT-tmpp->view_height)>>3;
  }
  tmpa->z+=tmpa->vz;
  if (tmpa->flags&TM_MF_FLOAT &&
	!(tmpa->flags&(TM_MF_SKULLFLY|TM_MF_INFLOAT)))
    if (target=WorldActorGet(tmpw,tmpa->target)) {
      distance=DistanceApprox(tmpa->x-target->x,tmpa->y-target->y);
      delta=target->z+tmpa->height>>1-tmpa->z;
      if (delta<0 && distance< -delta*3) tmpa->z-=4*65536;
      else if (delta>0 && distance<delta*3) tmpa->z+=4*65536;
    }
  if (tmpa->z<=tmpa->floor) {
    if (tmpa->flags&TM_MF_SKULLFLY) tmpa->vz=-tmpa->vz;
    if (tmpa->vz<0) {
      if (tmpp && tmpa->vz< -TM_GRAVITY*8) {
	tmpp->delta_view_height=tmpa->vz>>3;
	if (tmpm->sound) (*tmpm->sound)(tmpa,TM_SFX_OOF);
      }
      tmpa->vz=0;
    }
    tmpa->z=tmpa->floor;
    if (tmpa->flags&TM_MF_MISSILE && !(tmpa->flags&TM_MF_NOCLIP)) {
      MissileExplode(tmpm,tmpa); return;
    }
  } else if (!(tmpa->flags&TM_MF_NOGRAVITY)) {
    if (!tmpa->vz) tmpa->vz=-TM_GRAVITY*2;
    else tmpa->vz-=TM_GRAVITY;
  }
  if (tmpa->z+tmpa->height>tmpa->ceil) {
    if (tmpa->vz>0) tmpa->vz=0;
    tmpa->z=tmpa->ceil-tmpa->height;
    if (tmpa->flags&TM_MF_SKULLFLY) tmpa->vz=-tmpa->vz;
    if (tmpa->flags&TM_MF_MISSILE && !(tmpa->flags&TM_MF_NOCLIP))
      MissileExplode(tmpm,tmpa);
  }
}

Bool ActorMotion(Motion *tmpm,Actor *tmpa)
{//Drawing never advances motion or consumes simulation random numbers.
  if (!tmpa->active) return FALSE;
  if (tmpa->vx || tmpa->vy || tmpa->flags&TM_MF_SKULLFLY)
    ActorXY(tmpm,tmpa);
  if (tmpa->active && (tmpa->z!=tmpa->floor || tmpa->vz)) ActorZ(tmpm,tmpa);
  return tmpa->active;
}
