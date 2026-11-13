#define TM_CONTACT_NONE		0
#define TM_CONTACT_SOLID	1
#define TM_CONTACT_PICKUP	2
#define TM_CONTACT_MISSILE	3
#define TM_CONTACT_SKULL	4

I64 WorldContactKind(World *tmpw,Actor *mover,Actor *other,I64 x,I64 y)
{//Classic actor boxes are square; only missiles test vertical separation.
  I64 radius=mover->radius+other->radius;
  Actor *source;
  if (!other->active || other==mover ||
	!(other->flags&(TM_MF_SOLID|TM_MF_SPECIAL|TM_MF_SHOOTABLE)) ||
	AbsI64(other->x-x)>=radius || AbsI64(other->y-y)>=radius)
    return TM_CONTACT_NONE;
  if (mover->flags&TM_MF_SKULLFLY) return TM_CONTACT_SKULL;
  if (mover->flags&TM_MF_MISSILE) {
    if (mover->z>other->z+other->height || mover->z+mover->height<other->z)
      return TM_CONTACT_NONE;
    if (source=WorldActorGet(tmpw,mover->target)) {
      if (source==other) return TM_CONTACT_NONE;
      if (source->type==other->type ||
	    source->type==TM_MT_KNIGHT && other->type==TM_MT_BRUISER ||
	    source->type==TM_MT_BRUISER && other->type==TM_MT_KNIGHT)
	if (other->type!=TM_MT_PLAYER) return TM_CONTACT_SOLID;
    }
    if (other->flags&TM_MF_SHOOTABLE) return TM_CONTACT_MISSILE;
    if (other->flags&TM_MF_SOLID) return TM_CONTACT_SOLID;
    return TM_CONTACT_NONE;
  }
  if (other->flags&TM_MF_SPECIAL && mover->flags&TM_MF_PICKUP)
    return TM_CONTACT_PICKUP;
  if (other->flags&TM_MF_SOLID) return TM_CONTACT_SOLID;
  return TM_CONTACT_NONE;
}

Bool WorldContacts(World *tmpw,Actor *mover,I64 x,I64 y,
	U0 (*touch)(Actor *mover,Actor *other,I64 kind)=NULL)
{//Visit nearby actor chains without exposing handles to allocation reuse.
  I64 x1,x2,y1,y2,bx,by,w,h,ox,oy,radius,id,next,kind,solid;
  I16 *blocks=tmpw->map->blockmap;
  Actor *other;
  tmpw->hit_actor=tmpw->hit_kind=0;
  if (mover->flags&TM_MF_NOCLIP) return TRUE;
  w=blocks(U16 *)[2]; h=blocks(U16 *)[3];
  ox=blocks[0]*65536; oy=blocks[1]*65536;
  radius=mover->radius+tmpw->max_radius;
  x1=MaxI64((x-radius-ox)>>23,0); x2=MinI64((x+radius-ox)>>23,w-1);
  y1=MaxI64((y-radius-oy)>>23,0); y2=MinI64((y+radius-oy)>>23,h-1);
  for (bx=x1;bx<=x2;bx++)
    for (by=y1;by<=y2;by++) {
      id=tmpw->blocks[bx+by*w];
      while (other=WorldActorGet(tmpw,id,FALSE)) {
	next=other->block_next;
	kind=WorldContactKind(tmpw,mover,other,x,y);
	if (kind) {
	  solid=other->flags&TM_MF_SOLID;
	  if (touch && kind!=TM_CONTACT_SOLID) (*touch)(mover,other,kind);
	  if (!mover->active) return FALSE;
	  if (kind!=TM_CONTACT_PICKUP || solid) {
	    tmpw->hit_actor=id; tmpw->hit_kind=kind;
	    return FALSE;
	  }
	}
	id=next;
      }
    }
  tmpw->hit_actor=tmpw->hit_kind=0;
  return TRUE;
}

Bool WorldPosition(World *tmpw,Actor *tmpa,I64 x,I64 y,
	U0 (*touch)(Actor *mover,Actor *other,I64 kind)=NULL,Bool fit=TRUE)
{//Raw queries collect bounds without the later movement fit/step/dropoff test.
  Collision *tmpc=tmpw->collision;
  I64 stamp;
  Bool res;
  CollisionBegin(tmpc,x,y,tmpa->radius,tmpa->flags,tmpa->type==TM_MT_PLAYER);
  stamp=tmpc->stamp; res=WorldContacts(tmpw,tmpa,x,y,touch);
  if (tmpc->stamp!=stamp)
    CollisionBegin(tmpc,x,y,tmpa->radius,tmpa->flags,tmpa->type==TM_MT_PLAYER);
  if (!res || !tmpa->active) return FALSE;
  return CollisionLines(tmpc,tmpa->z,tmpa->height,fit);
}
