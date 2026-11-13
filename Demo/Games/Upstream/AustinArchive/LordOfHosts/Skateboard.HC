
class CSkateboard {
  I64 color;
  I64 x,y,z;
  F64 roll;
  F64 turn;
  F64 xrot;
};
#define SKATE_WIDTH 40
#define SKATE_LEN 70
#define SKATE_HEIGHT 30 
#define SKATE_WHEEL 20

U0 AssignTri(CD3I32 *t,I64 x,I64 y,I64 z) {
  t->x=x,t->y=y,t->z=z;
}

U0 DistTransform(CDC *dc,I64 *x,I64 *y,I64 *z)
{
  I64 zz;
  Mat4x4MulXYZ(dc->r,x,y,z);
  zz=400+*z;
  if (zz<1) zz=1;
  *x=400* *x/zz;
  *y=400* *y/zz;
  *x+=dc->x;
  *y+=dc->y;
  *z+=dc->z;
}

U0 DrawWheel(CDC *dc,I64 xoff,I64 yoff,I64 zoff) {
  F64 rot=tS*5,rot2;
  F64 x,y,x2,y2;
  F64 mnz=zoff,mxz=zoff,mny=yoff,mxy=yoff;
  CD3I32 tri[4],left[4],right[4];
  I64 i;
  dc->color=DKGRAY|ROPF_PROBABILITY_DITHER;
  for(i=0,rot2=0;rot2<2*pi;rot2+=pi/2,i++) {
    x=SKATE_WHEEL*Cos(rot+rot2)/2;
    y=SKATE_WHEEL*Sin(rot+rot2)/2;
    x2=SKATE_WHEEL*Cos(rot+rot2+pi/2)/2;
    y2=SKATE_WHEEL*Sin(rot+rot2+pi/2)/2;
    mnz=Min(zoff+y,mnz);
    mxz=Max(zoff+y,mxz);
    mny=Min(yoff+x,mny);
    mxy=Max(yoff+x,mxy);
    mnz=Min(zoff+y2,mnz);
    mxz=Max(zoff+y2,mxz);
    mny=Min(yoff+x2,mny);
    mxy=Max(yoff+x2,mxy);
    AssignTri(&tri[0],xoff-SKATE_WHEEL/2,yoff+x,zoff+y);
    MemCpy(&left[i],&tri[0],sizeof CD3I32);
    AssignTri(&tri[1],xoff-SKATE_WHEEL/2,yoff+x2,zoff+y2);
    AssignTri(&tri[2],xoff+SKATE_WHEEL/2,yoff+x2,zoff+y2);
    AssignTri(&tri[3],xoff+SKATE_WHEEL/2,yoff+x,zoff+y);
    MemCpy(&right[i],&tri[3],sizeof CD3I32);
    GrFillPoly3(dc,4,tri);
  }
  GrFillPoly3(dc,4,left);
  GrFillPoly3(dc,4,right);

}
U0 DrawSkateboard(CSkateboard *s,CDC *dc) {
  I64 old_c=dc->color,old_t=dc->transform;
  dc->flags|=DCF_TRANSFORMATION;
  I64 old_mat=dc->r,x=dc->x,y=dc->y,z;
  I64 mat[16];
  CD3I32 tri[4];
  dc->x=GR_WIDTH/2;
  dc->y=-100;
  dc->transform=&DistTransform;
  dc->r=mat;
  dc->color=s->color<<16|LTGREEN|ROPF_PROBABILITY_DITHER;
  dc->dither_probability_u16=U16_MAX*.75;
  Mat4x4IdentEqu(dc->r);
  Mat4x4RotZ(dc->r,s->roll);
  Mat4x4RotY(dc->r,s->turn);
  Mat4x4RotX(dc->r,s->xrot);
  Mat4x4TranslationEqu(dc->r,s->x,s->y,s->z);
//Top
  AssignTri(&tri[0],-SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  AssignTri(&tri[1],-SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  AssignTri(&tri[2],SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  AssignTri(&tri[3],SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  GrFillPoly3(dc,4,tri);
//Bottom
  AssignTri(&tri[0],-SKATE_WIDTH/2,0,-SKATE_LEN/2);
  AssignTri(&tri[1],-SKATE_WIDTH/2,0,SKATE_LEN/2);
  AssignTri(&tri[2],SKATE_WIDTH/2,0,SKATE_LEN/2);
  AssignTri(&tri[3],SKATE_WIDTH/2,0,-SKATE_LEN/2);
  GrFillPoly3(dc,4,tri);
//front
  AssignTri(&tri[0],-SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  AssignTri(&tri[1],SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  AssignTri(&tri[2],SKATE_WIDTH/2,0,-SKATE_LEN/2);
  AssignTri(&tri[3],-SKATE_WIDTH/2,0,-SKATE_LEN/2);
  GrFillPoly3(dc,4,tri);
//Back
  AssignTri(&tri[0],-SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  AssignTri(&tri[1],SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  AssignTri(&tri[2],SKATE_WIDTH/2,0,SKATE_LEN/2);
  AssignTri(&tri[3],-SKATE_WIDTH/2,0,SKATE_LEN/2);
  GrFillPoly3(dc,4,tri);
//Right
  AssignTri(&tri[0],SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  AssignTri(&tri[1],SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  AssignTri(&tri[2],SKATE_WIDTH/2,0,SKATE_LEN/2);
  AssignTri(&tri[3],SKATE_WIDTH/2,0,-SKATE_LEN/2);
  GrFillPoly3(dc,4,tri);
//Left
  AssignTri(&tri[0],-SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  AssignTri(&tri[1],-SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  AssignTri(&tri[2],-SKATE_WIDTH/2,0,SKATE_LEN/2);
  AssignTri(&tri[3],-SKATE_WIDTH/2,0,-SKATE_LEN/2);
  GrFillPoly3(dc,4,tri);

  DrawWheel(dc,-SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  DrawWheel(dc,-SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);
  DrawWheel(dc,SKATE_WIDTH/2,SKATE_HEIGHT,-SKATE_LEN/2);
  DrawWheel(dc,SKATE_WIDTH/2,SKATE_HEIGHT,SKATE_LEN/2);


  F64 scale=.3;
  U8 *blessed_son=GetLordAndSaviour;
  I64 min_x,max_x,min_y,max_y;
  SpriteExtents(blessed_son,&min_x,&max_x,&min_y,&max_y);
  CDC*jdc=DCNew((max_x-min_x)*scale,(max_y-min_y)*scale),*flipped;
  DCFill(jdc);
  jdc->flags|=DCF_TRANSFORMATION;
  dc->x=dc->width/2;
  Mat4x4Scale(jdc->r,scale);
  Sprite3B(jdc,-min_x*scale,-min_y*scale,0,blessed_son);
  if(s->turn<0) {
    flipped=DCNew(jdc->width,jdc->height);
    DCFill(flipped);
    Mat4x4TranslationEqu(flipped->r,-jdc->width,0,0);
    Mat4x4RotY(flipped->r,pi);
    flipped->flags|=DCF_TRANSFORMATION;
    GrBlot3(flipped,0,0,0,jdc);
  } else
    flipped=DCCopy(jdc);
  GrBlot3(dc,-flipped->width/2,-flipped->height,0,flipped);
  DCDel(jdc),DCDel(flipped);
  dc->transform=old_t;
  dc->color=old_c;
  dc->r=old_mat;
  dc->x=x,dc->y=y;
}



#define S_JUMP_H 300
#define S_JUMP_TIME 1.5
Bool SkateboardJump(CSkateboard *s,F64 t) { 
  static F64 last_h=0;
  F64 h;
  t=t/S_JUMP_TIME*pi;
  if(t>pi) {
    last_h=0;
    s->xrot=0;
    return TRUE;
  }
  h=Sin(t)*S_JUMP_H;
  s->y-=h;
  s->xrot=Arg(40,h-last_h);
  last_h=h;
  return FALSE;
}
U0 SkateboardScreenCords(CSkateboard *s,I64 *x,I64 *y,I64 *z) {
  I64 mat[16];
  CDC*dummy=DCNew(1,1);
  dummy->x=GR_WIDTH/2;
  dummy->y=-100;
  Mat4x4IdentEqu(dummy->r);
  Mat4x4RotZ(dummy->r,s->roll);
  Mat4x4RotY(dummy->r,s->turn);
  Mat4x4RotX(dummy->r,s->xrot);
  Mat4x4TranslationEqu(dummy->r,s->x,s->y,s->z);
 DistTransform(dummy,x,y,z);
  DCDel(dummy);
}
Bool SkateHitAnim(CSkateboard*s,F64 ox,F64 oy,F64 dx,F64 dy,F64 t) {
 s->turn=tS*5;
 t=Clamp(t,0,1);
 s->x=ox+t*(dx-ox);
 s->x=oy+t*(dy-oy);
 return t>=1;
}