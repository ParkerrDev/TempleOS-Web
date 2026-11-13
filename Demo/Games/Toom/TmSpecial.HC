class Specials
{
  Sectors *sectors;
  Switches *switches;
  Lights *lights;
  Bool monsters_stomp,initialized;
};

U0 SpecialsDel(Specials *tmps)
{
  if (tmps) {
    WorldIdle(tmps->sectors->motion->world);
    SwitchesDel(tmps->switches); LightsDel(tmps->lights); Free(tmps);
  }
}

Specials *SpecialsNew(Sectors *sectors)
{//Event state owns its switches and lights, and borrows the plane controllers.
  Specials *tmps;
  WorldIdle(sectors->motion->world);
  tmps=CAlloc(sizeof(Specials)); tmps->sectors=sectors;
  try {
    tmps->switches=SwitchesNew(sectors); tmps->lights=LightsNew(sectors);
  } catch {
    SpecialsDel(tmps);
  }
  return tmps;
}

U0 SpecialsInit(Specials *tmps)
{//Mix light and delayed-door creation in the original sector order.
  World *world=tmps->sectors->motion->world;
  I64 i;
  if (tmps->initialized || tmps->lights->initialized) throw('Loaded');
  tmps->initialized=tmps->lights->initialized=TRUE;
  world->total_secrets=0;
  for (i=0;i<world->map->sector_cnt;i++) {
    if (world->map->sector[i].special==9) world->total_secrets++;
    LightSectorInit(tmps->lights,i); DoorTimerNew(tmps->sectors,i);
  }
}

Bool LineUse(Specials *tmps,Actor *actor,I64 line,I64 side)
{//A permitted use attempt stops at this line even when no action can start.
  Sectors *sectors=tmps->sectors;
  Motion *motion=sectors->motion;
  Map *map=motion->world->map;
  I64 n;
  Bool res=FALSE,repeat=FALSE;
  if (actor->world!=motion->world) throw('World');
  if (!actor->active || !(0<=line<map->line_cnt)) return FALSE;
  n=map->line[line].special;
  if (side && n!=124) return FALSE;
  if (!MotionPlayer(motion,actor) &&
	(map->line[line].flags&32 || !(n==1 || 32<=n<=34))) return FALSE;
  switch (n) {
    case 1:
    case 26:
    case 27:
    case 28:
    case 31:
    case 32:
    case 33:
    case 34:
    case 117:
    case 118:
      DoorUse(sectors,actor,line,side);
      return TRUE;
    case 11:
    case 51:
      SwitchChange(tmps->switches,line,FALSE);
      motion->world->exit_rqst=TM_EXIT_NORMAL+(n==51);
      return TRUE;
    case 7:
      res=FloorStairs(sectors,line);
      break;
    case 9:
      res=FloorDonut(sectors,line);
      break;
    case 14:
    case 67:
      repeat=n==67;
      res=PlatTag(sectors,line,TM_PLAT_RAISE_CHANGE,32);
      break;
    case 15:
    case 66:
      repeat=n==66;
      res=PlatTag(sectors,line,TM_PLAT_RAISE_CHANGE,24);
      break;
    case 18:
    case 69:
      repeat=n==69;
      res=FloorTag(sectors,line,TM_FLOOR_NEAREST);
      break;
    case 20:
    case 68:
      repeat=n==68;
      res=PlatTag(sectors,line,TM_PLAT_NEAREST_CHANGE);
      break;
    case 21:
      res=PlatTag(sectors,line,TM_PLAT_DOWN_WAIT_UP);
      break;
    case 23:
    case 60:
      repeat=n==60;
      res=FloorTag(sectors,line,TM_FLOOR_LOWEST);
      break;
    case 29:
    case 63:
      repeat=n==63;
      res=DoorTag(sectors,line,TM_DOOR_RAISE);
      break;
    case 41:
    case 43:
      repeat=n==43;
      res=CeilTag(sectors,line,TM_CEIL_LOWER_FLOOR);
      break;
    case 42:
    case 50:
      repeat=n==42;
      res=DoorTag(sectors,line,TM_DOOR_CLOSE);
      break;
    case 45:
    case 102:
      repeat=n==45;
      res=FloorTag(sectors,line,TM_FLOOR_LOWER);
      break;
    case 49:
      res=CeilTag(sectors,line,TM_CEIL_CRUSH_RAISE);
      break;
    case 55:
    case 65:
      repeat=n==65;
      res=FloorTag(sectors,line,TM_FLOOR_CRUSH);
      break;
    case 61:
    case 103:
      repeat=n==61;
      res=DoorTag(sectors,line,TM_DOOR_OPEN);
      break;
    case 62:
      repeat=TRUE;
      res=PlatTag(sectors,line,TM_PLAT_DOWN_WAIT_UP,1);
      break;
    case 64:
    case 101:
      repeat=n==64;
      res=FloorTag(sectors,line,TM_FLOOR_RAISE);
      break;
    case 70:
    case 71:
      repeat=n==70;
      res=FloorTag(sectors,line,TM_FLOOR_TURBO_LOWER);
      break;
    case 99:
    case 133:
    case 134:
    case 135:
    case 136:
    case 137:
      repeat=n==99 || n==134 || n==136;
      res=DoorLocked(sectors,actor,line,TM_DOOR_BLAZE_OPEN);
      break;
    case 111:
    case 114:
      repeat=n==114;
      res=DoorTag(sectors,line,TM_DOOR_BLAZE_RAISE);
      break;
    case 112:
    case 115:
      repeat=n==115;
      res=DoorTag(sectors,line,TM_DOOR_BLAZE_OPEN);
      break;
    case 113:
    case 116:
      repeat=n==116;
      res=DoorTag(sectors,line,TM_DOOR_BLAZE_CLOSE);
      break;
    case 122:
    case 123:
      repeat=n==123;
      res=PlatTag(sectors,line,TM_PLAT_BLAZE);
      break;
    case 127:
      res=FloorStairs(sectors,line,TRUE);
      break;
    case 131:
    case 132:
      repeat=n==132;
      res=FloorTag(sectors,line,TM_FLOOR_TURBO_RAISE);
      break;
    case 140:
      res=FloorTag(sectors,line,TM_FLOOR_RAISE_512);
      break;
    case 138:
    case 139:
      if (n==138) LightTagOn(sectors,line,255);
      else LightTagOn(sectors,line,35);
      res=repeat=TRUE;
      break;
  }
  if (res) SwitchChange(tmps->switches,line,repeat);
  return TRUE;
}

U0 PlayerUse(Specials *tmps,Actor *actor)
{//The first special line ends the trace, including an unusable back side.
  Motion *motion=tmps->sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  Path *path=motion->path;
  Line *line;
  ClipLine *clip;
  Sector *front,*back;
  I64 i,n,side,range=0;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  if (!PathRun(path,actor->x,actor->y,
	actor->x+64*AngleCos(world->data,actor->angle),
	actor->y+64*AngleSin(world->data,actor->angle),TM_PATH_LINES)) return;
  for (i=0;i<path->cnt;i++) {
    n=path->hit[i].line; line=map->line+n;
    if (line->special) {
      clip=world->collision->line+n;
      side=FixedSide(actor->x,actor->y,clip->ax,clip->ay,clip->dx,clip->dy);
      LineUse(tmps,actor,n,side);
      return;
    }
    range=0;
    if (line->side[1]!=0xFFFF) {
      front=map->sector+map->side[line->side[0]].sector;
      back=map->sector+map->side[line->side[1]].sector;
      range=MinI64(front->ceil,back->ceil)-MaxI64(front->floor,back->floor);
    }
    if (range<=0) {
      if (motion->sound) (*motion->sound)(actor,TM_SFX_NOWAY);
      return;
    }
  }
}

U0 LineCross(Specials *tmps,Actor *actor,I64 line,I64 side)
{//Once-only crossings consume their trigger even when its action cannot start.
  Sectors *sectors=tmps->sectors;
  Motion *motion=sectors->motion;
  Map *map=motion->world->map;
  I64 n;
  Bool player=!!MotionPlayer(motion,actor),once=TRUE;
  if (actor->world!=motion->world) throw('World');
  if (!actor->active || !(0<=line<map->line_cnt)) return;
  n=map->line[line].special;
  if (!player) {
    switch (actor->type) {
      case TM_MT_ROCKET:
      case TM_MT_PLASMA:
      case TM_MT_BFG:
      case TM_MT_TROOPSHOT:
      case TM_MT_HEADSHOT:
      case TM_MT_BRUISERSHOT:
	return;
    }
    switch (n) {
      case 39:
      case 97:
      case 125:
      case 126:
      case 4:
      case 10:
      case 88:
	break;
      default:
	return;
    }
  }
  switch (n) {
    case 52:
    case 124:
      motion->world->exit_rqst=TM_EXIT_NORMAL+(n==124);
      return;
    case 125:
    case 126:
      if (player) return;
      once=n==125;
      ActorTeleport(motion,actor,line,side,tmps->monsters_stomp);
      break;
    case 39:
    case 97:
      once=n==39;
      ActorTeleport(motion,actor,line,side,tmps->monsters_stomp);
      break;
    case 40:
      CeilTag(sectors,line,TM_CEIL_RAISE_HIGHEST);
      FloorTag(sectors,line,TM_FLOOR_LOWEST);
      break;
    case 2:
    case 86:
      once=n==2;
      DoorTag(sectors,line,TM_DOOR_OPEN);
      break;
    case 3:
    case 75:
      once=n==3;
      DoorTag(sectors,line,TM_DOOR_CLOSE);
      break;
    case 4:
    case 90:
      once=n==4;
      DoorTag(sectors,line,TM_DOOR_RAISE);
      break;
    case 5:
    case 91:
      once=n==5;
      FloorTag(sectors,line,TM_FLOOR_RAISE);
      break;
    case 6:
    case 77:
      once=n==6;
      CeilTag(sectors,line,TM_CEIL_FAST);
      break;
    case 8:
      FloorStairs(sectors,line);
      break;
    case 10:
    case 88:
      once=n==10;
      PlatTag(sectors,line,TM_PLAT_DOWN_WAIT_UP);
      break;
    case 12:
    case 80:
      once=n==12;
      LightTagOn(sectors,line,0);
      break;
    case 13:
    case 81:
      once=n==13;
      LightTagOn(sectors,line,255);
      break;
    case 16:
    case 76:
      once=n==16;
      DoorTag(sectors,line,TM_DOOR_CLOSE_OPEN);
      break;
    case 17:
      LightStrobeTag(tmps->lights,line);
      break;
    case 19:
    case 83:
      once=n==19;
      FloorTag(sectors,line,TM_FLOOR_LOWER);
      break;
    case 22:
    case 95:
      once=n==22;
      PlatTag(sectors,line,TM_PLAT_NEAREST_CHANGE);
      break;
    case 25:
    case 73:
      once=n==25;
      CeilTag(sectors,line,TM_CEIL_CRUSH_RAISE);
      break;
    case 30:
    case 96:
      once=n==30;
      FloorTag(sectors,line,TM_FLOOR_TEXTURE);
      break;
    case 35:
    case 79:
      once=n==35;
      LightTagOn(sectors,line,35);
      break;
    case 36:
    case 98:
      once=n==36;
      FloorTag(sectors,line,TM_FLOOR_TURBO_LOWER);
      break;
    case 37:
    case 84:
      once=n==37;
      FloorTag(sectors,line,TM_FLOOR_LOWER_CHANGE);
      break;
    case 38:
    case 82:
      once=n==38;
      FloorTag(sectors,line,TM_FLOOR_LOWEST);
      break;
    case 44:
    case 72:
      once=n==44;
      CeilTag(sectors,line,TM_CEIL_LOWER_CRUSH);
      break;
    case 53:
    case 87:
      once=n==53;
      PlatTag(sectors,line,TM_PLAT_PERPETUAL);
      break;
    case 54:
    case 89:
      once=n==54;
      PlatStop(sectors,line);
      break;
    case 56:
    case 94:
      once=n==56;
      FloorTag(sectors,line,TM_FLOOR_CRUSH);
      break;
    case 57:
    case 74:
      once=n==57;
      CeilStop(sectors,line);
      break;
    case 58:
    case 92:
      once=n==58;
      FloorTag(sectors,line,TM_FLOOR_RAISE_24);
      break;
    case 59:
    case 93:
      once=n==59;
      FloorTag(sectors,line,TM_FLOOR_RAISE_CHANGE);
      break;
    case 100:
      FloorStairs(sectors,line,TRUE);
      break;
    case 104:
      LightTagOff(sectors,line);
      break;
    case 105:
    case 108:
      once=n==108;
      DoorTag(sectors,line,TM_DOOR_BLAZE_RAISE);
      break;
    case 106:
    case 109:
      once=n==109;
      DoorTag(sectors,line,TM_DOOR_BLAZE_OPEN);
      break;
    case 107:
    case 110:
      once=n==110;
      DoorTag(sectors,line,TM_DOOR_BLAZE_CLOSE);
      break;
    case 119:
    case 128:
      once=n==119;
      FloorTag(sectors,line,TM_FLOOR_NEAREST);
      break;
    case 120:
    case 121:
      once=n==121;
      PlatTag(sectors,line,TM_PLAT_BLAZE);
      break;
    case 129:
    case 130:
      once=n==130;
      FloorTag(sectors,line,TM_FLOOR_TURBO_RAISE);
      break;
    case 141:
      CeilTag(sectors,line,TM_CEIL_SILENT);
      break;
    default:
      return;
  }
  if (once) map->line[line].special=0;
}

U0 LineShoot(Specials *tmps,Actor *actor,I64 line)
{//Shot switches change even when an existing mover rejects the new request.
  Sectors *sectors=tmps->sectors;
  Motion *motion=sectors->motion;
  Map *map=motion->world->map;
  I64 n;
  if (actor->world!=motion->world) throw('World');
  if (!actor->active || !(0<=line<map->line_cnt)) return;
  n=map->line[line].special;
  if (!MotionPlayer(motion,actor) && n!=46) return;
  switch (n) {
    case 24:
      FloorTag(sectors,line,TM_FLOOR_RAISE);
      SwitchChange(tmps->switches,line,FALSE);
      break;
    case 46:
      DoorTag(sectors,line,TM_DOOR_OPEN);
      SwitchChange(tmps->switches,line,TRUE);
      break;
    case 47:
      PlatTag(sectors,line,TM_PLAT_NEAREST_CHANGE);
      SwitchChange(tmps->switches,line,FALSE);
      break;
  }
}
