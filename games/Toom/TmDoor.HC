#define TM_DOOR_RAISE		0
#define TM_DOOR_CLOSE_OPEN	1
#define TM_DOOR_CLOSE		2
#define TM_DOOR_OPEN		3
#define TM_DOOR_RAISE_5MIN	4
#define TM_DOOR_BLAZE_RAISE	5
#define TM_DOOR_BLAZE_OPEN	6
#define TM_DOOR_BLAZE_CLOSE	7
#define TM_DOOR_SPEED		(2*65536)
#define TM_DOOR_WAIT		150

U0 DoorSnd(Sectors *tmps,Mover *tmpm,Bool opening)
{
  I64 n=TM_SFX_DORCLS;
  if (opening) n=TM_SFX_DOROPN;
  if (tmpm->type>=TM_DOOR_BLAZE_RAISE) {
    n=TM_SFX_BDCLS;
    if (opening) n=TM_SFX_BDOPN;
  }
  SectorSnd(tmps,tmpm->sector,n);
}

Mover *DoorNew(Sectors *tmps,I64 sector,I64 type,Bool sound=TRUE)
{//Controllers own timing; the shared plane routine owns geometry and contacts.
  Sector *tmps1;
  Mover *tmpm;
  Bool found;
  if (!(0<=type<=TM_DOOR_BLAZE_CLOSE)) throw('Door');
  if (!(tmpm=MoverNew(tmps,sector,TM_MOVER_DOOR))) return NULL;
  tmps1=tmps->motion->world->map->sector+sector;
  tmpm->type=type; tmpm->speed=TM_DOOR_SPEED; tmpm->wait=TM_DOOR_WAIT;
  tmpm->high=SectorCeilMin(tmps,sector,&found);
  if (found) tmpm->high=MaxI64(tmps1->floor,tmpm->high-4*65536);
  tmpm->direction=1;
  if (type>=TM_DOOR_BLAZE_RAISE) tmpm->speed*=4;
  if (type==TM_DOOR_CLOSE_OPEN) tmpm->high=tmps1->ceil;
  switch (type) {
    case TM_DOOR_CLOSE_OPEN:
    case TM_DOOR_CLOSE:
    case TM_DOOR_BLAZE_CLOSE:
      tmpm->direction=-1;
      if (sound) DoorSnd(tmps,tmpm,FALSE);
      break;
    case TM_DOOR_RAISE_5MIN:
      tmpm->direction=2; tmpm->delay=5*60*TM_TICK_HZ;
      break;
    default:
      if (sound && tmpm->high!=tmps1->ceil) DoorSnd(tmps,tmpm,TRUE);
  }
  return tmpm;
}

U0 DoorTick(Sectors *tmps,Mover *tmpm)
{
  I64 res;
  if (!tmpm->active || tmpm->kind!=TM_MOVER_DOOR) return;
  switch (tmpm->direction) {
    case 0:
      if (!--tmpm->delay) {
	if (tmpm->type==TM_DOOR_CLOSE_OPEN) {
	  tmpm->direction=1; DoorSnd(tmps,tmpm,TRUE);
	} else {
	  tmpm->direction=-1; DoorSnd(tmps,tmpm,FALSE);
	}
      }
      break;
    case 2:
      if (!--tmpm->delay) {
	tmpm->type=TM_DOOR_RAISE; tmpm->direction=1;
	DoorSnd(tmps,tmpm,TRUE);
      }
      break;
    case -1:
      res=SectorMove(tmps,tmpm->sector,tmpm->speed,
	    tmps->motion->world->map->sector[tmpm->sector].floor,FALSE,TRUE,-1);
      if (res==TM_PLANE_PAST) {
	if (tmpm->type==TM_DOOR_CLOSE_OPEN) {
	  tmpm->direction=0; tmpm->delay=30*TM_TICK_HZ;
	} else {
	  MoverFinish(tmps,tmpm);
	  if (tmpm->type==TM_DOOR_BLAZE_RAISE ||
		tmpm->type==TM_DOOR_BLAZE_CLOSE) DoorSnd(tmps,tmpm,FALSE);
	}
      } else if (res==TM_PLANE_CRUSHED && tmpm->type!=TM_DOOR_CLOSE &&
	    tmpm->type!=TM_DOOR_BLAZE_CLOSE) {
	tmpm->direction=1; SectorSnd(tmps,tmpm->sector,TM_SFX_DOROPN);
      }
      break;
    case 1:
      res=SectorMove(tmps,tmpm->sector,tmpm->speed,tmpm->high,FALSE,TRUE,1);
      if (res==TM_PLANE_PAST) {
	if (tmpm->type==TM_DOOR_RAISE || tmpm->type==TM_DOOR_BLAZE_RAISE) {
	  tmpm->direction=0; tmpm->delay=tmpm->wait;
	} else MoverFinish(tmps,tmpm);
      }
      break;
  }
}

Bool DoorKey(Sectors *tmps,Actor *actor,I64 key)
{
  Motion *motion=tmps->motion;
  Player *player=MotionPlayer(motion,actor);
  if (!player) return FALSE;
  if (player->card[key] || player->card[key+3]) return TRUE;
  if (tmps->key_rqst) (*tmps->key_rqst)(actor,key);
  if (motion->sound) (*motion->sound)(actor,TM_SFX_OOF);
  return FALSE;
}

Bool DoorUse(Sectors *tmps,Actor *actor,I64 line,I64 side)
{//Only the front of a manual door can be used; each color accepts either key.
  Map *map=tmps->motion->world->map;
  Line *tmpl;
  Mover *tmpm;
  I64 type=TM_DOOR_RAISE,n;
  Bool stay=FALSE;
  if (!actor->active || side || !(0<=line<map->line_cnt)) return FALSE;
  tmpl=map->line+line;
  if (tmpl->side[1]==0xFFFF) return FALSE;
  if (!MotionPlayer(tmps->motion,actor) &&
	(tmpl->flags&32 || tmpl->special!=1)) return FALSE;
  switch (tmpl->special) {
    case 26:
    case 32:
      if (!DoorKey(tmps,actor,TM_IT_BLUECARD)) return FALSE;
      break;
    case 27:
    case 34:
      if (!DoorKey(tmps,actor,TM_IT_YELLOWCARD)) return FALSE;
      break;
    case 28:
    case 33:
      if (!DoorKey(tmps,actor,TM_IT_REDCARD)) return FALSE;
      break;
    case 1:
    case 31:
    case 117:
    case 118:
      break;
    default:
      return FALSE;
  }
  if (31<=tmpl->special<=34 || tmpl->special==118) stay=TRUE;
  if (stay) type=TM_DOOR_OPEN;
  if (tmpl->special==117) type=TM_DOOR_BLAZE_RAISE;
  if (tmpl->special==118) type=TM_DOOR_BLAZE_OPEN;
  n=map->side[tmpl->side[1]].sector;
  if (tmpm=tmps->area[n].mover) {
    if (stay || tmpm->kind!=TM_MOVER_DOOR) return FALSE;
    if (tmpm->direction==-1) tmpm->direction=1;
    else {
      if (!MotionPlayer(tmps->motion,actor)) return FALSE;
      tmpm->direction=-1;
    }
    return TRUE;
  }
  if (!(tmpm=DoorNew(tmps,n,type,FALSE))) return FALSE;
  if (stay) tmpl->special=0;
  DoorSnd(tmps,tmpm,TRUE);
  return TRUE;
}

Bool DoorTag(Sectors *tmps,I64 line,I64 type)
{
  Map *map=tmps->motion->world->map;
  I64 i;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag)
      if (DoorNew(tmps,i,type)) res=TRUE;
  return res;
}

Bool DoorLocked(Sectors *tmps,Actor *actor,I64 line,I64 type)
{
  Map *map=tmps->motion->world->map;
  I64 key;
  if (!actor->active || !(0<=line<map->line_cnt)) return FALSE;
  switch (map->line[line].special) {
    case 99:
    case 133:
      key=TM_IT_BLUECARD;
      break;
    case 134:
    case 135:
      key=TM_IT_REDCARD;
      break;
    case 136:
    case 137:
      key=TM_IT_YELLOWCARD;
      break;
    default:
      return FALSE;
  }
  if (!DoorKey(tmps,actor,key)) return FALSE;
  return DoorTag(tmps,line,type);
}

Mover *DoorTimerNew(Sectors *tmps,I64 sector)
{//Both delayed forms initialize their reopening height and wait explicitly.
  Map *map=tmps->motion->world->map;
  Mover *tmpm=NULL;
  if (map->sector[sector].special==10) {
    tmpm=DoorNew(tmps,sector,TM_DOOR_RAISE,FALSE);
    if (tmpm) {
      tmpm->high=map->sector[sector].ceil;
      tmpm->direction=0; tmpm->delay=30*TM_TICK_HZ;
    }
  } else if (map->sector[sector].special==14)
    tmpm=DoorNew(tmps,sector,TM_DOOR_RAISE_5MIN,FALSE);
  if (tmpm) map->sector[sector].special=0;
  return tmpm;
}

U0 DoorTimersInit(Sectors *tmps)
{
  I64 i;
  for (i=0;i<tmps->motion->world->map->sector_cnt;i++) DoorTimerNew(tmps,i);
}
