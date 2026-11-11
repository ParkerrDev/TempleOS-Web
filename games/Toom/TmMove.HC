Bool WorldTryMove(World *tmpw,Actor *tmpa,I64 x,I64 y,
	U0 (*touch)(Actor *mover,Actor *other,I64 kind)=NULL,
	U0 (*cross)(Actor *actor,I64 line,I64 side)=NULL)
{//Commit a valid position before invoking crossed-line actions.
  I64 old_x=tmpa->x,old_y=tmpa->y,n,i,side,old_side,*special=NULL;
  Collision *tmpc=tmpw->collision;
  ClipLine *tmpl;
  if (!WorldPosition(tmpw,tmpa,x,y,touch) || !tmpa->active) return FALSE;
  WorldActorUnlink(tmpw,tmpa);
  tmpa->x=x; tmpa->y=y; tmpa->sector=tmpc->sector;
  tmpa->floor=tmpc->floor; tmpa->ceil=tmpc->ceil;
  WorldActorLink(tmpw,tmpa);
  if (cross && !(tmpa->flags&(TM_MF_TELEPORT|TM_MF_NOCLIP))) {
    n=tmpc->special_cnt;
    if (n) {
      //Crossed-line actions may query or move actors themselves.
      special=MAlloc(n*sizeof(I64));
      MemCpy(special,tmpc->special,n*sizeof(I64));
      while (n && tmpa->active) {
	i=special[--n]; tmpl=tmpc->line+i;
	side=FixedSide(tmpa->x,tmpa->y,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
	old_side=FixedSide(old_x,old_y,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
	if (side!=old_side && tmpw->map->line[i].special)
	  (*cross)(tmpa,i,old_side);
      }
      Free(special);
    }
  }
  return TRUE;
}
