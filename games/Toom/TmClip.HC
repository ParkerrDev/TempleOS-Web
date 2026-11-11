class ClipLine
{
  I64 ax,ay,dx,dy,left,right,bottom,top,front,back;
};

class Collision
{
  Map *map;
  ClipLine *line;
  I64 *seen,*special,stamp,special_cnt;
  I64 left,right,bottom,top,flags,sector,floor,ceil,dropoff,blocking;
  Bool player;
};

I64 FixedSide(I64 x,I64 y,I64 ax,I64 ay,I64 dx,I64 dy)
{//Classic fixed-point side tests retain their axis and integer tie rules.
  I64 left,right;
  if (!dx) {
    if (x<=ax) return dy>0;
    return dy<0;
  }
  if (!dy) {
    if (y<=ay) return dx<0;
    return dx>0;
  }
  left=(dy*(x-ax))>>16;
  right=(dx*(y-ay))>>16;
  return right>=left;
}

I64 FixedSector(Map *tmpm,I64 x,I64 y)
{
  I64 n=tmpm->node_cnt-1,s;
  Node *tmpn;
  if (n<0) n=TM_NF_SUBSECTOR;
  while (!(n&TM_NF_SUBSECTOR)) {
    tmpn=tmpm->node+n;
    s=FixedSide(x,y,tmpn->x*65536,tmpn->y*65536,tmpn->dx,tmpn->dy);
    n=tmpn->child[s];
  }
  return tmpm->subsector_sector[n&~TM_NF_SUBSECTOR];
}

U0 CollisionDel(Collision *tmpc)
{
  if (tmpc) {
    Free(tmpc->line); Free(tmpc->seen); Free(tmpc->special); Free(tmpc);
  }
}

Collision *CollisionNew(Map *tmpm)
{//Static line bounds and visited stamps keep each blockmap query small.
  I64 i;
  ClipLine *dst;
  Line *src;
  Vertex *a,*b;
  Collision *tmpc=CAlloc(sizeof(Collision));
  tmpc->map=tmpm;
  tmpc->line=MAlloc(tmpm->line_cnt*sizeof(ClipLine));
  tmpc->seen=CAlloc(tmpm->line_cnt*sizeof(I64));
  tmpc->special=MAlloc(tmpm->line_cnt*sizeof(I64));
  for (i=0;i<tmpm->line_cnt;i++) {
    dst=tmpc->line+i; src=tmpm->line+i;
    a=tmpm->vertex+src->v1; b=tmpm->vertex+src->v2;
    dst->ax=a->x*65536; dst->ay=a->y*65536;
    dst->dx=b->x-a->x; dst->dy=b->y-a->y;
    dst->left=MinI64(a->x,b->x)*65536;
    dst->right=MaxI64(a->x,b->x)*65536;
    dst->bottom=MinI64(a->y,b->y)*65536;
    dst->top=MaxI64(a->y,b->y)*65536;
    dst->front=tmpm->side[src->side[0]].sector;
    dst->back=-1;
    if (src->side[1]!=0xFFFF && src->flags&4)
      dst->back=tmpm->side[src->side[1]].sector;
  }
  return tmpc;
}

Bool BoxLineCross(Collision *tmpc,ClipLine *tmpl)
{
  I64 a,b;
  if (tmpc->right<=tmpl->left || tmpc->left>=tmpl->right ||
	tmpc->top<=tmpl->bottom || tmpc->bottom>=tmpl->top)
    return FALSE;
  if (tmpl->dx<0 ^^ tmpl->dy<0) {
    a=FixedSide(tmpc->right,tmpc->top,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
    b=FixedSide(tmpc->left,tmpc->bottom,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
  } else {
    a=FixedSide(tmpc->left,tmpc->top,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
    b=FixedSide(tmpc->right,tmpc->bottom,tmpl->ax,tmpl->ay,tmpl->dx,tmpl->dy);
  }
  return a!=b;
}

Bool CollisionLine(Collision *tmpc,I64 n)
{//Only touching portals restrict headroom, steps and dropoffs.
  ClipLine *tmpl=tmpc->line+n;
  Line *line=tmpc->map->line+n;
  Sector *front,*back;
  if (!BoxLineCross(tmpc,tmpl)) return TRUE;
  if (tmpl->back<0) goto cl_block;
  if (!(tmpc->flags&TM_MF_MISSILE)) {
    if (line->flags&1) goto cl_block;
    if (!tmpc->player && line->flags&2) goto cl_block;
  }
  front=tmpc->map->sector+tmpl->front;
  back=tmpc->map->sector+tmpl->back;
  tmpc->ceil=MinI64(tmpc->ceil,MinI64(front->ceil,back->ceil)*65536);
  tmpc->floor=MaxI64(tmpc->floor,MaxI64(front->floor,back->floor)*65536);
  tmpc->dropoff=MinI64(tmpc->dropoff,MinI64(front->floor,back->floor)*65536);
  if (line->special) tmpc->special[tmpc->special_cnt++]=n;
  return TRUE;
cl_block:
  tmpc->blocking=n;
  return FALSE;
}

U0 CollisionBegin(Collision *tmpc,I64 x,I64 y,I64 radius,I64 flags,
	Bool player=FALSE)
{//Actor contacts and map lines share the same initialized position query.
  Map *tmpm=tmpc->map;
  Sector *tmps;
  tmpc->sector=FixedSector(tmpm,x,y);
  tmps=tmpm->sector+tmpc->sector;
  tmpc->floor=tmpc->dropoff=tmps->floor*65536;
  tmpc->ceil=tmps->ceil*65536;
  tmpc->flags=flags; tmpc->player=player;
  tmpc->special_cnt=0; tmpc->blocking=-1;
  tmpc->left=x-radius; tmpc->right=x+radius;
  tmpc->bottom=y-radius; tmpc->top=y+radius;
  if (!++tmpc->stamp) {
    MemSet(tmpc->seen,0,tmpm->line_cnt*sizeof(I64));
    tmpc->stamp=1;
  }
}

Bool CollisionLines(Collision *tmpc,I64 z,I64 height)
{
  I64 x1,x2,y1,y2,bx,by,i,n,w,h,ox,oy,flags=tmpc->flags;
  Map *tmpm=tmpc->map;
  U16 *blocks=tmpm->blockmap;
  if (flags&TM_MF_NOCLIP) return TRUE;
  w=blocks[2]; h=blocks[3];
  ox=tmpm->blockmap[0]*65536; oy=tmpm->blockmap[1]*65536;
  x1=MaxI64((tmpc->left-ox)>>23,0);
  x2=MinI64((tmpc->right-ox)>>23,w-1);
  y1=MaxI64((tmpc->bottom-oy)>>23,0);
  y2=MinI64((tmpc->top-oy)>>23,h-1);
  for (bx=x1;bx<=x2;bx++)
    for (by=y1;by<=y2;by++) {
      i=blocks[4+bx+by*w];
      while ((n=blocks[i++])!=0xFFFF)
	if (tmpc->seen[n]!=tmpc->stamp) {
	  tmpc->seen[n]=tmpc->stamp;
	  if (!CollisionLine(tmpc,n)) return FALSE;
	}
    }
  if (tmpc->ceil-tmpc->floor<height) return FALSE;
  if (!(flags&TM_MF_TELEPORT))
    if (tmpc->ceil-z<height || tmpc->floor-z>24*65536) return FALSE;
  if (!(flags&(TM_MF_DROPOFF|TM_MF_FLOAT)) &&
	tmpc->floor-tmpc->dropoff>24*65536) return FALSE;
  return TRUE;
}

Bool CollisionCheck(Collision *tmpc,I64 x,I64 y,I64 z,I64 radius,
	I64 height,I64 flags,Bool player=FALSE)
{//A pure static-map query, also used independently of world actors.
  CollisionBegin(tmpc,x,y,radius,flags,player);
  return CollisionLines(tmpc,z,height);
}
