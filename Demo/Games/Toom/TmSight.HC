Bool ActorSight(Path *path,Actor *source,Actor *target)
{//Narrow the target's vertical interval through each crossed portal.
  World *world=path->world;
  Map *map=world->map;
  I64 n,i,eye=source->z+source->height-source->height>>2,
	top=target->z+target->height-eye,bottom=target->z-eye,
	floor,ceil,fraction;
  ClipLine *line;
  Sector *front,*back;
  if (!source->active || !target->active || source->world!=world ||
	target->world!=world || !(0<=source->sector<map->sector_cnt) ||
	!(0<=target->sector<map->sector_cnt)) return FALSE;
  n=source->sector*map->sector_cnt+target->sector;
  if (n>>3<map->reject_size && Bt(map->reject,n)) return FALSE;
  if (!PathRun(path,source->x,source->y,target->x,target->y,TM_PATH_LINES))
    return FALSE;
  for (i=0;i<path->cnt;i++) {
    line=world->collision->line+path->hit[i].line;
    if (line->back<0) return FALSE;
    front=map->sector+line->front; back=map->sector+line->back;
    floor=MaxI64(front->floor,back->floor);
    ceil=MinI64(front->ceil,back->ceil);
    if (floor>=ceil) return FALSE;
    fraction=path->hit[i].fraction;
    if (front->floor!=back->floor)
      bottom=MaxI64(bottom,FixedDiv(floor-eye,fraction));
    if (front->ceil!=back->ceil)
      top=MinI64(top,FixedDiv(ceil-eye,fraction));
    if (top<=bottom) return FALSE;
  }
  return TRUE;
}
