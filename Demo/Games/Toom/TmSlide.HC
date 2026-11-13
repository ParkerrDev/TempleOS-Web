U0 SlideVector(World *tmpw,Actor *tmpa,ClipLine *tmpl,I64 *_vx,I64 *_vy)
{//Project the remaining move with the original integer angle tables.
  I64 angle,delta,len;
  if (!tmpl->dy) {*_vy=0; return;}
  if (!tmpl->dx) {*_vx=0; return;}
  angle=AngleFrom(tmpw->data,tmpl->dx*65536,tmpl->dy*65536);
  if (FixedSide(tmpa->x,tmpa->y,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy))
    angle=(angle+0x80000000)&0xFFFFFFFF;
  delta=(AngleFrom(tmpw->data,*_vx,*_vy)-angle)&0xFFFFFFFF;
  if (delta>0x80000000) delta=(delta+0x80000000)&0xFFFFFFFF;
  len=FixedMul(DistanceApprox(*_vx,*_vy),AngleCos(tmpw->data,delta));
  *_vx=FixedMul(len,AngleCos(tmpw->data,angle));
  *_vy=FixedMul(len,AngleSin(tmpw->data,angle));
}

Bool SlideBlocking(World *tmpw,Actor *tmpa,I64 n)
{
  ClipLine *tmpl=tmpw->collision->line+n;
  Line *line=tmpw->map->line+n;
  Sector *front,*back;
  I64 floor,ceil;
  if (tmpl->back<0)
    return !FixedSide(tmpa->x,tmpa->y,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
  if (line->flags&1 || tmpa->type!=TM_MT_PLAYER && line->flags&2)
    return TRUE;
  front=tmpw->map->sector+tmpl->front;
  back=tmpw->map->sector+tmpl->back;
  floor=MaxI64(front->floor,back->floor);
  ceil=MinI64(front->ceil,back->ceil);
  return ceil-floor<tmpa->height || ceil-tmpa->z<tmpa->height ||
	floor-tmpa->z>24*65536;
}

U0 SlideTrace(Path *tmpp,Actor *tmpa,I64 x,I64 y,
	I64 *_fraction,I64 *_line)
{
  I64 i,n;
  if (!PathRun(tmpp,x,y,x+tmpa->vx,y+tmpa->vy,TM_PATH_LINES)) return;
  for (i=0;i<tmpp->cnt;i++) {
    n=tmpp->hit[i].line;
    if (SlideBlocking(tmpp->world,tmpa,n)) {
      if (tmpp->hit[i].fraction<*_fraction) {
	*_fraction=tmpp->hit[i].fraction; *_line=n;
      }
      break;
    }
  }
}

U0 WorldSlide(World *tmpw,Actor *tmpa,Path *tmpp,
	U0 (*touch)(Actor *mover,Actor *other,I64 kind)=NULL,
	U0 (*cross)(Actor *actor,I64 line,I64 side)=NULL)
{//Three leading corners find a wall; two attempts bound a corner slide.
  I64 tries,lead_x,lead_y,trail_x,trail_y,fraction,line,near,vx,vy;
  if (tmpp->world!=tmpw) throw('World');
  for (tries=0;tries<2 && tmpa->active;tries++) {
    lead_x=tmpa->x-tmpa->radius; trail_x=tmpa->x+tmpa->radius;
    lead_y=tmpa->y-tmpa->radius; trail_y=tmpa->y+tmpa->radius;
    if (tmpa->vx>0) SwapI64(&lead_x,&trail_x);
    if (tmpa->vy>0) SwapI64(&lead_y,&trail_y);
    fraction=65537; line=-1;
    SlideTrace(tmpp,tmpa,lead_x,lead_y,&fraction,&line);
    SlideTrace(tmpp,tmpa,trail_x,lead_y,&fraction,&line);
    SlideTrace(tmpp,tmpa,lead_x,trail_y,&fraction,&line);
    if (line<0) break;
    //The 1/32 move backoff keeps the next box clear of the hit line.
    near=fraction-0x800;
    if (near>0 && !WorldTryMove(tmpw,tmpa,
	  tmpa->x+FixedMul(tmpa->vx,near),
	  tmpa->y+FixedMul(tmpa->vy,near),touch,cross)) break;
    if (!tmpa->active) return;
    fraction=65536-fraction;
    if (fraction<=0) return;
    vx=FixedMul(tmpa->vx,fraction); vy=FixedMul(tmpa->vy,fraction);
    SlideVector(tmpw,tmpa,tmpw->collision->line+line,&vx,&vy);
    tmpa->vx=vx; tmpa->vy=vy;
    if (WorldTryMove(tmpw,tmpa,tmpa->x+vx,tmpa->y+vy,touch,cross)) return;
  }
  if (tmpa->active &&
	!WorldTryMove(tmpw,tmpa,tmpa->x,tmpa->y+tmpa->vy,touch,cross) &&
	tmpa->active)
    WorldTryMove(tmpw,tmpa,tmpa->x+tmpa->vx,tmpa->y,touch,cross);
}
