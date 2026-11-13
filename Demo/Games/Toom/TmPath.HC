#define TM_PATH_LINES	1
#define TM_PATH_ACTORS	2

class Intercept
{
  I64 fraction,line,actor;
};

class Path
{
  World *world;
  I64 x,y,dx,dy,flags,cnt,cap,stamp,*line_seen,*actor_seen,actor_cap;
  Intercept *hit;
};

U0 PathDel(Path *tmpp)
{
  if (tmpp) {
    Free(tmpp->hit); Free(tmpp->line_seen); Free(tmpp->actor_seen);
    Free(tmpp);
  }
}

Path *PathNew(World *tmpw)
{//A reusable trace borrows its world; collect before running any actions.
  Path *tmpp=CAlloc(sizeof(Path));
  tmpp->world=tmpw;
  try {
    tmpp->line_seen=CAlloc(tmpw->map->line_cnt*sizeof(I64));
    tmpp->cap=64; tmpp->hit=MAlloc(tmpp->cap*sizeof(Intercept));
  } catch {
    PathDel(tmpp);
  }
  return tmpp;
}

I64 PathSide(Path *tmpp,I64 x,I64 y)
{//Keep axis and exact-vertex ties without overflowing a signed cross product.
  if (!tmpp->dx) {
    if (x<=tmpp->x) return tmpp->dy>0;
    return tmpp->dy<0;
  }
  if (!tmpp->dy) {
    if (y<=tmpp->y) return tmpp->dx<0;
    return tmpp->dx>0;
  }
  return ProductCmp(tmpp->dx,y-tmpp->y,tmpp->dy,x-tmpp->x)>=0;
}

U0 PathHitAdd(Path *tmpp,I64 fraction,I64 line,I64 actor=0)
{//Nearest first; walls precede actor hits at an equal fraction.
  I64 i,key=line,prev_key;
  Intercept *hits,*prev;
  if (tmpp->cnt==tmpp->cap) {
    hits=MAlloc(2*tmpp->cap*sizeof(Intercept));
    MemCpy(hits,tmpp->hit,tmpp->cnt*sizeof(Intercept));
    Free(tmpp->hit); tmpp->hit=hits; tmpp->cap*=2;
  }
  if (key<0) key=tmpp->world->map->line_cnt+actor.u32[0];
  for (i=tmpp->cnt;i;i--) {
    prev=tmpp->hit+i-1;
    if (prev->fraction<fraction) break;
    if (prev->fraction==fraction) {
      prev_key=prev->line;
      if (prev_key<0)
	prev_key=tmpp->world->map->line_cnt+prev->actor.u32[0];
      if (prev_key<=key) break;
    }
    MemCpy(tmpp->hit+i,prev,sizeof(Intercept));
  }
  tmpp->hit[i].fraction=fraction;
  tmpp->hit[i].line=line; tmpp->hit[i].actor=actor; tmpp->cnt++;
}

U0 PathLine(Path *tmpp,I64 n)
{
  I64 den,num;
  ClipLine *tmpl=tmpp->world->collision->line+n;
  if (tmpp->line_seen[n]==tmpp->stamp) return;
  tmpp->line_seen[n]=tmpp->stamp;
  if (PathSide(tmpp,tmpl->ax,tmpl->ay)==
	PathSide(tmpp,tmpl->ax+tmpl->dx*65536,tmpl->ay+tmpl->dy*65536)) return;
  den=tmpp->dx*tmpl->dy-tmpp->dy*tmpl->dx;
  num=(tmpl->ax-tmpp->x)*tmpl->dy-(tmpl->ay-tmpp->y)*tmpl->dx;
  if (den<0) {den=-den; num=-num;}
  if (den && 0<=num<=den) PathHitAdd(tmpp,Fraction16(num,den),n);
}

U0 PathActor(Path *tmpp,Actor *tmpa)
{//Classic corner-to-corner hit cross-section, including exact diagonals.
  I64 n=tmpa->id.u32[0]-1,ax,ay,bx,by,dx,dy,den,num;
  if (!tmpa->active || tmpp->actor_seen[n]==tmpp->stamp) return;
  tmpp->actor_seen[n]=tmpp->stamp;
  if (!(0<=tmpa->radius<=256*65536)) throw('Radius');
  if (!tmpa->radius ||
	tmpa->x<MinI64(tmpp->x,tmpp->x+tmpp->dx)-tmpa->radius ||
	tmpa->x>MaxI64(tmpp->x,tmpp->x+tmpp->dx)+tmpa->radius ||
	tmpa->y<MinI64(tmpp->y,tmpp->y+tmpp->dy)-tmpa->radius ||
	tmpa->y>MaxI64(tmpp->y,tmpp->y+tmpp->dy)+tmpa->radius) return;
  ax=tmpa->x-tmpa->radius; bx=tmpa->x+tmpa->radius;
  if (!(tmpp->dx<0 ^^ tmpp->dy<0)) {
    ay=tmpa->y+tmpa->radius; by=tmpa->y-tmpa->radius;
  } else {
    ay=tmpa->y-tmpa->radius; by=tmpa->y+tmpa->radius;
  }
  if (PathSide(tmpp,ax,ay)==PathSide(tmpp,bx,by)) return;
  dx=bx-ax; dy=by-ay;
  den=tmpp->dx*dy-tmpp->dy*dx;
  num=(ax-tmpp->x)*dy-(ay-tmpp->y)*dx;
  if (den<0) {den=-den; num=-num;}
  if (den && 0<=num<=den)
    PathHitAdd(tmpp,Fraction16(num,den),-1,tmpa->id);
}

U0 PathCell(Path *tmpp,I64 x,I64 y)
{
  World *tmpw=tmpp->world;
  U16 *blocks=tmpw->map->blockmap;
  I64 w=blocks[2],h=blocks[3],i,n,r,bx,by,id;
  Actor *tmpa;
  if (tmpp->flags&TM_PATH_LINES && 0<=x<w && 0<=y<h) {
    i=blocks[4+x+y*w];
    while ((n=blocks[i++])!=0xFFFF) PathLine(tmpp,n);
  }
  if (tmpp->flags&TM_PATH_ACTORS) {
    r=(tmpw->max_radius+0x7FFFFF)>>23;
    for (bx=MaxI64(x-r,0);bx<=MinI64(x+r,w-1);bx++)
      for (by=MaxI64(y-r,0);by<=MinI64(y+r,h-1);by++) {
	id=tmpw->blocks[bx+by*w];
	while (tmpa=WorldActorGet(tmpw,id,FALSE)) {
	  PathActor(tmpp,tmpa); id=tmpa->block_next;
	}
      }
  }
}

Bool PathRun(Path *tmpp,I64 x,I64 y,I64 x2,I64 y2,
	I64 flags=TM_PATH_LINES|TM_PATH_ACTORS)
{//Walk every touched block, including grid edges and corners, without nudging.
  World *tmpw=tmpp->world;
  I64 ox=tmpw->map->blockmap[0]*65536,oy=tmpw->map->blockmap[1]*65536,
	bx,by,ex,ey,sx,sy,nx,ny,ax,ay,limit,*seen;
  U64 tx,ty;
  Bool edge_x,edge_y;
  tmpp->cnt=0;
  tmpp->x=x; tmpp->y=y; tmpp->dx=tmpp->dy=0;
  tmpp->flags=flags;
  if (!(-0x80000000<=x<=0x7FFFFFFF && -0x80000000<=y<=0x7FFFFFFF))
    return FALSE;
  if (!(x-0xFFFFFFFF<=x2<=x+0xFFFFFFFF &&
	y-0xFFFFFFFF<=y2<=y+0xFFFFFFFF)) return FALSE;
  tmpp->dx=x2-x; tmpp->dy=y2-y;
  ax=AbsI64(tmpp->dx); ay=AbsI64(tmpp->dy);
  if (!ax && !ay) return TRUE;
  if (tmpp->actor_cap<tmpw->slot_cap) {
    seen=CAlloc(tmpw->slot_cap*sizeof(I64));
    Free(tmpp->actor_seen); tmpp->actor_seen=seen;
    tmpp->actor_cap=tmpw->slot_cap;
  }
  if (!++tmpp->stamp) {
    MemSet(tmpp->line_seen,0,tmpw->map->line_cnt*sizeof(I64));
    MemSet(tmpp->actor_seen,0,tmpp->actor_cap*sizeof(I64)); tmpp->stamp=1;
  }
  bx=(x-ox)>>23; by=(y-oy)>>23;
  ex=(x2-ox)>>23; ey=(y2-oy)>>23;
  sx=SignI64(tmpp->dx); sy=SignI64(tmpp->dy);
  edge_x=(x-ox)&0x7FFFFF==0; edge_y=(y-oy)&0x7FFFFF==0;
  nx=(bx+1)*0x800000+ox-x;
  ny=(by+1)*0x800000+oy-y;
  if (sx<0) nx=x-bx*0x800000-ox;
  if (sy<0) ny=y-by*0x800000-oy;
  if (edge_x) PathCell(tmpp,bx-1,by);
  if (edge_y) PathCell(tmpp,bx,by-1);
  if (edge_x && edge_y) PathCell(tmpp,bx-1,by-1);
  if ((x2-ox)&0x7FFFFF==0) {
    PathCell(tmpp,ex-1,ey);
    if ((y2-oy)&0x7FFFFF==0) PathCell(tmpp,ex-1,ey-1);
  }
  if ((y2-oy)&0x7FFFFF==0) PathCell(tmpp,ex,ey-1);
  limit=AbsI64(ex-bx)+AbsI64(ey-by)+1;
  while (limit--) {
    PathCell(tmpp,bx,by);
    if (edge_x && !sx) PathCell(tmpp,bx-1,by);
    if (edge_y && !sy) PathCell(tmpp,bx,by-1);
    if (bx==ex && by==ey) return TRUE;
    if (bx==ex) {
      by+=sy; ny+=0x800000;
    } else if (by==ey) {
      bx+=sx; nx+=0x800000;
    } else {
      tx=nx*ay; ty=ny*ax;
      if (tx<ty) {
	bx+=sx; nx+=0x800000;
      } else if (ty<tx) {
	by+=sy; ny+=0x800000;
      } else {
	PathCell(tmpp,bx+sx,by); PathCell(tmpp,bx,by+sy);
	bx+=sx; by+=sy; nx+=0x800000; ny+=0x800000;
      }
    }
  }
  return FALSE;
}
